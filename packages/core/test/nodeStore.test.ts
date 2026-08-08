import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { generateClientId, generateOperationId, toKey } from "../src/ids";
import { ROOT_ID } from "../src/ids/RootId";
import {
  createDeleteOperation,
  createInsertOperation,
} from "../src/operations";
import { createNode } from "../src/store/Node";
import {
  createNodeStore,
  getText,
  insert as insertIntoStore,
  remove as removeFromStore,
} from "../src/store/NodeStore";
import { compareOperationId } from "../src/ids/compare";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("NodeStore", () => {
  const makeStore = () => {
    const root = createNode(ROOT_ID, "", false, null, null);
    return createNodeStore(root);
  };

  describe("createNodeStore", () => {
    test("stores root in nodes map under ROOT key", () => {
      const root = createNode(ROOT_ID, "", false, null, null);
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
      const id = generateOperationId(ALICE, 1);

      insertIntoStore(store, createInsertOperation(id, "x", ROOT_ID, null));

      assert.strictEqual(getText(store), "x");
      assert.strictEqual(store.nodes.get(toKey(id))?.value, "x");
      assert.strictEqual(store.root.next?.id, id);
    });

    test("chains inserts using prior node as leftOrigin", () => {
      const store = makeStore();
      const idA = generateOperationId(ALICE, 1);
      const idB = generateOperationId(ALICE, 2);

      insertIntoStore(store, createInsertOperation(idA, "a", ROOT_ID, null));
      insertIntoStore(store, createInsertOperation(idB, "b", idA, null));

      assert.strictEqual(getText(store), "ab");
    });

    test("concurrent inserts at same leftOrigin — lower counter goes left", () => {
      const store1 = makeStore();
      const idLow = generateOperationId(ALICE, 1);
      const idHigh = generateOperationId(ALICE, 2);

      insertIntoStore(
        store1,
        createInsertOperation(idHigh, "z", ROOT_ID, null),
      );
      insertIntoStore(store1, createInsertOperation(idLow, "a", ROOT_ID, null));
      assert.strictEqual(getText(store1), "az");

      const store2 = makeStore();
      insertIntoStore(
        store2,
        createInsertOperation(idHigh, "a", ROOT_ID, null),
      );
      insertIntoStore(store2, createInsertOperation(idLow, "z", ROOT_ID, null));
      assert.strictEqual(getText(store2), "za");
    });

    test("concurrent inserts — tiebreak by clientId when counters equal", () => {
      const store1 = makeStore();

      const idAlice = generateOperationId(ALICE, 1);
      const idBob = generateOperationId(BOB, 1);

      insertIntoStore(
        store1,
        createInsertOperation(idAlice, "a", ROOT_ID, null),
      );

      insertIntoStore(store1, createInsertOperation(idBob, "b", ROOT_ID, null));

      assert.strictEqual(getText(store1), "ab");

      const store2 = makeStore();

      insertIntoStore(store2, createInsertOperation(idBob, "b", ROOT_ID, null));

      insertIntoStore(
        store2,
        createInsertOperation(idAlice, "a", ROOT_ID, null),
      );

      assert.strictEqual(getText(store2), "ab");
    });

    test("nested insert stays glued to its anchor regardless of ordering", () => {

      const idA = generateOperationId(ALICE, 1);
      const idB = generateOperationId(BOB, 2);
      const idC = generateOperationId(ALICE, 3);

      const store1 = makeStore();
      insertIntoStore(store1, createInsertOperation(idA, "a", ROOT_ID, null));
      insertIntoStore(store1, createInsertOperation(idB, "b", ROOT_ID, null));
      insertIntoStore(store1, createInsertOperation(idC, "c", idA, null));
      assert.strictEqual(getText(store1), "acb");

      const store2 = makeStore();
      insertIntoStore(store2, createInsertOperation(idB, "b", ROOT_ID, null));
      insertIntoStore(store2, createInsertOperation(idA, "a", ROOT_ID, null));
      insertIntoStore(store2, createInsertOperation(idC, "c", idA, null));
      assert.strictEqual(getText(store2), "acb");

      const store3 = makeStore();
      insertIntoStore(store3, createInsertOperation(idA, "a", ROOT_ID, null));
      insertIntoStore(store3, createInsertOperation(idC, "c", idA, null));
      insertIntoStore(store3, createInsertOperation(idB, "b", ROOT_ID, null));
      assert.strictEqual(getText(store3), "acb");
    });

    test("three concurrent inserts at ROOT converge in all orderings", () => {
      const idA = generateOperationId(ALICE, 1);
      const idB = generateOperationId(BOB, 2);
      const idC = generateOperationId(CAROL, 1);

      const orderings = [
        [idA, idB, idC],
        [idA, idC, idB],
        [idB, idA, idC],
        [idB, idC, idA],
        [idC, idA, idB],
        [idC, idB, idA],
      ] as const;

      const ops = {
        [toKey(idA)]: createInsertOperation(idA, "a", ROOT_ID, null),
        [toKey(idB)]: createInsertOperation(idB, "b", ROOT_ID, null),
        [toKey(idC)]: createInsertOperation(idC, "c", ROOT_ID, null),
      };

      for (const order of orderings) {
        const store = makeStore();
        for (const id of order) {
          insertIntoStore(store, ops[toKey(id)]!);
        }
        assert.strictEqual(
          getText(store),
          "acb",
          `failed for ordering ${order.map((id) => toKey(id)).join(", ")}`,
        );
      }
    });

    test("throws on unknown leftOrigin", () => {
      const store = makeStore();
      const missing = generateOperationId(ALICE, 99);
      const id = generateOperationId(ALICE, 0);

      assert.throws(
        () =>
          insertIntoStore(store, createInsertOperation(id, "a", missing, null)),
        /cannot be merged yet/,
      );
    });
  });

  describe("remove", () => {
    test("tombstones a node so getText skips it", () => {
      const store = makeStore();
      const id = generateOperationId(ALICE, 1);

      insertIntoStore(store, createInsertOperation(id, "x", ROOT_ID, null));
      assert.strictEqual(getText(store), "x");

      removeFromStore(store, createDeleteOperation(id, id));

      assert.strictEqual(store.nodes.get(toKey(id))?.tombstone, true);
      assert.strictEqual(getText(store), "");
    });

    test("tombstoned node stays in map as valid anchor", () => {
      const store = makeStore();
      const id = generateOperationId(ALICE, 1);

      insertIntoStore(store, createInsertOperation(id, "x", ROOT_ID, null));
      removeFromStore(store, createDeleteOperation(id, id));

      assert.ok(store.nodes.has(toKey(id)));
      assert.strictEqual(store.nodes.get(toKey(id))?.tombstone, true);
    });

    test("insert anchored to tombstoned node lands correctly", () => {
      const store = makeStore();
      const idA = generateOperationId(ALICE, 1);
      const idB = generateOperationId(ALICE, 2);

      insertIntoStore(store, createInsertOperation(idA, "a", ROOT_ID, null));
      removeFromStore(store, createDeleteOperation(idA, idA));
      insertIntoStore(store, createInsertOperation(idB, "b", idA, null));

      assert.strictEqual(getText(store), "b");
    });

    test("throws when node is not in store", () => {
      const store = makeStore();
      const missing = generateOperationId(ALICE, 99);

      assert.throws(
        () => removeFromStore(store, createDeleteOperation(missing, missing)),
        /not found/,
      );
    });
  });
});
