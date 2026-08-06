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
  readVarint,
  writeVarint,
} from "../src/codec";
import { createReader, createWriter, toBytes } from "../src/codec/buffer";
import type { Message } from "../src/types";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

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

  test("is binary but retains the full UUID", () => {
    const operation = createInsertOperation([ALICE, 3], "a", ROOT_ID, null);
    const binary = encodeOperation(operation);

    expect(binary).toContain(0xaa);
    expect(binary.byteLength).toBeGreaterThanOrEqual(16);
    expect(binary.byteLength).toBeLessThan(JSON.stringify(operation).length);
  });
});

describe("message codec", () => {
  const roundTrip = (message: Message): Message =>
    decodeMessage(encodeMessage(message));

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
    const message: Message = {
      type: "JOIN_REQUEST",
      clientId: BOB,
    };
    expect(roundTrip(message)).toEqual(message);
  });
});
