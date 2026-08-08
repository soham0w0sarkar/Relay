import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  spyOn,
  test,
} from "bun:test";
import type { ClientId } from "@weavo/core";
import { createMembership } from "../../src/membership";
import type { MembershipMessage } from "../../src/types";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

beforeEach(() => {
  jest.useFakeTimers({ now: 1_000 });
  spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("createMembership presence", () => {
  test("broadcasts heartbeats after join and applies remote ones", () => {
    const bus: MembershipMessage[] = [];
    const alice = createMembership((msg) => bus.push(msg), {
      clientId: ALICE,
      initialMembers: [ALICE],
      heartbeatIntervalMs: 2_000,
      getPresence: () => ({ cursor: 3, name: "alice", color: "#111" }),
      getStateVector: () => ({ [ALICE]: 2 }),
    });

    expect(bus.filter((m) => m.type === "HEARTBEAT")).toHaveLength(1);

    jest.advanceTimersByTime(2_000);
    expect(bus.filter((m) => m.type === "HEARTBEAT")).toHaveLength(2);

    const updates: number[] = [];
    alice.onPresence((peers) => updates.push(peers.size));

    alice.onMessage({
      type: "HEARTBEAT",
      clientId: BOB,
      membershipVersion: 1,
      timestamp: Date.now(),
      presence: { cursor: 9, name: "bob", color: "#222" },
      sv: { [BOB]: 1 },
    });

    expect(alice.getPresence().get(BOB)?.cursor).toBe(9);
    expect(alice.getPresence().get(ALICE)?.name).toBe("alice");
    expect(updates.at(-1)).toBe(2);

    alice.cancel();
  });

  test("evicts stale peers from the presence map", () => {
    const alice = createMembership(() => {}, {
      clientId: ALICE,
      initialMembers: [ALICE],
      heartbeatIntervalMs: 0,
      presenceTimeoutMs: 10_000,
    });

    alice.onMessage({
      type: "HEARTBEAT",
      clientId: BOB,
      membershipVersion: 1,
      timestamp: 1_000,
      presence: { cursor: 1, name: "bob", color: "#222" },
      sv: {},
    });
    expect(alice.getPresence().has(BOB)).toBe(true);

    jest.setSystemTime(12_000);
    alice.onMessage({
      type: "HEARTBEAT",
      clientId: ALICE,
      membershipVersion: 1,
      timestamp: 12_000,
      presence: { cursor: 0, name: "alice", color: "#111" },
      sv: {},
    });

    expect(alice.getPresence().has(BOB)).toBe(false);
    alice.cancel();
  });
});
