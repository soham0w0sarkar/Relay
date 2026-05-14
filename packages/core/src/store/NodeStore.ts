import { compareOperationId } from "../ids/compare";
import { toKey } from "../ids/OperationId";
import { ROOT_ID } from "../ids/RootId";
import type { OperationKey } from "../ids/types";
import type { DeleteOperation, InsertOperation } from "../operations";
import { createNode } from "./Node";
import type { Node, NodeStore } from "./types";

export type { NodeStore } from "./types";

export const createNodeStore = (root: Node): NodeStore => {
  const nodes = new Map<OperationKey, Node>();
  nodes.set(toKey(ROOT_ID), root);
  return { root: root, nodes };
};

export const insert = (nd: NodeStore, op: InsertOperation) => {
  const newNode = createNode(op.id, op.value, false, op.leftOrigin, op.rightOrigin)

  const leftOriginNode = nd.nodes.get(toKey(op.leftOrigin))
  if (!leftOriginNode) throw new Error(`leftOrigin ${toKey(op.leftOrigin)} not found`)

  const rightOriginNode = op.rightOrigin
    ? nd.nodes.get(toKey(op.rightOrigin)) ?? null
    : null

  let prev = leftOriginNode
  let scan = leftOriginNode.next

  while (scan !== null && scan !== rightOriginNode) {
    if (toKey(scan.leftOrigin!) === toKey(op.leftOrigin)) {
      if (compareOperationId(op.id, scan.id) > 0) break
    }
    prev = scan
    scan = scan.next
  }

  newNode.next = scan
  prev.next = newNode
  nd.nodes.set(toKey(op.id), newNode)
}
export const remove = (nd: NodeStore, op: DeleteOperation) => {
  const node = nd.nodes.get(toKey(op.id));
  if (!node) {
    throw new Error(`node ${toKey(op.id)} not found`);
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
