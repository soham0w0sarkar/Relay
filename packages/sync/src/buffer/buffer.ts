import {
  type OperationKey,
  type Document,
  toKey,
  type InsertOperation,
  type DeleteOperation,
  apply,
} from "@repo/core";

const waiting = new Map<OperationKey, Set<InsertOperation>>();
const buffered = new Map<OperationKey, InsertOperation>();
const pendingDeleteOps = new Map<OperationKey, DeleteOperation>();

const getMissingDeps = (
  doc: Document,
  op: InsertOperation | DeleteOperation,
): OperationKey[] => {
  const missing = [];

  if (op.type === "insert") {
    if (!doc.store.nodes.has(toKey(op.leftOrigin)))
      missing.push(toKey(op.leftOrigin));
    if (op.rightOrigin && !doc.store.nodes.has(toKey(op.rightOrigin)))
      missing.push(toKey(op.rightOrigin));
  }

  return missing;
};

export const addToBuffer = (doc: Document, op: InsertOperation) => {
  buffered.set(toKey(op.id), op);

  const missing = getMissingDeps(doc, op);
  for (const dep of missing) {
    if (!waiting.has(dep)) waiting.set(dep, new Set());
    waiting.get(dep)!.add(op);
  }
};

export const addToDeleteBuffer = (op: DeleteOperation) => {
  pendingDeleteOps.set(toKey(op.target), op);
};

export const deleteFromDeleteBuffer = (op: DeleteOperation) => {
  pendingDeleteOps.delete(toKey(op.target));
};

export const flush = (doc: Document, unblockedKey: OperationKey) => {
  const waitingQueue = [...(waiting.get(unblockedKey) ?? [])];

  while (waitingQueue.length) {
    const op = waitingQueue.shift()!;
    if (!canApply(doc, op)) continue;

    apply(doc, op);
    cleanUp(op);

    const next = waiting.get(toKey(op.id)) ?? [];
    waitingQueue.push(...next);
  }
};

const cleanUp = (op: InsertOperation) => {
  buffered.delete(toKey(op.id));

  const deps = [toKey(op.leftOrigin)];
  if (op.rightOrigin) deps.push(toKey(op.rightOrigin));

  for (let dep of deps) {
    const set = waiting.get(dep);
    if (!set) continue;

    set.delete(op);
    if (set.size === 0) waiting.delete(dep);
  }
};

export const canApply = (
  doc: Document,
  op: InsertOperation | DeleteOperation,
): boolean => {
  if (op.type === "insert") return canApplyInsert(doc, op);

  return canApplyDelete(doc, op);
};

const canApplyDelete = (doc: Document, op: DeleteOperation): boolean => {
  return doc.store.nodes.has(toKey(op.target));
};

const canApplyInsert = (doc: Document, op: InsertOperation): boolean => {
  const leftExists = doc.store.nodes.has(toKey(op.leftOrigin));

  const rightExists =
    op.rightOrigin === null ? true : doc.store.nodes.has(toKey(op.rightOrigin));

  return leftExists && rightExists;
};
