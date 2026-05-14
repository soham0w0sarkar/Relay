import { ROOT_ID } from "../ids/RootId";
import type { ClientId } from "../ids/types";
import { createSkipList } from "../skipList";
import { createNode } from "../store/Node";
import { createNodeStore } from "../store/NodeStore";
import type { Document } from "./types";

export type { Document } from "./types";

export const createDocument = (clientId: ClientId): Document => {
  const rootNode = createNode(ROOT_ID, "", false, null);
  return {
    clientId,
    counter: 0,
    store: createNodeStore(rootNode),
    skipList: createSkipList(rootNode),
  };
};
