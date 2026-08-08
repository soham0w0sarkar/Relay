import type { ClientId } from "@weavo/core";
import type { PresencePayload } from "../consesous/types";

export type PresenceEntry = {
  clientId: ClientId;
  cursor: number;
  name: string;
  color: string;
  timestamp: number;
  membershipVersion: number;
  sv: Record<string, number>;
};

export type PresenceCRDT = Map<ClientId, PresenceEntry>;

export type PeerPresence = {
  clientId: ClientId;
  cursor: number;
  name: string;
  color: string;
};

export type PresenceTrackerOptions = {
  clientId: ClientId;
  timeoutMs?: number;
  now?: () => number;
};

export type PresenceTracker = {
  entries: PresenceCRDT;
  update: (entry: PresenceEntry) => boolean;
  merge: (other: PresenceCRDT) => boolean;
  remove: (clientId: ClientId) => boolean;
  evictStale: (now?: number) => ClientId[];
  snapshot: () => Map<ClientId, PeerPresence>;
  fromHeartbeat: (input: {
    clientId: ClientId;
    membershipVersion: number;
    timestamp: number;
    presence: PresencePayload;
    sv: Record<string, number>;
  }) => boolean;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export const createPresence = (): PresenceCRDT => new Map();

export const updatePresence = (
  presence: PresenceCRDT,
  entry: PresenceEntry,
): boolean => {
  const existing = presence.get(entry.clientId);
  if (existing && entry.timestamp <= existing.timestamp) return false;
  presence.set(entry.clientId, entry);
  return true;
};

export const mergePresence = (
  a: PresenceCRDT,
  b: PresenceCRDT,
): PresenceCRDT => {
  const result = new Map(a);
  for (const entry of b.values()) updatePresence(result, entry);
  return result;
};

export const evictStale = (
  presence: PresenceCRDT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now(),
): ClientId[] => {
  const evicted: ClientId[] = [];
  for (const [clientId, entry] of presence) {
    if (now - entry.timestamp >= timeoutMs) {
      presence.delete(clientId);
      evicted.push(clientId);
    }
  }
  return evicted;
};

export const toPeerPresence = (
  presence: PresenceCRDT,
): Map<ClientId, PeerPresence> => {
  const peers = new Map<ClientId, PeerPresence>();
  for (const entry of presence.values()) {
    peers.set(entry.clientId, {
      clientId: entry.clientId,
      cursor: entry.cursor,
      name: entry.name,
      color: entry.color,
    });
  }
  return peers;
};

export const createPresenceTracker = (
  options: PresenceTrackerOptions,
): PresenceTracker => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const entries = createPresence();

  const update = (entry: PresenceEntry) => updatePresence(entries, entry);

  return {
    entries,
    update,
    merge: (other) => {
      let changed = false;
      for (const entry of other.values()) {
        if (update(entry)) changed = true;
      }
      return changed;
    },
    remove: (clientId) => entries.delete(clientId),
    evictStale: (at = now()) => evictStale(entries, timeoutMs, at),
    snapshot: () => toPeerPresence(entries),
    fromHeartbeat: (input) =>
      update({
        clientId: input.clientId,
        cursor: input.presence.cursor,
        name: input.presence.name,
        color: input.presence.color,
        timestamp: input.timestamp,
        membershipVersion: input.membershipVersion,
        sv: input.sv,
      }),
  };
};
