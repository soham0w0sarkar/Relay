import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import {
  createPresence,
  createPresenceTracker,
  evictStale,
  mergePresence,
  updatePresence,
  type PresenceEntry,
} from "../../src/presence";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

const entry = (
  clientId: ClientId,
  timestamp: number,
  cursor = 0,
): PresenceEntry => ({
  clientId,
  cursor,
  name: clientId.slice(0, 4),
  color: "#f00",
  timestamp,
  membershipVersion: 1,
  sv: { [clientId]: 1 },
});

describe("presence LWW", () => {
  test("keeps the higher timestamp for the same client", () => {
    const presence = createPresence();

    expect(updatePresence(presence, entry(ALICE, 10, 1))).toBe(true);
    expect(updatePresence(presence, entry(ALICE, 5, 99))).toBe(false);
    expect(presence.get(ALICE)?.cursor).toBe(1);

    expect(updatePresence(presence, entry(ALICE, 20, 7))).toBe(true);
    expect(presence.get(ALICE)?.cursor).toBe(7);
  });

  test("merge is union with LWW on overlaps", () => {
    const a = createPresence();
    const b = createPresence();
    updatePresence(a, entry(ALICE, 10, 1));
    updatePresence(a, entry(BOB, 5, 2));
    updatePresence(b, entry(ALICE, 20, 9));
    updatePresence(b, entry(BOB, 1, 8));

    const merged = mergePresence(a, b);
    expect(merged.get(ALICE)?.cursor).toBe(9);
    expect(merged.get(BOB)?.cursor).toBe(2);
  });

  test("evicts entries older than the timeout", () => {
    const presence = createPresence();
    updatePresence(presence, entry(ALICE, 1_000, 1));
    updatePresence(presence, entry(BOB, 9_500, 2));

    expect(evictStale(presence, 10_000, 11_000)).toEqual([ALICE]);
    expect(presence.has(ALICE)).toBe(false);
    expect(presence.has(BOB)).toBe(true);
  });
});

describe("createPresenceTracker", () => {
  test("applies heartbeats and snapshots peer-facing fields", () => {
    let now = 1_000;
    const tracker = createPresenceTracker({
      clientId: ALICE,
      timeoutMs: 10_000,
      now: () => now,
    });

    expect(
      tracker.fromHeartbeat({
        clientId: BOB,
        membershipVersion: 2,
        timestamp: 1_000,
        presence: { cursor: 4, name: "bob", color: "#0f0" },
        sv: { [BOB]: 3 },
      }),
    ).toBe(true);

    expect(tracker.snapshot().get(BOB)).toEqual({
      clientId: BOB,
      cursor: 4,
      name: "bob",
      color: "#0f0",
    });

    now = 12_000;
    expect(tracker.evictStale()).toEqual([BOB]);
    expect(tracker.snapshot().size).toBe(0);
  });
});
