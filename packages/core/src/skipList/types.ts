import type { Node } from "../store/types";

export type SkipListNode = {
  refCrdtNode: Node;
  height: number;
  next: (SkipListNode | null)[];
  span: number[];
};

export type SkipList = {
  head: SkipListNode;
  length: number;
};
