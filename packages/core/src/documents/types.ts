import type { ClientId } from "../ids/types";
import type { SkipList } from "../skipList";
import type { NodeStore } from "../store/types";

export type Document = {
  clientId: ClientId;
  counter: number;
  store: NodeStore;
  skipList: SkipList
};
