export type { Document, OnApplied, AppliedOp } from "./types";
export { createReplica } from "./Document";
export { apply } from "./apply";
export { onBeforeInput, onInput, buildOp } from "./localApply";
export {
  takeSnapshot,
  restoreSnapshot,
  replayOperations,
  restoreFromStorage,
  type DocumentSnapshot,
  type StateVectorSnapshot,
  type SerializedStoreNode,
  type SerializedSkipListNode,
} from "./snapshot";
