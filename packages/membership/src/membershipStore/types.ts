import type { ClientId } from "@weavo/core";

export type Member = {
    clientId: ClientId;
    shortId: number;
}

export type Membership = {
    version: number;
    members: Member[];
}

export type MembershipStore = {
    currentVersion: number;
    membershipRecord: Map<number, Membership>;
}
