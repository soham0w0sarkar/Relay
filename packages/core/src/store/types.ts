import type { OperationId, OperationKey } from "../ids/types";

export type Node = {
  id: OperationId;
  value: string;
  tombstone: boolean;
  leftOrigin: OperationId | null;
  rightOrigin: OperationId | null;
  next: Node | null;
};

export type NodeStore = {
  root: Node;
  nodes: Map<OperationKey, Node>;
};
