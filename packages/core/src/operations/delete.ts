import type { OperationId } from "../ids/types";
import type { DeleteOperation } from "./types";

export type { DeleteOperation } from "./types";

export const createDeleteOperation = (
  id: OperationId,
  target: OperationId,
): DeleteOperation => {
  return { type: "delete", id, target };
};
