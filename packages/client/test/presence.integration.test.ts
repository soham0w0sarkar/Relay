import "./setup";
import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import { createWeavo } from "../src/Document";
import {
  createTextarea,
  flushMicrotasks,
  insertText,
  waitUntilJoined,
} from "./helpers/editor";
import { MemoryRoom } from "./helpers/memoryTransport";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

describe("presence heartbeats", () => {
  test("peers learn each other's cursor name and color", async () => {
    const room = new MemoryRoom();

    const aliceSeen: string[] = [];
    const alice = createWeavo(room.join(), {
      clientId: ALICE,
      foundingGraceMs: 0,
      name: "Alice",
      color: "#a00",
      heartbeatIntervalMs: 50,
    });
    const aliceEl = createTextarea();
    alice.bind(aliceEl);
    alice.onPresence((peers) => {
      const bob = peers.get(BOB);
      if (bob) aliceSeen.push(`${bob.name}:${bob.color}:${bob.cursor}`);
    });

    await waitUntilJoined(alice);
    insertText(aliceEl, "hello world");
    aliceEl.focus();
    aliceEl.selectionStart = 4;
    aliceEl.selectionEnd = 4;

    const bob = createWeavo(room.join(), {
      clientId: BOB,
      foundingGraceMs: 5_000,
      name: "Bob",
      color: "#00a",
      heartbeatIntervalMs: 50,
    });
    const bobEl = createTextarea();
    bob.bind(bobEl);
    await waitUntilJoined(bob);
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 200));

    bobEl.focus();
    bobEl.selectionStart = 7;
    bobEl.selectionEnd = 7;

    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 180));

    expect(alice.getPresence().get(BOB)).toMatchObject({
      name: "Bob",
      color: "#00a",
      cursor: 7,
    });
    expect(bob.getPresence().get(ALICE)).toMatchObject({
      name: "Alice",
      color: "#a00",
      cursor: 4,
    });
    expect(aliceSeen.some((row) => row === "Bob:#00a:7")).toBe(true);

    alice.disconnect();
    bob.disconnect();
    aliceEl.remove();
    bobEl.remove();
  });

  test("an author's caret follows their ops without waiting for a heartbeat", async () => {
    const room = new MemoryRoom();
    const heartbeatIntervalMs = 400;

    const alice = createWeavo(room.join(), {
      clientId: ALICE,
      foundingGraceMs: 0,
      name: "Alice",
      color: "#a00",
      heartbeatIntervalMs,
    });
    const aliceEl = createTextarea();
    alice.bind(aliceEl);
    await waitUntilJoined(alice);

    const bob = createWeavo(room.join(), {
      clientId: BOB,
      foundingGraceMs: 5_000,
      name: "Bob",
      color: "#00a",
      heartbeatIntervalMs,
    });
    const bobEl = createTextarea();
    bob.bind(bobEl);
    await waitUntilJoined(bob);
    await new Promise((resolve) => setTimeout(resolve, heartbeatIntervalMs + 50));

    expect(alice.getPresence().get(BOB)?.cursor).toBe(0);

    const notified: number[] = [];
    const unsub = alice.onPresence((peers) => {
      const seen = peers.get(BOB);
      if (seen) notified.push(seen.cursor);
    });

    bobEl.focus();
    bobEl.selectionStart = 0;
    bobEl.selectionEnd = 0;
    insertText(bobEl, "hello");

    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(alice.getPresence().get(BOB)?.cursor).toBe(5);
    expect(notified.at(-1)).toBe(5);

    unsub();
    alice.disconnect();
    bob.disconnect();
    aliceEl.remove();
    bobEl.remove();
  });
});
