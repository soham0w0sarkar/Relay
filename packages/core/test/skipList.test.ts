import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  generateClientId,
  generateOperationId,
  ROOT_ID,
  toKey,
  type OperationId,
} from "../src/ids";
import {
  createSkipList,
  findByIndex,
  findIndex,
  insert,
  remove,
} from "../src/skipList";

describe("SkipList", () => {
  let originalRandom: typeof Math.random;
  let opCounter = 0;
  const clientId = generateClientId();

  const makeId = (): OperationId => generateOperationId(clientId, opCounter++);

  beforeEach(() => {
    originalRandom = Math.random;
    Math.random = () => 0.99;
  });

  afterEach(() => {
    Math.random = originalRandom;
    opCounter = 0;
  });

  describe("createSkipList", () => {
    test("starts empty with head referencing root key", () => {
      const sl = createSkipList();

      assert.strictEqual(sl.length, 0);
      assert.strictEqual(sl.head.refCrdtKey, toKey(ROOT_ID));
    });
  });

  describe("findIndex", () => {
    test("returns -1 for unknown id", () => {
      const sl = createSkipList();
      assert.strictEqual(findIndex(sl, makeId()), -1);
    });

    test("returns index for inserted nodes", () => {
      const sl = createSkipList();
      const a = makeId();
      const b = makeId();
      insert(sl, 0, a);
      insert(sl, 1, b);

      assert.strictEqual(findIndex(sl, a), 0);
      assert.strictEqual(findIndex(sl, b), 1);
    });
  });

  describe("findByIndex", () => {
    test("returns null on empty list", () => {
      const sl = createSkipList();
      assert.strictEqual(findByIndex(sl, 0), null);
    });

    test("returns null when index equals length", () => {
      const sl = createSkipList();
      const a = makeId();
      insert(sl, 0, a);
      assert.strictEqual(findByIndex(sl, 1), null);
    });

    test("returns null when index is past end", () => {
      const sl = createSkipList();
      insert(sl, 0, makeId());
      assert.strictEqual(findByIndex(sl, 5), null);
    });

    test("returns the node at each valid index after sequential appends", () => {
      const sl = createSkipList();
      const ids = [makeId(), makeId(), makeId()];
      insert(sl, 0, ids[0]);
      insert(sl, 1, ids[1]);
      insert(sl, 2, ids[2]);

      assert.strictEqual(sl.length, 3);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtKey, toKey(ids[0]));
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtKey, toKey(ids[1]));
      assert.strictEqual(findByIndex(sl, 2)?.refCrdtKey, toKey(ids[2]));
    });

    test("respects inserts at the front", () => {
      const sl = createSkipList();
      const first = makeId();
      const second = makeId();
      insert(sl, 0, first);
      insert(sl, 0, second);

      assert.strictEqual(sl.length, 2);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtKey, toKey(second));
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtKey, toKey(first));
    });

    test("respects insert in the middle", () => {
      const sl = createSkipList();
      const a = makeId();
      const b = makeId();
      const mid = makeId();
      insert(sl, 0, a);
      insert(sl, 1, b);
      insert(sl, 1, mid);

      assert.strictEqual(sl.length, 3);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtKey, toKey(a));
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtKey, toKey(mid));
      assert.strictEqual(findByIndex(sl, 2)?.refCrdtKey, toKey(b));
    });
  });

  describe("insert", () => {
    test("increments length", () => {
      const sl = createSkipList();
      insert(sl, 0, makeId());
      assert.strictEqual(sl.length, 1);
      insert(sl, 1, makeId());
      assert.strictEqual(sl.length, 2);
    });
  });

  describe("remove", () => {
    test("returns false and does not change length when id is absent", () => {
      const sl = createSkipList();
      insert(sl, 0, makeId());
      const ghost = makeId();

      assert.strictEqual(remove(sl, ghost), false);
      assert.strictEqual(sl.length, 1);
    });

    test("returns false on empty list", () => {
      const sl = createSkipList();
      assert.strictEqual(remove(sl, makeId()), false);
      assert.strictEqual(sl.length, 0);
    });

    test("removes by operation id and decrements length", () => {
      const sl = createSkipList();
      const a = makeId();
      const b = makeId();
      insert(sl, 0, a);
      insert(sl, 1, b);

      assert.strictEqual(remove(sl, a), true);
      assert.strictEqual(sl.length, 1);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtKey, toKey(b));
      assert.strictEqual(findByIndex(sl, 1), null);
    });

    test("removing tail leaves head index stable", () => {
      const sl = createSkipList();
      const a = makeId();
      const b = makeId();
      insert(sl, 0, a);
      insert(sl, 1, b);

      assert.strictEqual(remove(sl, b), true);
      assert.strictEqual(sl.length, 1);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtKey, toKey(a));
    });

    test("removing middle node preserves order of neighbors", () => {
      const sl = createSkipList();
      const a = makeId();
      const b = makeId();
      const c = makeId();
      insert(sl, 0, a);
      insert(sl, 1, b);
      insert(sl, 2, c);

      assert.strictEqual(remove(sl, b), true);
      assert.strictEqual(sl.length, 2);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtKey, toKey(a));
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtKey, toKey(c));
    });

    test("removes by operation id, not node object identity", () => {
      const sl = createSkipList();
      const id = generateOperationId(clientId, 999);
      insert(sl, 0, id);

      const sameId: OperationId = [id[0], id[1]];
      assert.strictEqual(remove(sl, sameId), true);
      assert.strictEqual(sl.length, 0);
    });
  });

  describe("integration", () => {
    test("interleaved insert, find, and remove stay consistent", () => {
      const sl = createSkipList();
      const id0 = makeId();
      const id1 = makeId();
      const id2 = makeId();

      insert(sl, 0, id0);
      insert(sl, 0, id1);
      insert(sl, 2, id2);
      assert.strictEqual(sl.length, 3);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtKey, toKey(id1));
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtKey, toKey(id0));
      assert.strictEqual(findByIndex(sl, 2)?.refCrdtKey, toKey(id2));

      remove(sl, id0);
      assert.strictEqual(sl.length, 2);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtKey, toKey(id1));
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtKey, toKey(id2));
    });

    test("random-height middle inserts and removes stay consistent", () => {
      Math.random = originalRandom;
      const sl = createSkipList();
      const order: OperationId[] = [];

      for (let i = 0; i < 500; i++) {
        if (order.length === 0 || Math.random() < 0.65) {
          const idx =
            order.length === 0
              ? 0
              : Math.floor(Math.random() * (order.length + 1));
          const id = makeId();
          insert(sl, idx, id);
          order.splice(idx, 0, id);
        } else {
          const idx = Math.floor(Math.random() * order.length);
          remove(sl, order[idx]!);
          order.splice(idx, 1);
        }

        assert.strictEqual(sl.length, order.length);
        for (let j = 0; j < order.length; j++) {
          assert.strictEqual(findByIndex(sl, j)?.refCrdtKey, toKey(order[j]!));
          assert.strictEqual(findIndex(sl, order[j]!), j);
        }
      }
    });
  });
});
