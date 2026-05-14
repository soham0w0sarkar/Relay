import type { OperationId } from "../ids/types";
import type { Node } from "./types";

export type { Node } from "./types";

export const createNode = (
  id: OperationId,
  value: string,
  tombstone: boolean,
  leftOrigin: OperationId | null,
  rightOrigin: OperationId | null,
): Node => {
  return { id, value, tombstone, leftOrigin, rightOrigin, next: null };
};
