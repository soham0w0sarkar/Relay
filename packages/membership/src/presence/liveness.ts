import type { ClientId } from "@weavo/core";

export type LivenessStatus = "alive" | "suspect";

export type LivenessEntry = {
  lastSeen: number;
  status: LivenessStatus;
};

export type LivenessTrackerOptions = {
  presenceTimeoutMs?: number;
  removalTimeoutMs?: number;
  now?: () => number;
};

export type LivenessSweep = {
  suspected: ClientId[];
  expired: ClientId[];
};

export type LivenessTracker = {
  entries: Map<ClientId, LivenessEntry>;
  touch: (clientId: ClientId, at?: number) => LivenessStatus;
  remove: (clientId: ClientId) => boolean;
  seed: (clientIds: ClientId[], at?: number) => void;
  syncMembers: (clientIds: ClientId[], at?: number) => ClientId[];
  sweep: (at?: number) => LivenessSweep;
  get: (clientId: ClientId) => LivenessEntry | undefined;
};

const DEFAULT_PRESENCE_TIMEOUT_MS = 10_000;
const DEFAULT_REMOVAL_TIMEOUT_MS = 30_000;

export const createLivenessTracker = (
  options: LivenessTrackerOptions = {},
): LivenessTracker => {
  const presenceTimeoutMs =
    options.presenceTimeoutMs ?? DEFAULT_PRESENCE_TIMEOUT_MS;
  const removalTimeoutMs =
    options.removalTimeoutMs ?? DEFAULT_REMOVAL_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<ClientId, LivenessEntry>();

  const touch = (clientId: ClientId, at = now()): LivenessStatus => {
    entries.set(clientId, { lastSeen: at, status: "alive" });
    return "alive";
  };

  const remove = (clientId: ClientId): boolean => entries.delete(clientId);

  const seed = (clientIds: ClientId[], at = now()) => {
    for (const clientId of clientIds) {
      if (!entries.has(clientId)) {
        entries.set(clientId, { lastSeen: at, status: "alive" });
      }
    }
  };

  const syncMembers = (clientIds: ClientId[], at = now()): ClientId[] => {
    const keep = new Set(clientIds);
    const dropped: ClientId[] = [];
    for (const clientId of entries.keys()) {
      if (!keep.has(clientId)) {
        entries.delete(clientId);
        dropped.push(clientId);
      }
    }
    seed(clientIds, at);
    return dropped;
  };

  const sweep = (at = now()): LivenessSweep => {
    const suspected: ClientId[] = [];
    const expired: ClientId[] = [];

    for (const [clientId, entry] of entries) {
      const age = at - entry.lastSeen;
      if (age >= removalTimeoutMs) {
        expired.push(clientId);
        continue;
      }
      if (age >= presenceTimeoutMs) {
        if (entry.status !== "suspect") {
          entry.status = "suspect";
          suspected.push(clientId);
        }
      }
    }

    return { suspected, expired };
  };

  return {
    entries,
    touch,
    remove,
    seed,
    syncMembers,
    sweep,
    get: (clientId) => entries.get(clientId),
  };
};
