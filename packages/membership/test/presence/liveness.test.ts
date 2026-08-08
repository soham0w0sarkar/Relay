import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import { createLivenessTracker } from "../../src/presence/liveness";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

describe("liveness tracker", () => {
  test("marks suspect then expired from lastSeen", () => {
    let now = 1_000;
    const liveness = createLivenessTracker({
      presenceTimeoutMs: 10_000,
      removalTimeoutMs: 30_000,
      now: () => now,
    });

    liveness.touch(BOB, 1_000);

    now = 11_000;
    expect(liveness.sweep()).toEqual({ suspected: [BOB], expired: [] });
    expect(liveness.get(BOB)?.status).toBe("suspect");

    now = 20_000;
    expect(liveness.sweep()).toEqual({ suspected: [], expired: [] });

    now = 31_000;
    expect(liveness.sweep()).toEqual({ suspected: [], expired: [BOB] });
  });

  test("touch revives a suspect peer", () => {
    let now = 1_000;
    const liveness = createLivenessTracker({
      presenceTimeoutMs: 10_000,
      removalTimeoutMs: 30_000,
      now: () => now,
    });

    liveness.touch(BOB, 1_000);
    now = 12_000;
    liveness.sweep();
    expect(liveness.get(BOB)?.status).toBe("suspect");

    now = 13_000;
    liveness.touch(BOB, now);
    expect(liveness.get(BOB)?.status).toBe("alive");
    expect(liveness.sweep()).toEqual({ suspected: [], expired: [] });
  });

  test("syncMembers drops peers removed from membership", () => {
    const liveness = createLivenessTracker();
    liveness.seed([ALICE, BOB], 1_000);
    expect(liveness.syncMembers([ALICE], 2_000)).toEqual([BOB]);
    expect(liveness.get(BOB)).toBeUndefined();
    expect(liveness.get(ALICE)?.lastSeen).toBe(1_000);
  });
});
