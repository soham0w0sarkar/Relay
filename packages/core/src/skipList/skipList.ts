import { createSkipListNode } from "./skipListNode";
import { ROOT_ID, toKey, type OperationId } from "../ids";
import type { SkipList, SkipListNode } from "./types";

const MAX_HEIGHT = 32;
const P = 0.5;

const randomHeight = (): number => {
  let height = 1;
  while (Math.random() < P && height < MAX_HEIGHT) height++;
  return height;
};

const isBetween = (
  pred: SkipListNode,
  end: SkipListNode,
  target: SkipListNode,
): boolean => {
  let cur = pred.next[0];
  while (cur && cur !== end) {
    if (cur === target) return true;
    cur = cur.next[0] ?? null;
  }
  return false;
};

const findPredecessor = (
  sl: SkipList,
  index: number,
): { update: SkipListNode[]; rankAt: number[] } => {
  const update: SkipListNode[] = Array.from({ length: MAX_HEIGHT }, () => sl.head);
  const rankAt: number[] = Array.from({ length: MAX_HEIGHT }, () => 0);

  let x = sl.head;
  let rank = 0;

  for (let level = MAX_HEIGHT - 1; level >= 0; level--) {
    while (x.next[level] && rank + x.span[level] <= index) {
      rank += x.span[level];
      x = x.next[level]!;
    }
    update[level] = x;
    rankAt[level] = rank;
  }

  return { update, rankAt };
};

export const createSkipList = (): SkipList => {
  const head = createSkipListNode(toKey(ROOT_ID), MAX_HEIGHT);
  const nodeMap = new Map([[toKey(ROOT_ID), head]]);
  return { head, length: 0, nodeMap };
};

export const findByIndex = (
  sl: SkipList,
  targetIndex: number,
): SkipListNode | null => {
  if (targetIndex < 0 || targetIndex >= sl.length) return null;

  let x = sl.head;
  let rank = 0;

  for (let level = MAX_HEIGHT - 1; level >= 0; level--) {
    while (x.next[level] && rank + x.span[level] <= targetIndex) {
      rank += x.span[level];
      x = x.next[level]!;
    }
  }

  return x.next[0] ?? null;
};

export const findIndex = (sl: SkipList, id: OperationId): number => {
  const key = toKey(id);
  let index = 0;
  let current: SkipListNode | null = sl.head.next[0] ?? null;

  while (current) {
    if (current.refCrdtKey === key) return index;
    index++;
    current = current.next[0] ?? null;
  }

  return -1;
};

export const insert = (
  sl: SkipList,
  index: number,
  refCrdtId: OperationId,
): SkipListNode => {
  const { update, rankAt } = findPredecessor(sl, index);
  const height = randomHeight();
  const newNode = createSkipListNode(toKey(refCrdtId), height);
  sl.nodeMap.set(toKey(refCrdtId), newNode);

  for (let level = 0; level < height; level++) {
    const pred = update[level]!;
    const split = index - rankAt[level]!;
    newNode.next[level] = pred.next[level];
    newNode.span[level] = pred.span[level] - split;
    pred.span[level] = split + 1;
    pred.next[level] = newNode;
  }

  for (let level = height; level < MAX_HEIGHT; level++) {
    update[level]!.span[level]++;
  }

  sl.length++;
  return newNode;
};

const findPredecessorsOf = (
  sl: SkipList,
  target: SkipListNode,
): SkipListNode[] => {
  const update: SkipListNode[] = Array.from({ length: MAX_HEIGHT }, () => sl.head);
  let x = sl.head;

  for (let level = MAX_HEIGHT - 1; level >= 0; level--) {
    while (x.next[level] && x.next[level] !== target) {
      const next = x.next[level]!;
      if (isBetween(x, next, target)) break;
      x = next;
    }
    update[level] = x;
  }

  return update;
};

export const remove = (sl: SkipList, refCrdtId: OperationId): boolean => {
  const key = toKey(refCrdtId);
  const target = sl.nodeMap.get(key);
  if (!target || target === sl.head) return false;

  const update = findPredecessorsOf(sl, target);
  const targetHeight = target.height;

  for (let level = 0; level < MAX_HEIGHT; level++) {
    const pred = update[level]!;
    if (level < targetHeight && pred.next[level] === target) {
      pred.span[level] += target.span[level] - 1;
      pred.next[level] = target.next[level] ?? null;
    } else if (level >= targetHeight) {
      pred.span[level]--;
    }
  }

  sl.nodeMap.delete(key);
  sl.length--;
  return true;
};
