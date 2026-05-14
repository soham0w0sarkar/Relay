import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { generateClientId } from "../src/ids/ClientId";
import { generateOperationId, toKey } from "../src/ids/OperationId";
import { ROOT_ID } from "../src/ids/RootId";
import { createDeleteOperation } from "../src/operations/delete";
import { createInsertOperation } from "../src/operations/insert";
import { createNode } from "../src/store/Node";
import {
  createNodeStore,
  getText,
  insert as insertIntoStore,
  remove as removeFromStore,
} from "../src/store/NodeStore";

describe("NodeStore", () => {
  const makeStore = () => {
    const root = createNode(ROOT_ID, "", false, null);
    return createNodeStore(root);
  };

  describe("createNodeStore", () => {
    test("stores root in nodes map under ROOT key", () => {
      const root = createNode(ROOT_ID, "", false, null);
      const store = createNodeStore(root);

      assert.strictEqual(store.root, root);
      assert.strictEqual(store.nodes.get(toKey(ROOT_ID)), root);
      assert.strictEqual(store.nodes.size, 1);
    });
  });

  describe("getText", () => {
    test("returns empty string for fresh store", () => {
      assert.strictEqual(getText(makeStore()), "");
    });
  });

  describe("insert", () => {
    test("appends a single character after root", () => {
      const store = makeStore();
      const clientId = generateClientId();
      const id = generateOperationId(clientId, 1);

      insertIntoStore(
        store,
        createInsertOperation(id, "x", ROOT_ID),
      );

      assert.strictEqual(getText(store), "x");
      assert.strictEqual(store.nodes.get(toKey(id))?.value, "x");
      assert.strictEqual(store.root.next?.id, id);
    });

    test("chains inserts using prior node as leftOrigin", () => {
      const store = makeStore();
      const clientId = generateClientId();
      const idA = generateOperationId(clientId, 1);
      const idB = generateOperationId(clientId, 2);

      insertIntoStore(store, createInsertOperation(idA, "a", ROOT_ID));
      insertIntoStore(store, createInsertOperation(idB, "b", idA));

      assert.strictEqual(getText(store), "ab");
    });

    test("orders concurrent inserts with same leftOrigin by operation id", () => {
      const store = makeStore();
      const cLow = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const cHigh = "zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz";
      const idLater = generateOperationId(cHigh, 2);
      const idEarlier = generateOperationId(cLow, 1);

      insertIntoStore(
        store,
        createInsertOperation(idLater, "z", ROOT_ID),
      );
      insertIntoStore(
        store,
        createInsertOperation(idEarlier, "a", ROOT_ID),
      );

      assert.strictEqual(getText(store), "az");
    });
  });

  describe("remove", () => {
    test("tombstones a node so getText skips it", () => {
      const store = makeStore();
      const clientId = generateClientId();
      const id = generateOperationId(clientId, 1);

      insertIntoStore(store, createInsertOperation(id, "x", ROOT_ID));
      assert.strictEqual(getText(store), "x");

      removeFromStore(store, createDeleteOperation(id, id));

      assert.strictEqual(store.nodes.get(toKey(id))?.tombstone, true);
      assert.strictEqual(getText(store), "");
    });

    test("throws when node id is not in store", () => {
      const store = makeStore();
      const missing = generateOperationId(generateClientId(), 99);

      assert.throws(
        () =>
          removeFromStore(
            store,
            createDeleteOperation(missing, missing),
          ),
        /not found/,
      );
    });
  });
});
