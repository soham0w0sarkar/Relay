import type {
  DeleteOperation,
  InsertOperation,
  OperationKey,
} from "@weavo/core";

export type { OperationKey, Operation } from "@weavo/core";

export type OperationBuffer = {
  waiting: Map<OperationKey, Set<InsertOperation>>;
  buffered: Map<OperationKey, InsertOperation>;
  pendingDeletes: Map<OperationKey, DeleteOperation>;
};
