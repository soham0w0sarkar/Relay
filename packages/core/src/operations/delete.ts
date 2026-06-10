import type { OperationId } from "../ids/types";
import type { DeleteOperation } from "./types";

export const createDeleteOperation = (
  target: OperationId,
): DeleteOperation => {
  return { type: "delete", target };
};
