import type { OperationId } from "../ids/types";
import type { InsertOperation } from "./types";

export type { InsertOperation } from "./types";

export const createInsertOperation = (
  id: OperationId,
  value: string,
  leftOrigin: OperationId,
  rightOrigin: OperationId | null = null,
): InsertOperation => {
  return { type: "insert", id, value, leftOrigin, rightOrigin };
};
