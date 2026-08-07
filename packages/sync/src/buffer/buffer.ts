import {
  type OperationKey,
  type Document,
  toKey,
  type InsertOperation,
  type Operation,
  type AppliedOp,
  apply,
} from "@weavo/core";
import type { MembershipVersions, OperationBuffer } from "./types";
import {
  membershipKey,
  membershipKeyVersion,
  pendingMembershipVersion,
  resolveOperation,
} from "./unresolved";

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

const wait = (buffer: OperationBuffer, dep: OperationKey, op: Operation) => {
  if (!buffer.waiting.has(dep)) buffer.waiting.set(dep, new Set());
  buffer.waiting.get(dep)!.add(op);
};

const remember = (buffer: OperationBuffer, op: Operation) => {
  if (op.type === "delete") buffer.pendingDeletes.set(toKey(op.target), op);
  else buffer.buffered.set(toKey(op.id), op);
};

export const addToBuffer = (
  buffer: OperationBuffer,
  doc: Document,
  op: Operation,
) => {
  const version = pendingMembershipVersion(op);
  if (version !== null) {
    remember(buffer, op);
    wait(buffer, membershipKey(version), op);
    return;
  }

  if (op.type === "delete") {
    buffer.pendingDeletes.set(toKey(op.target), op);
    return;
  }

  buffer.buffered.set(toKey(op.id), op);

  for (const dep of getMissingDeps(doc, op)) wait(buffer, dep, op);
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

  return drain(buffer, doc, [
    ...(buffer.waiting.get(toKey(unblockedKey.id)) ?? []),
  ]);
};

export const flushMembership = (
  buffer: OperationBuffer,
  doc: Document,
  membership: MembershipVersions,
): AppliedOp[] => {
  const unblocked: Operation[] = [];

  for (const [key, ops] of [...buffer.waiting]) {
    const version = membershipKeyVersion(key);
    if (version === null || membership.getVersion(version) === null) continue;

    buffer.waiting.delete(key);

    for (const op of ops) {
      forget(buffer, op);
      const resolved = resolveOperation(op, membership);

      if (pendingMembershipVersion(resolved) !== null) {
        addToBuffer(buffer, doc, resolved);
        continue;
      }
      unblocked.push(resolved);
    }
  }

  return drain(buffer, doc, unblocked);
};

const drain = (
  buffer: OperationBuffer,
  doc: Document,
  queue: Operation[],
): AppliedOp[] => {
  const operations: AppliedOp[] = [];

  while (queue.length) {
    const op = queue.shift()!;

    if (!canApply(doc, op)) {
      addToBuffer(buffer, doc, op);
      continue;
    }

    const index = apply(doc, op);
    forget(buffer, op);
    operations.push({ op, index });

    if (op.type === "insert") {
      queue.push(...(buffer.waiting.get(toKey(op.id)) ?? []));
    }
  }

  return operations;
};

const forget = (buffer: OperationBuffer, op: Operation) => {
  const deps: OperationKey[] = [];
  const version = pendingMembershipVersion(op);
  if (version !== null) deps.push(membershipKey(version));

  if (op.type === "delete") {
    buffer.pendingDeletes.delete(toKey(op.target));
  } else {
    buffer.buffered.delete(toKey(op.id));
    deps.push(toKey(op.leftOrigin));
    if (op.rightOrigin) deps.push(toKey(op.rightOrigin));
  }

  for (const dep of deps) {
    const set = buffer.waiting.get(dep);
    if (!set) continue;

    set.delete(op);
    if (set.size === 0) buffer.waiting.delete(dep);
  }
};

export const canApply = (doc: Document, op: Operation): boolean => {
  if (pendingMembershipVersion(op) !== null) return false;

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
