import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import {
  addMember,
  buildMembership,
  getShortId,
  removeMember,
} from "../../src/membershipStore";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as ClientId;

describe("MembershipTable", () => {
  test("buildMembership sorts clientIds and assigns shortId by index", () => {
    const membership = buildMembership(1, [CAROL, ALICE, BOB]);

    expect(membership.version).toBe(1);
    expect(membership.members.map((m) => m.clientId)).toEqual([
      ALICE,
      BOB,
      CAROL,
    ]);
    expect(membership.members.map((m) => m.shortId)).toEqual([0, 1, 2]);
  });

  test("buildMembership is deterministic for the same set", () => {
    const a = buildMembership(3, [BOB, ALICE, CAROL]);
    const b = buildMembership(3, [CAROL, BOB, ALICE]);
    expect(a).toEqual(b);
  });

  test("addMember bumps version and reassigns shortIds", () => {
    const base = buildMembership(0, [BOB, CAROL]);
    const next = addMember(base, ALICE);

    expect(next.version).toBe(1);
    expect(next.members).toEqual([
      { clientId: ALICE, shortId: 0 },
      { clientId: BOB, shortId: 1 },
      { clientId: CAROL, shortId: 2 },
    ]);
    expect(base.members).toHaveLength(2);
  });

  test("removeMember bumps version and packs shortIds", () => {
    const base = buildMembership(2, [ALICE, BOB, CAROL]);
    const next = removeMember(base, BOB);

    expect(next.version).toBe(3);
    expect(next.members).toEqual([
      { clientId: ALICE, shortId: 0 },
      { clientId: CAROL, shortId: 1 },
    ]);
  });

  test("removeMember of unknown id still bumps version", () => {
    const base = buildMembership(1, [ALICE]);
    const next = removeMember(base, BOB);
    expect(next.version).toBe(2);
    expect(next.members).toEqual([{ clientId: ALICE, shortId: 0 }]);
  });

  test("buildMembership dedupes repeated clientIds before assigning shortIds", () => {
    const membership = buildMembership(1, [BOB, ALICE, BOB, ALICE]);
    expect(membership.members).toEqual([
      { clientId: ALICE, shortId: 0 },
      { clientId: BOB, shortId: 1 },
    ]);
  });

  test("getShortId returns index or null", () => {
    const membership = buildMembership(1, [ALICE, BOB]);
    expect(getShortId(membership, ALICE)).toBe(0);
    expect(getShortId(membership, BOB)).toBe(1);
    expect(getShortId(membership, CAROL)).toBeNull();
  });
});
