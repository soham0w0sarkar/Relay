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
  jest.useFakeTimers();
  spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("createMembership", () => {
  test("seeds store with the local client and exposes shortIds", () => {
    const membership = createMembership(() => {}, { clientId: ALICE });

    expect(membership.getCurrent()?.version).toBe(0);
    expect(membership.shortIdOf(ALICE)).toBe(0);
    expect(membership.shortIdOf(BOB)).toBeNull();
  });

  test("solo requestJoin runs PREPARE→COMMIT via onMessage routing", () => {
    const bus: MembershipMessage[] = [];
    const membership = createMembership((msg) => bus.push(msg), {
      clientId: ALICE,
    });

    membership.requestJoin(BOB);

    // Drain any immediate local-only side effects, then fire batch timer
    const drain = () => {
      while (bus.length > 0) {
        const batch = bus.splice(0);
        for (const msg of batch) membership.onMessage(msg);
      }
    };

    drain();
    jest.advanceTimersByTime(200);
    drain();

    expect(membership.store.currentVersion).toBe(1);
    expect(membership.getCurrent()?.members.map((m) => m.clientId)).toEqual([
      ALICE,
      BOB,
    ]);
    expect(membership.shortIdOf(BOB)).toBe(1);
  });

  test("MEMBERSHIP_RESPONSE commits into the store", () => {
    const membership = createMembership(() => {}, { clientId: ALICE });
    membership.onMessage({
      type: "MEMBERSHIP_RESPONSE",
      version: 2,
      membership: {
        version: 2,
        members: [
          { clientId: ALICE, shortId: 0 },
          { clientId: BOB, shortId: 1 },
        ],
      },
    });

    expect(membership.store.currentVersion).toBe(2);
    expect(membership.getVersion(2)?.members).toHaveLength(2);
  });
});
