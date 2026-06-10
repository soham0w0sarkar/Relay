import { compareOperationId, ROOT_ID, toKey } from "../ids";
import type { OperationId, OperationKey } from "../ids/types";
import type { DeleteOperation, InsertOperation } from "../operations/types";
import { createNode } from "./Node";
import type { Node, NodeStore } from "./types";

const keyMatchHelper = (
  id1: OperationId | null | undefined,
  id2: OperationId | null | undefined,
): boolean => {
  if (id1 && id2) return toKey(id1) === toKey(id2);

  if (typeof id1 !== typeof id2) return false;

  return true;
};

const isDescendantOf = (
  candidate: OperationId | null,
  ancestor: OperationId | null,
  nd: NodeStore,
): boolean => {
  if (!candidate || !ancestor) return false;
  let current: OperationId | null = candidate;
  while (current !== null) {
    if (keyMatchHelper(current, ancestor)) return true;
    const node = nd.nodes.get(toKey(current));
    if (!node) return false;
    current = node.leftOrigin;
  }
  return false;
};

export const createNodeStore = (root: Node): NodeStore => {
  const nodes = new Map<OperationKey, Node>();
  nodes.set(toKey(ROOT_ID), root);
  return { root: root, nodes };
};

export const insert = (nd: NodeStore, op: InsertOperation) => {
  const leftOriginNode = nd.nodes.get(toKey(op.leftOrigin));
  if (!leftOriginNode)
    throw new Error(`Operation ${op.id} cannot be merged yet!`);

  const rightOriginNode = op.rightOrigin
    ? (() => {
        const node = nd.nodes.get(toKey(op.rightOrigin));
        if (!node)
          throw new Error(
            `Operation ${op.id} cannot be merged yet — rightOrigin missing`,
          );
        return node;
      })()
    : null;

  let prev = leftOriginNode;
  let scan = leftOriginNode.next;

  while (scan !== null && !keyMatchHelper(scan.id, rightOriginNode?.id)) {
    const sameOrigin = keyMatchHelper(scan.leftOrigin, op.leftOrigin);
    const nestedDeeper =
      !sameOrigin && isDescendantOf(scan.leftOrigin, op.leftOrigin, nd);
    const outsideRange = !sameOrigin && !nestedDeeper;

    if (outsideRange) break;
    if (sameOrigin && compareOperationId(op.id, scan.id) < 0) break;

    prev = scan;
    scan = scan.next;
  }

  const newNode = createNode(
    op.id,
    op.value,
    false,
    op.leftOrigin,
    op.rightOrigin,
  );

  newNode.next = prev.next;
  prev.next = newNode;
  nd.nodes.set(toKey(newNode.id), newNode);
};

export const remove = (nd: NodeStore, op: DeleteOperation) => {
  const node = nd.nodes.get(toKey(op.target));
  if (!node) {
    throw new Error(`node ${toKey(op.target)} not found`);
  }

  node.tombstone = true;
};

export const getText = (nd: NodeStore): string => {
  let result = "";
  let current = nd.root.next;
  while (current !== null) {
    if (!current.tombstone) {
      result += current.value;
    }
    current = current.next;
  }
  return result;
};
