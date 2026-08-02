import type { Membership, MembershipStore } from "./types";

export const createMembershipStore = (initial: Membership): MembershipStore => {
  return {
    currentVersion: initial.version,
    membershipRecord: new Map([[initial.version, initial]]),
  };
};

export const commit = (store: MembershipStore, membership: Membership) => {
  store.membershipRecord.set(membership.version, membership);
  store.currentVersion = membership.version;
};

export const get = (
  store: MembershipStore,
  version: number,
): Membership | null => {
  return store.membershipRecord.get(version) ?? null;
};
