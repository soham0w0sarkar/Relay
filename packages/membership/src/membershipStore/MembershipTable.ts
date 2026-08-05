import type { ClientId } from "@weavo/core";
import type { Membership } from "./types";

export const buildMembership = (
  version: number,
  clientIds: ClientId[],
): Membership => ({
  version,
  members: [...new Set(clientIds)]
    .sort()
    .map((clientId, i) => ({ clientId, shortId: i })),
});

export const addMember = (base: Membership, clientId: ClientId): Membership => {
  const existingIds = base.members.map((m) => m.clientId);
  return buildMembership(base.version + 1, [...existingIds, clientId]);
};

export const removeMember = (
  base: Membership,
  clientId: ClientId,
): Membership => {
  const existingIds = base.members
    .map((m) => m.clientId)
    .filter((id) => id !== clientId);
  return buildMembership(base.version + 1, existingIds);
};

export const getShortId = (
  membership: Membership,
  clientId: ClientId,
): number | null => {
  return (
    membership.members.find((m) => m.clientId === clientId)?.shortId ?? null
  );
};
