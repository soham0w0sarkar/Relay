export type { Node, NodeStore } from "./types";
export { createNode } from "./Node";
export { createNodeStore, insert, remove, getText } from "./NodeStore";
export {
  createGCTracker,
  runGC,
  type GCFrontier,
  type GCTracker,
  type RunGCOptions,
} from "./gc";
