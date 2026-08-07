import type {
  ClientId,
  Operation,
  OperationId,
  OperationKey,
} from "@weavo/core";
import { getClientId } from "@weavo/membership";
import type { MembershipVersions } from "./types";

const UNRESOLVED_PREFIX = "~";

export const unresolvedClientId = (
  version: number,
  shortId: number,
): ClientId => `${UNRESOLVED_PREFIX}${version}:${shortId}`;

export const parseUnresolvedClientId = (
  clientId: ClientId,
): { version: number; shortId: number } | null => {
  if (!clientId.startsWith(UNRESOLVED_PREFIX)) return null;

  const [version, shortId] = clientId.slice(1).split(":");
  if (version === undefined || shortId === undefined) return null;

  return { version: Number(version), shortId: Number(shortId) };
};

const idsOf = (op: Operation): OperationId[] =>
  op.type === "delete"
    ? [op.target]
    : op.rightOrigin === null
      ? [op.id, op.leftOrigin]
      : [op.id, op.leftOrigin, op.rightOrigin];

export const pendingMembershipVersion = (op: Operation): number | null => {
  for (const [clientId] of idsOf(op)) {
    const unresolved = parseUnresolvedClientId(clientId);
    if (unresolved) return unresolved.version;
  }
  return null;
};

export const membershipKey = (version: number): OperationKey =>
  `${UNRESOLVED_PREFIX}membership:${version}` as OperationKey;

export const membershipKeyVersion = (key: OperationKey): number | null => {
  if (!key.startsWith(`${UNRESOLVED_PREFIX}membership:`)) return null;
  return Number(key.slice(key.indexOf(":") + 1));
};

const resolveId = (
  id: OperationId,
  membership: MembershipVersions,
): OperationId => {
  const unresolved = parseUnresolvedClientId(id[0]);
  if (!unresolved) return id;

  const table = membership.getVersion(unresolved.version);
  if (!table) return id;

  const clientId = getClientId(table, unresolved.shortId);
  return clientId === null ? id : [clientId, id[1]];
};

export const resolveOperation = (
  op: Operation,
  membership: MembershipVersions,
): Operation => {
  if (op.type === "delete") {
    return { type: "delete", target: resolveId(op.target, membership) };
  }

  return {
    type: "insert",
    id: resolveId(op.id, membership),
    value: op.value,
    leftOrigin: resolveId(op.leftOrigin, membership),
    rightOrigin:
      op.rightOrigin === null ? null : resolveId(op.rightOrigin, membership),
  };
};
