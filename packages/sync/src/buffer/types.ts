import type {
  DeleteOperation,
  InsertOperation,
  Operation,
  OperationKey,
} from "@weavo/core";
import type { MembershipHandle } from "@weavo/membership";

export type { OperationKey, Operation } from "@weavo/core";

export type OperationBuffer = {
  waiting: Map<OperationKey, Set<Operation>>;
  buffered: Map<OperationKey, InsertOperation>;
  pendingDeletes: Map<OperationKey, DeleteOperation>;
};

export type MembershipVersions = Pick<MembershipHandle, "getVersion">;
