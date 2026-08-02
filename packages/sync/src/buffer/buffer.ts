import {
  type OperationKey,
  type Document,
  toKey,
  type InsertOperation,
  type Operation,
  type AppliedOp,
  apply,
} from "@weavo/core";
import type { OperationBuffer } from "./types";

export const createBuffer = (): OperationBuffer => ({
  waiting: new Map(),
  buffered: new Map(),
  pendingDeletes: new Map(),
});

const getMissingDeps = (doc: Document, op: Operation): OperationKey[] => {
  const missing = [];

  if (op.type === "insert") {
    if (!doc.store.nodes.has(toKey(op.leftOrigin)))
      missing.push(toKey(op.leftOrigin));
    if (op.rightOrigin && !doc.store.nodes.has(toKey(op.rightOrigin)))
      missing.push(toKey(op.rightOrigin));
  }

  return missing;
};

export const addToBuffer = (
  buffer: OperationBuffer,
  doc: Document,
  op: Operation,
) => {
  if (op.type === "delete") {
    buffer.pendingDeletes.set(toKey(op.target), op);
    return;
  }

  buffer.buffered.set(toKey(op.id), op);

  const missing = getMissingDeps(doc, op);
  for (const dep of missing) {
    if (!buffer.waiting.has(dep)) buffer.waiting.set(dep, new Set());
    buffer.waiting.get(dep)!.add(op);
  }
};

export const flush = (
  buffer: OperationBuffer,
  doc: Document,
  unblockedKey: Operation,
): AppliedOp[] => {
  if (unblockedKey.type === "delete") {
    buffer.pendingDeletes.delete(toKey(unblockedKey.target));
    return [];
  }

  const operations: AppliedOp[] = [];
  const waitingQueue = [...(buffer.waiting.get(toKey(unblockedKey.id)) ?? [])];

  while (waitingQueue.length) {
    const op = waitingQueue.shift()!;
    if (!canApply(doc, op)) continue;

    const index = apply(doc, op);
    cleanUp(buffer, op);
    operations.push({ op, index });

    const next = buffer.waiting.get(toKey(op.id)) ?? [];
    waitingQueue.push(...next);
  }

  return operations;
};

const cleanUp = (buffer: OperationBuffer, op: InsertOperation) => {
  buffer.buffered.delete(toKey(op.id));

  const deps = [toKey(op.leftOrigin)];
  if (op.rightOrigin) deps.push(toKey(op.rightOrigin));

  for (const dep of deps) {
    const set = buffer.waiting.get(dep);
    if (!set) continue;

    set.delete(op);
    if (set.size === 0) buffer.waiting.delete(dep);
  }
};

export const canApply = (doc: Document, op: Operation): boolean => {
  if (op.type === "insert") return canApplyInsert(doc, op);

  return canApplyDelete(doc, op);
};

const canApplyDelete = (doc: Document, op: Operation & { type: "delete" }) =>
  doc.store.nodes.has(toKey(op.target));

const canApplyInsert = (doc: Document, op: InsertOperation): boolean => {
  const leftExists = doc.store.nodes.has(toKey(op.leftOrigin));

  const rightExists =
    op.rightOrigin === null ? true : doc.store.nodes.has(toKey(op.rightOrigin));

  return leftExists && rightExists;
};
