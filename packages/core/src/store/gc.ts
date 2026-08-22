import { ROOT_ID, toKey } from "../ids";
import type { ClientId, OperationKey } from "../ids/types";
import type { Node, NodeStore } from "./types";

export type GCFrontier = Map<ClientId, number>;

export type GCTracker = {
  candidates: Map<OperationKey, number>;
};

export type RunGCOptions = {
  gracePeriodMs?: number;
  now?: number;
};

const DEFAULT_GC_GRACE_MS = 30_000;

export const createGCTracker = (): GCTracker => ({
  candidates: new Map(),
});

const referencedKeys = (store: NodeStore): Set<OperationKey> => {
  const refs = new Set<OperationKey>();
  for (const node of store.nodes.values()) {
    if (node.leftOrigin) refs.add(toKey(node.leftOrigin));
    if (node.rightOrigin) refs.add(toKey(node.rightOrigin));
  }
  return refs;
};

const buildPrevMap = (store: NodeStore): Map<OperationKey, Node> => {
  const prevOf = new Map<OperationKey, Node>();
  let current: Node | null = store.root;
  while (current?.next) {
    prevOf.set(toKey(current.next.id), current);
    current = current.next;
  }
  return prevOf;
};

export const runGC = (
  store: NodeStore,
  frontier: GCFrontier,
  tracker: GCTracker,
  options: RunGCOptions = {},
): OperationKey[] => {
  const gracePeriodMs = options.gracePeriodMs ?? DEFAULT_GC_GRACE_MS;
  const now = options.now ?? Date.now();
  const refs = referencedKeys(store);
  const prevOf = buildPrevMap(store);
  const removed: OperationKey[] = [];
  const rootKey = toKey(ROOT_ID);

  for (const [key, node] of [...store.nodes]) {
    if (key === rootKey) continue;

    if (!node.tombstone) {
      tracker.candidates.delete(key);
      continue;
    }

    const [clientId, clock] = node.id;
    const safeUpTo = frontier.get(clientId) ?? -1;

    if (clock > safeUpTo || refs.has(key)) {
      tracker.candidates.delete(key);
      continue;
    }

    const eligibleAt = tracker.candidates.get(key);
    if (eligibleAt === undefined) {
      tracker.candidates.set(key, now);
      continue;
    }

    if (now - eligibleAt < gracePeriodMs) continue;

    const prev = prevOf.get(key);
    if (prev) {
      prev.next = node.next;
      if (node.next) prevOf.set(toKey(node.next.id), prev);
    }
    prevOf.delete(key);
    store.nodes.delete(key);
    tracker.candidates.delete(key);
    removed.push(key);
  }

  return removed;
};
