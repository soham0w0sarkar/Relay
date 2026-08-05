import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import {
  buildMembership,
  commit,
  createMembershipStore,
  get,
} from "../../src/membershipStore";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

describe("MembershipStore", () => {
  test("createMembershipStore seeds current version and record", () => {
    const initial = buildMembership(0, [ALICE]);
    const store = createMembershipStore(initial);

    expect(store.currentVersion).toBe(0);
    expect(get(store, 0)).toEqual(initial);
    expect(get(store, 1)).toBeNull();
  });

  test("commit installs a new version without dropping history", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const next = buildMembership(1, [ALICE, BOB]);

    commit(store, next);

    expect(store.currentVersion).toBe(1);
    expect(get(store, 0)?.members.map((m) => m.clientId)).toEqual([ALICE]);
    expect(get(store, 1)).toEqual(next);
  });

  test("commit can overwrite the same version key", () => {
    const store = createMembershipStore(buildMembership(1, [ALICE]));
    const replacement = buildMembership(1, [ALICE, BOB]);

    commit(store, replacement);

    expect(store.currentVersion).toBe(1);
    expect(get(store, 1)).toEqual(replacement);
  });
});
