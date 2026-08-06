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
  test("starts unjoined with an empty membership table", () => {
    const membership = createMembership(() => {}, { clientId: ALICE });

    expect(membership.isJoined()).toBe(false);
    expect(membership.getCurrent()?.members).toEqual([]);
    expect(membership.shortIdOf(ALICE)).toBeNull();
  });

  test("seeds joined when initialMembers includes self", () => {
    const membership = createMembership(() => {}, {
      clientId: ALICE,
      initialMembers: [ALICE],
    });

    expect(membership.isJoined()).toBe(true);
    expect(membership.shortIdOf(ALICE)).toBe(0);
  });

  test("solo requestJoin founds the room and emits JOIN_RESPONSE", () => {
    const bus: MembershipMessage[] = [];
    const membership = createMembership((msg) => bus.push(msg), {
      clientId: ALICE,
      foundingGraceMs: 0,
    });

    const joined: unknown[] = [];
    membership.onJoined((m) => joined.push(m));

    membership.requestJoin();
    jest.advanceTimersByTime(0); // founding grace
    jest.advanceTimersByTime(200); // proposal batch window

    expect(membership.isJoined()).toBe(true);
    expect(membership.getCurrent()?.members.map((m) => m.clientId)).toEqual([
      ALICE,
    ]);
    expect(bus.some((m) => m.type === "JOIN_RESPONSE")).toBe(true);
    expect(joined).toHaveLength(1);
  });

  test("JOIN_RESPONSE commits and marks the joiner as joined", () => {
    const membership = createMembership(() => {}, { clientId: BOB });
    expect(membership.isJoined()).toBe(false);

    membership.onMessage({
      type: "JOIN_RESPONSE",
      membership: {
        version: 1,
        members: [
          { clientId: ALICE, shortId: 0 },
          { clientId: BOB, shortId: 1 },
        ],
      },
    });

    expect(membership.isJoined()).toBe(true);
    expect(membership.store.currentVersion).toBe(1);
    expect(membership.shortIdOf(BOB)).toBe(1);
  });

  test("MEMBERSHIP_RESPONSE commits into the store", () => {
    const membership = createMembership(() => {}, {
      clientId: ALICE,
      initialMembers: [ALICE],
    });
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
