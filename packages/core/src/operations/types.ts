import type { OperationId } from "../ids/types";

export type InsertOperation = {
  type: "insert";
  id: OperationId;
  value: string;
  leftOrigin: OperationId;
  rightOrigin: OperationId | null;
};

export type DeleteOperation = {
  type: "delete";
  id: OperationId;
  target: OperationId;
};
