import { describe, expect, test } from "bun:test";
import { isMembershipMessage } from "@weavo/membership";
import { MSG_MEMBERSHIP, MSG_SYNC_REQUEST } from "../src/codec";
import { createTransport } from "../src/transport";
import type { Message, RawTransport } from "../src/types";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const createMemoryRaw = (): {
  raw: RawTransport;
  deliver: (data: Uint8Array) => void;
  sent: Uint8Array[];
} => {
  const sent: Uint8Array[] = [];
  const handlers = new Set<(data: Uint8Array) => void>();

  const raw: RawTransport = {
    connect() {},
    disconnect() {},
    send(data) {
      sent.push(data);
    },
    onMessage(cb) {
      handlers.add(cb);
      return () => handlers.delete(cb);
    },
    onOpen() {
      return () => {};
    },
    onClose() {
      return () => {};
    },
  };

  return {
    raw,
    sent,
    deliver(data) {
      for (const cb of handlers) cb(data);
    },
  };
};

describe("createTransport binary messages", () => {
  test("round-trips sync requests", () => {
    const { raw, sent, deliver } = createMemoryRaw();
    const transport = createTransport(raw);
    const received: Message[] = [];
    transport.onMessage((m) => received.push(m));

    transport.send({
      type: "sync-request",
      clientId: ALICE,
      vector: new Map([[ALICE, 2]]),
    });

    expect(sent[0]![0]).toBe(1);
    expect(sent[0]![1]).toBe(MSG_SYNC_REQUEST);

    deliver(sent[0]!);
    expect(received[0]).toEqual({
      type: "sync-request",
      clientId: ALICE,
      vector: new Map([[ALICE, 2]]),
    });
  });

  test("round-trips membership messages unchanged", () => {
    const { raw, sent, deliver } = createMemoryRaw();
    const transport = createTransport(raw);
    const received: Message[] = [];
    transport.onMessage((m) => received.push(m));

    const join = {
      type: "JOIN_REQUEST" as const,
      clientId: BOB,
    };
    const prepare = {
      type: "PREPARE" as const,
      ballot: { epoch: 1, proposer: ALICE },
      version: 2,
    };

    transport.send(join);
    transport.send(prepare);

    expect(sent[0]![1]).toBe(MSG_MEMBERSHIP);
    expect(sent[1]![1]).toBe(MSG_MEMBERSHIP);

    deliver(sent[0]!);
    deliver(sent[1]!);

    expect(received).toEqual([join, prepare]);
    expect(isMembershipMessage(received[0])).toBe(true);
  });
});
