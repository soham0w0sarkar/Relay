import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { generateClientId } from "../src/ids/ClientId";
import { generateOperationId } from "../src/ids/OperationId";
import { createNode } from "../src/store/Node";
import {
  createSkipList,
  findByIndex,
  insert,
  remove,
} from "../src/skipList/skipList";

describe("SkipList", () => {
  let originalRandom: typeof Math.random;
  let opCounter = 0;
  const clientId = generateClientId();

  const makeNode = (value: string) => {
    const id = generateOperationId(clientId, opCounter++);
    return createNode(id, value, false, null);
  };

  beforeEach(() => {
    originalRandom = Math.random;
    Math.random = () => 0.99;
  });

  afterEach(() => {
    Math.random = originalRandom;
    opCounter = 0;
  });

  describe("createSkipList", () => {
    test("starts empty with head referencing root node", () => {
      const root = makeNode("root");
      const sl = createSkipList(root);

      assert.strictEqual(sl.length, 0);
      assert.strictEqual(sl.head.refCrdtNode, root);
    });
  });

  describe("findByIndex", () => {
    test("returns null on empty list", () => {
      const sl = createSkipList(makeNode("root"));
      assert.strictEqual(findByIndex(sl, 0), null);
    });

    test("returns null when index equals length", () => {
      const sl = createSkipList(makeNode("root"));
      const a = makeNode("a");
      insert(sl, 0, a);
      assert.strictEqual(findByIndex(sl, 1), null);
    });

    test("returns null when index is past end", () => {
      const sl = createSkipList(makeNode("root"));
      insert(sl, 0, makeNode("a"));
      assert.strictEqual(findByIndex(sl, 5), null);
    });

    test("returns the node at each valid index after sequential appends", () => {
      const sl = createSkipList(makeNode("root"));
      const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
      insert(sl, 0, nodes[0]);
      insert(sl, 1, nodes[1]);
      insert(sl, 2, nodes[2]);

      assert.strictEqual(sl.length, 3);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtNode, nodes[0]);
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtNode, nodes[1]);
      assert.strictEqual(findByIndex(sl, 2)?.refCrdtNode, nodes[2]);
    });

    test("respects inserts at the front", () => {
      const sl = createSkipList(makeNode("root"));
      const first = makeNode("first");
      const second = makeNode("second");
      insert(sl, 0, first);
      insert(sl, 0, second);

      assert.strictEqual(sl.length, 2);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtNode, second);
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtNode, first);
    });

    test("respects insert in the middle", () => {
      const sl = createSkipList(makeNode("root"));
      const a = makeNode("a");
      const b = makeNode("b");
      const mid = makeNode("mid");
      insert(sl, 0, a);
      insert(sl, 1, b);
      insert(sl, 1, mid);

      assert.strictEqual(sl.length, 3);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtNode, a);
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtNode, mid);
      assert.strictEqual(findByIndex(sl, 2)?.refCrdtNode, b);
    });
  });

  describe("insert", () => {
    test("increments length", () => {
      const sl = createSkipList(makeNode("root"));
      insert(sl, 0, makeNode("x"));
      assert.strictEqual(sl.length, 1);
      insert(sl, 1, makeNode("y"));
      assert.strictEqual(sl.length, 2);
    });
  });

  describe("remove", () => {
    test("returns false and does not change length when node is absent", () => {
      const sl = createSkipList(makeNode("root"));
      insert(sl, 0, makeNode("present"));
      const ghost = makeNode("ghost");

      assert.strictEqual(remove(sl, ghost), false);
      assert.strictEqual(sl.length, 1);
    });

    test("returns false on empty list", () => {
      const sl = createSkipList(makeNode("root"));
      assert.strictEqual(remove(sl, makeNode("x")), false);
      assert.strictEqual(sl.length, 0);
    });

    test("removes by reference and decrements length", () => {
      const sl = createSkipList(makeNode("root"));
      const a = makeNode("a");
      const b = makeNode("b");
      insert(sl, 0, a);
      insert(sl, 1, b);

      assert.strictEqual(remove(sl, a), true);
      assert.strictEqual(sl.length, 1);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtNode, b);
      assert.strictEqual(findByIndex(sl, 1), null);
    });

    test("removing tail leaves head index stable", () => {
      const sl = createSkipList(makeNode("root"));
      const a = makeNode("a");
      const b = makeNode("b");
      insert(sl, 0, a);
      insert(sl, 1, b);

      assert.strictEqual(remove(sl, b), true);
      assert.strictEqual(sl.length, 1);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtNode, a);
    });

    test("removing middle node preserves order of neighbors", () => {
      const sl = createSkipList(makeNode("root"));
      const a = makeNode("a");
      const b = makeNode("b");
      const c = makeNode("c");
      insert(sl, 0, a);
      insert(sl, 1, b);
      insert(sl, 2, c);

      assert.strictEqual(remove(sl, b), true);
      assert.strictEqual(sl.length, 2);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtNode, a);
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtNode, c);
    });

    test("requires the same object reference as stored CRDT node", () => {
      const sl = createSkipList(makeNode("root"));
      const id = generateOperationId(clientId, 999);
      const stored = createNode(id, "same-id", false, null);
      const duplicate = createNode(id, "same-id", false, null);
      insert(sl, 0, stored);

      assert.strictEqual(remove(sl, duplicate), false);
      assert.strictEqual(sl.length, 1);
      assert.strictEqual(remove(sl, stored), true);
      assert.strictEqual(sl.length, 0);
    });
  });

  describe("integration", () => {
    test("interleaved insert, find, and remove stay consistent", () => {
      const sl = createSkipList(makeNode("root"));
      const n0 = makeNode("0");
      const n1 = makeNode("1");
      const n2 = makeNode("2");

      insert(sl, 0, n0);
      insert(sl, 0, n1);
      insert(sl, 2, n2);
      assert.strictEqual(sl.length, 3);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtNode, n1);
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtNode, n0);
      assert.strictEqual(findByIndex(sl, 2)?.refCrdtNode, n2);

      remove(sl, n0);
      assert.strictEqual(sl.length, 2);
      assert.strictEqual(findByIndex(sl, 0)?.refCrdtNode, n1);
      assert.strictEqual(findByIndex(sl, 1)?.refCrdtNode, n2);
    });
  });
});
