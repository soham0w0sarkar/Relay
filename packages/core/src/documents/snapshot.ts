import { ROOT_ID, toKey, type ClientId, type OperationId, type OperationKey } from "../ids";
import type { Operation } from "../operations";
import { createSkipListNode } from "../skipList";
import type { SkipList, SkipListNode } from "../skipList/types";
import { createNode } from "../store";
import type { NodeStore } from "../store/types";
import { apply } from "./apply";
import type { Document } from "./types";

export type StateVectorSnapshot = Record<ClientId, number>;

export type SerializedStoreNode = {
  id: OperationId;
  value: string;
  tombstone: boolean;
  leftOrigin: OperationId | null;
  rightOrigin: OperationId | null;
  nextKey: OperationKey | null;
};

export type SerializedSkipListNode = {
  refCrdtKey: OperationKey;
  height: number;
  nextKeys: (OperationKey | null)[];
  span: number[];
};

export type DocumentSnapshot = {
  version: 1;
  clientId: ClientId;
  counter: number;
  nodes: SerializedStoreNode[];
  skipListNodes: SerializedSkipListNode[];
  skipListLength: number;
  stateVector: StateVectorSnapshot;
};

const serializeStore = (store: NodeStore): SerializedStoreNode[] => {
  const out: SerializedStoreNode[] = [];
  for (const node of store.nodes.values()) {
    out.push({
      id: node.id,
      value: node.value,
      tombstone: node.tombstone,
      leftOrigin: node.leftOrigin,
      rightOrigin: node.rightOrigin,
      nextKey: node.next ? toKey(node.next.id) : null,
    });
  }
  return out;
};

const serializeSkipList = (skipList: SkipList) => {
  const skipListNodes: SerializedSkipListNode[] = [];
  for (const node of skipList.nodeMap.values()) {
    skipListNodes.push({
      refCrdtKey: node.refCrdtKey,
      height: node.height,
      nextKeys: node.next.map((n) => (n ? n.refCrdtKey : null)),
      span: [...node.span],
    });
  }
  return { skipListNodes, skipListLength: skipList.length };
};

export const takeSnapshot = (
  doc: Document,
  stateVector: StateVectorSnapshot | Map<ClientId, number>,
): DocumentSnapshot => {
  const sv =
    stateVector instanceof Map
      ? Object.fromEntries(stateVector)
      : stateVector;
  const { skipListNodes, skipListLength } = serializeSkipList(doc.skipList);

  return {
    version: 1,
    clientId: doc.clientId,
    counter: doc.counter,
    nodes: serializeStore(doc.store),
    skipListNodes,
    skipListLength,
    stateVector: sv,
  };
};

const restoreStore = (nodes: SerializedStoreNode[]): NodeStore => {
  const byKey = new Map<OperationKey, ReturnType<typeof createNode>>();

  for (const raw of nodes) {
    byKey.set(
      toKey(raw.id),
      createNode(
        raw.id,
        raw.value,
        raw.tombstone,
        raw.leftOrigin,
        raw.rightOrigin,
      ),
    );
  }

  for (const raw of nodes) {
    const node = byKey.get(toKey(raw.id))!;
    node.next = raw.nextKey ? (byKey.get(raw.nextKey) ?? null) : null;
  }

  const root = byKey.get(toKey(ROOT_ID));
  if (!root) throw new Error("Snapshot missing ROOT node");

  return { root, nodes: byKey };
};

const restoreSkipList = (
  skipListNodes: SerializedSkipListNode[],
  skipListLength: number,
): SkipList => {
  const nodeMap = new Map<OperationKey, SkipListNode>();
  let head: SkipListNode | null = null;

  for (const raw of skipListNodes) {
    const node = createSkipListNode(raw.refCrdtKey, raw.height);
    node.span = [...raw.span];
    nodeMap.set(raw.refCrdtKey, node);
    if (raw.refCrdtKey === toKey(ROOT_ID)) head = node;
  }

  if (!head) throw new Error("Snapshot missing skip list head");

  for (const raw of skipListNodes) {
    const node = nodeMap.get(raw.refCrdtKey)!;
    node.next = raw.nextKeys.map((key) => (key ? nodeMap.get(key) ?? null : null));
  }

  return { head, length: skipListLength, nodeMap };
};

export const restoreSnapshot = (snapshot: DocumentSnapshot): {
  doc: Document;
  stateVector: Map<ClientId, number>;
} => {
  if (snapshot.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
  }

  return {
    doc: {
      clientId: snapshot.clientId,
      counter: snapshot.counter,
      store: restoreStore(snapshot.nodes),
      skipList: restoreSkipList(snapshot.skipListNodes, snapshot.skipListLength),
    },
    stateVector: new Map(Object.entries(snapshot.stateVector)),
  };
};

const advanceStateVector = (sv: Map<ClientId, number>, id: OperationId) => {
  const [clientId, clock] = id;
  const current = sv.get(clientId) ?? -1;
  if (clock > current) sv.set(clientId, clock);
};

export const replayOperations = (
  doc: Document,
  stateVector: Map<ClientId, number>,
  ops: Operation[],
) => {
  for (const op of ops) {
    apply(doc, op);
    if (op.type === "insert") advanceStateVector(stateVector, op.id);
  }
};

export const restoreFromStorage = (
  snapshot: DocumentSnapshot,
  delta: Operation[] = [],
) => {
  const { doc, stateVector } = restoreSnapshot(snapshot);
  replayOperations(doc, stateVector, delta);
  return { doc, stateVector };
};
