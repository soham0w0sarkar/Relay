import type { Node } from "../store/types";
import type { SkipListNode } from "./types";

export type { SkipListNode } from "./types";

export const createSkipListNode = (
  refCrdtNode: Node,
  height: number,
): SkipListNode => {
  return {
    refCrdtNode,
    height,
    next: Array(height).fill(null),
    span: Array(height).fill(0),
  };
};
