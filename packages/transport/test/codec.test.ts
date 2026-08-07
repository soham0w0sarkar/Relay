import { describe, expect, test } from "bun:test";
import {
  createDeleteOperation,
  createInsertOperation,
  ROOT_ID,
  type ClientId,
} from "@weavo/core";
import {
  decodeMessage,
  decodeOperation,
  encodeMessage,
  encodeOperation,
  MissingMembershipVersionError,
  OP_ID_SHORT,
  OP_ID_UUID,
  readVarint,
  WIRE_VERSION,
  writeVarint,
  type IdCodec,
} from "../src/codec";
import { createReader, createWriter, toBytes } from "../src/codec/buffer";
import type { Message } from "../src/types";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

const table = new Map<ClientId, number>([
  [ALICE, 0],
  [BOB, 1],
]);
const byShort = new Map<number, ClientId>([
  [0, ALICE],
  [1, BOB],
]);

const shortCodec = (version = 1): IdCodec => ({
  encodeVersion: () => version,
  shortIdOf: (id) => table.get(id) ?? null,
  clientIdOf: (v, shortId) => (v === version ? (byShort.get(shortId) ?? null) : null),
  hasVersion: (v) => v === version,
});

describe("varint", () => {
  test.each([0, 1, 127, 128, 16_383, 1_000_000, 0xffff_ffff])(
    "round-trips %d",
    (value) => {
      const writer = createWriter();
      writeVarint(writer, value);
      expect(readVarint(createReader(toBytes(writer)))).toBe(value);
    },
  );
});

describe("operation codec with UUID identifiers", () => {
  test("round-trips insert variants, delete, and ROOT", () => {
    const operations = [
      createInsertOperation([ALICE, 3], "a", ROOT_ID, null),
      createInsertOperation([BOB, 4], "hi", [ALICE, 3], [ALICE, 5]),
      createDeleteOperation([BOB, 4]),
    ];

    for (const operation of operations) {
      expect(decodeOperation(encodeOperation(operation))).toEqual(operation);
    }
  });

  test("is binary but retains the full UUID without a membership table", () => {
    const operation = createInsertOperation([ALICE, 3], "a", ROOT_ID, null);
    const binary = encodeOperation(operation);

    expect(binary).toContain(0xaa);
    expect(binary.byteLength).toBeGreaterThanOrEqual(16);
    expect(binary.byteLength).toBeLessThan(JSON.stringify(operation).length);
  });
});

describe("operation codec with shortIds", () => {
  test("round-trips through shortId tags and shrinks vs UUID form", () => {
    const codec = shortCodec();
    const operation = createInsertOperation([ALICE, 3], "a", ROOT_ID, null);
    const uuidForm = encodeOperation(operation);
    const shortForm = encodeOperation(operation, codec);

    expect(decodeOperation(shortForm, 1, codec)).toEqual(operation);
    expect(shortForm).toContain(OP_ID_SHORT);
    expect(shortForm).not.toContain(0xaa);
    expect(shortForm.byteLength).toBeLessThan(uuidForm.byteLength);
  });

  test("falls back to UUID when the client is not in the table", () => {
    const codec = shortCodec();
    const outsider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as ClientId;
    const operation = createInsertOperation([outsider, 1], "x", ROOT_ID, null);
    const binary = encodeOperation(operation, codec);

    expect(binary).toContain(OP_ID_UUID);
    expect(decodeOperation(binary, 1, codec)).toEqual(operation);
  });
});

describe("message codec", () => {
  const roundTrip = (message: Message, codec?: IdCodec): Message =>
    decodeMessage(encodeMessage(message, codec), codec);

  test("round-trips op", () => {
    const message: Message = {
      type: "op",
      op: createInsertOperation([ALICE, 1], "z", ROOT_ID, null),
    };
    expect(roundTrip(message)).toEqual(message);
  });

  test("round-trips sync request and response", () => {
    const request: Message = {
      type: "sync-request",
      vector: new Map([
        [ALICE, 2],
        [BOB, 1],
      ]),
      clientId: ALICE,
    };
    const response: Message = {
      type: "sync-response",
      ops: [createInsertOperation([ALICE, 1], "z", ROOT_ID, null)],
      clientIds: [ALICE, BOB],
    };

    expect(roundTrip(request)).toEqual(request);
    expect(roundTrip(response)).toEqual(response);
  });

  test("round-trips membership messages in a binary frame", () => {
    const membership = {
      version: 2,
      members: [
        { clientId: ALICE, shortId: 0 },
        { clientId: BOB, shortId: 1 },
      ],
    };

    const messages: Message[] = [
      { type: "JOIN_REQUEST", clientId: BOB },
      { type: "JOIN_RESPONSE", membership },
      { type: "LEAVE", clientId: BOB },
      {
        type: "PREPARE",
        ballot: { epoch: 3, proposer: ALICE },
        version: 2,
      },
      {
        type: "PROMISE",
        ballot: { epoch: 3, proposer: ALICE },
        version: 2,
        senderId: BOB,
        lastAcceptedBallot: null,
        lastAcceptedMembership: null,
      },
      {
        type: "PROMISE",
        ballot: { epoch: 4, proposer: ALICE },
        version: 2,
        senderId: BOB,
        lastAcceptedBallot: { epoch: 2, proposer: BOB },
        lastAcceptedMembership: membership,
      },
      {
        type: "ACCEPT",
        ballot: { epoch: 3, proposer: ALICE },
        version: 2,
        membership,
      },
      {
        type: "ACCEPTED",
        ballot: { epoch: 3, proposer: ALICE },
        version: 2,
        peerId: BOB,
      },
      { type: "COMMIT", version: 2, membership },
      {
        type: "MEMBERSHIP_REQUEST",
        version: 2,
        requesterId: BOB,
      },
      {
        type: "MEMBERSHIP_RESPONSE",
        version: 2,
        membership,
      },
      {
        type: "HEARTBEAT",
        clientId: ALICE,
        membershipVersion: 2,
        timestamp: 1_700_000_000_000,
        presence: { cursor: 4, name: "alice", color: "#f00" },
        sv: { [ALICE]: 3, [BOB]: 1 },
      },
    ];

    for (const message of messages) {
      const bytes = encodeMessage(message);
      expect(bytes[1]).toBe(0x04); // MSG_MEMBERSHIP
      expect(bytes.byteLength).toBeLessThan(
        JSON.stringify(message).length + 8,
      );
      expect(decodeMessage(bytes)).toEqual(message);
    }
  });

  test("embeds membership version and compresses ids", () => {
    const codec = shortCodec(2);
    const message: Message = {
      type: "op",
      op: createInsertOperation([BOB, 4], "hi", [ALICE, 3], null),
    };
    const bytes = encodeMessage(message, codec);

    expect(bytes[0]).toBe(WIRE_VERSION);
    expect(decodeMessage(bytes, codec)).toEqual(message);

    const uuidBytes = encodeMessage(message);
    expect(bytes.byteLength).toBeLessThan(uuidBytes.byteLength);
  });

  test("missing membership version throws before invoking codec callback", () => {
    const missing: number[] = [];
    const codec: IdCodec = {
      ...shortCodec(1),
      hasVersion: (v) => v === 1,
      onMissingVersion: (v) => missing.push(v),
    };
    const foreign: IdCodec = shortCodec(9);
    const bytes = encodeMessage(
      {
        type: "op",
        op: createInsertOperation([ALICE, 1], "z", ROOT_ID, null),
      },
      foreign,
    );

    expect(() => decodeMessage(bytes, codec)).toThrow(
      MissingMembershipVersionError,
    );
    expect(missing).toEqual([]);
  });
});
