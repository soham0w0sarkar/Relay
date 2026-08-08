import "./setup";
import { describe, expect, test } from "bun:test";
import {
  createInsertOperation,
  ROOT_ID,
  type ClientId,
  type Operation,
} from "@weavo/core";
import { buildMembership } from "@weavo/membership";
import {
  decodeMessage,
  encodeMessage,
  type IdCodec,
  type Message,
  type RawTransport,
} from "@weavo/transport";
import { createWeavo } from "../src/Document";
import { createTextarea, flushMicrotasks } from "./helpers/editor";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

const V2 = buildMembership(2, [ALICE, BOB]);

const peerCodec: IdCodec = {
  encodeVersion: () => V2.version,
  shortIdOf: (id) => V2.members.find((m) => m.clientId === id)?.shortId ?? null,
  clientIdOf: (version, shortId) =>
    version === V2.version
      ? (V2.members.find((m) => m.shortId === shortId)?.clientId ?? null)
      : null,
  hasVersion: (version) => version === V2.version,
};

const createControlledTransport = () => {
  const sent: Uint8Array[] = [];
  const handlers = new Set<(data: Uint8Array) => void>();
  const openHandlers = new Set<() => void>();

  const raw: RawTransport = {
    connect() {
      queueMicrotask(() => {
        for (const cb of openHandlers) cb();
      });
    },
    disconnect() {},
    send(data) {
      sent.push(data);
    },
    onMessage(cb) {
      handlers.add(cb);
      return () => handlers.delete(cb);
    },
    onOpen(cb) {
      openHandlers.add(cb);
      return () => openHandlers.delete(cb);
    },
    onClose() {
      return () => {};
    },
  };

  return {
    raw,
    received: () => sent.map((data) => decodeMessage(data)),
    deliver(message: Message, codec?: IdCodec) {
      const data = encodeMessage(message, codec);
      for (const cb of handlers) cb(data);
    },
  };
};

describe("ops encoded against an unknown membership version", () => {
  test("wait in the buffer, then apply once the table arrives", async () => {
    const { raw, received, deliver } = createControlledTransport();
    const weavo = createWeavo(raw, {
      clientId: ALICE,
      initialMembers: [ALICE],
      initialVersion: 1,
      foundingGraceMs: 0,
      heartbeatIntervalMs: 0,
    });
    const el = createTextarea();
    weavo.bind(el);
    await flushMicrotasks();

    expect(weavo.membership.isJoined()).toBe(true);
    expect(weavo.membership.getVersion(V2.version)).toBeNull();

    const op: Operation = createInsertOperation([BOB, 0], "x", ROOT_ID, null);
    deliver({ type: "op", op }, peerCodec);

    expect(el.value).toBe("");
    expect(received()).toContainEqual({
      type: "MEMBERSHIP_REQUEST",
      version: V2.version,
      requesterId: ALICE,
    });

    deliver({
      type: "MEMBERSHIP_RESPONSE",
      version: V2.version,
      membership: V2,
    });

    expect(el.value).toBe("x");

    weavo.disconnect();
    el.remove();
  });
});
