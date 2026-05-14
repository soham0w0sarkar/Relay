import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import fc from "fast-check";
import type { ClientId, OperationId } from "../src/ids/types";
import { generateOperationId, toKey } from "../src/ids/OperationId";
import { ROOT_ID } from "../src/ids/RootId";
import { createDeleteOperation } from "../src/operations/delete";
import { createInsertOperation } from "../src/operations/insert";
import type { DeleteOperation, InsertOperation } from "../src/operations/types";
import { createNode } from "../src/store/Node";
import {
  createNodeStore,
  getText,
  insert as insertIntoStore,
  remove as removeFromStore,
} from "../src/store/NodeStore";

// ─── helpers ────────────────────────────────────────────────────────────────

const CLIENT = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" as ClientId;

type StoreOp = InsertOperation | DeleteOperation;

function makeStore() {
  const root = createNode(ROOT_ID, "", false, null, null);
  return createNodeStore(root);
}

function applyOp(store: ReturnType<typeof makeStore>, op: StoreOp) {
  if (op.type === "insert") insertIntoStore(store, op);
  else removeFromStore(store, op);
}

function runPermutation(ops: StoreOp[], order: number[]): string {
  const store = makeStore();
  for (const idx of order) applyOp(store, ops[idx]!);
  return getText(store);
}

// ─── deterministic RNG ──────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0 || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx;
}

// ─── causal permutation ──────────────────────────────────────────────────────
// picks a random valid ordering — one where every op's dependencies
// (leftOrigin for inserts, target for deletes) are already present

function causalPermutation(ops: StoreOp[], seed: number): number[] {
  const rand = rng(seed);
  const remaining = new Set(ops.map((_, i) => i));
  const order: number[] = [];
  const present = new Set<string>([toKey(ROOT_ID)]);

  while (remaining.size > 0) {
    const ready: number[] = [];
    for (const i of remaining) {
      const op = ops[i]!;
      if (op.type === "insert" && !present.has(toKey(op.leftOrigin))) continue;
      if (op.type === "delete" && !present.has(toKey(op.id))) continue;
      ready.push(i);
    }
    assert.ok(ready.length > 0, "deadlock — invalid op batch");
    const pick = ready[Math.floor(rand() * ready.length)]!;
    order.push(pick);
    remaining.delete(pick);
    const op = ops[pick]!;
    if (op.type === "insert") present.add(toKey(op.id));
  }
  return order;
}

// ─── op generator ────────────────────────────────────────────────────────────
// builds a realistic op sequence using a reference store to derive rightOrigin

function buildOps(bytes: Uint8Array): StoreOp[] {
  const ref = makeStore();
  const nodeIds: OperationId[] = [ROOT_ID];
  const ops: StoreOp[] = [];
  let counter = 0;
  let i = 0;

  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0;
    const doDelete = nodeIds.length > 1 && (b0 & 1) === 1;

    if (!doDelete) {
      // pick a leftOrigin from known nodes
      const idx = nodeIds.length <= 1 ? 0 : (bytes[i++] ?? 0) % nodeIds.length;
      const leftOriginId = nodeIds[idx]!;

      // derive rightOrigin from the reference store's current state
      const leftNode = ref.nodes.get(toKey(leftOriginId))!;
      const rightOriginId = leftNode.next?.id ?? null;

      const id = generateOperationId(CLIENT, counter++);
      const ch = String.fromCharCode(97 + ((bytes[i++] ?? 0) % 26));
      const op = createInsertOperation(id, ch, leftOriginId, rightOriginId);

      insertIntoStore(ref, op);
      ops.push(op);
      nodeIds.push(id);
    } else {
      // pick a live (non-tombstoned) node to delete
      const alive = nodeIds.slice(1).filter((id) => {
        const n = ref.nodes.get(toKey(id));
        return n && !n.tombstone;
      });
      if (alive.length === 0) {
        i++;
        continue;
      }
      const victim = alive[(bytes[i++] ?? 0) % alive.length]!;
      const op = createDeleteOperation(victim, victim);
      removeFromStore(ref, op);
      ops.push(op);
    }
  }
  return ops;
}

// ─── unit tests ─────────────────────────────────────────────────────────────

describe("NodeStore — unit", () => {
  test("empty store returns empty string", () => {
    assert.strictEqual(getText(makeStore()), "");
  });

  test("single insert after root", () => {
    const store = makeStore();
    const id = generateOperationId(CLIENT, 0);
    insertIntoStore(store, createInsertOperation(id, "a", ROOT_ID, null));
    assert.strictEqual(getText(store), "a");
    assert.ok(store.nodes.has(toKey(id)));
    assert.strictEqual(store.root.next?.id, id);
  });

  test("chained inserts preserve order", () => {
    const store = makeStore();
    const id0 = generateOperationId(CLIENT, 0);
    const id1 = generateOperationId(CLIENT, 1);
    const id2 = generateOperationId(CLIENT, 2);
    insertIntoStore(store, createInsertOperation(id0, "a", ROOT_ID, null));
    insertIntoStore(store, createInsertOperation(id1, "b", id0, null));
    insertIntoStore(store, createInsertOperation(id2, "c", id1, null));
    assert.strictEqual(getText(store), "abc");
  });

  test("concurrent inserts at root — lower counter wins (goes left)", () => {
    const store = makeStore();
    // counter 2 inserted first (higher counter = lower priority = goes right)
    const idHigh = generateOperationId(CLIENT, 2);
    const idLow = generateOperationId(CLIENT, 1);
    insertIntoStore(store, createInsertOperation(idHigh, "z", ROOT_ID, null));
    insertIntoStore(store, createInsertOperation(idLow, "a", ROOT_ID, null));
    assert.strictEqual(getText(store), "az");
  });

  test("tombstone hides node from getText", () => {
    const store = makeStore();
    const id = generateOperationId(CLIENT, 0);
    insertIntoStore(store, createInsertOperation(id, "x", ROOT_ID, null));
    assert.strictEqual(getText(store), "x");
    removeFromStore(store, createDeleteOperation(id, id));
    assert.strictEqual(getText(store), "");
    // node still in map — future ops can use it as leftOrigin
    assert.ok(store.nodes.has(toKey(id)));
    assert.strictEqual(store.nodes.get(toKey(id))?.tombstone, true);
  });

  test("insert after tombstoned node uses it as valid anchor", () => {
    const store = makeStore();
    const id0 = generateOperationId(CLIENT, 0);
    const id1 = generateOperationId(CLIENT, 1);
    insertIntoStore(store, createInsertOperation(id0, "a", ROOT_ID, null));
    removeFromStore(store, createDeleteOperation(id0, id0));
    // id1 references tombstoned id0 as leftOrigin — must still work
    insertIntoStore(store, createInsertOperation(id1, "b", id0, null));
    assert.strictEqual(getText(store), "b");
  });

  test("delete throws on unknown node", () => {
    const store = makeStore();
    const missing = generateOperationId(CLIENT, 99);
    assert.throws(
      () => removeFromStore(store, createDeleteOperation(missing, missing)),
      /not found/,
    );
  });

  test("insert throws on unknown leftOrigin", () => {
    const store = makeStore();
    const missing = generateOperationId(CLIENT, 99);
    const id = generateOperationId(CLIENT, 0);
    assert.throws(
      () =>
        insertIntoStore(store, createInsertOperation(id, "a", missing, null)),
      /not found/,
    );
  });
});

// ─── property tests ──────────────────────────────────────────────────────────

describe("NodeStore — convergence", () => {
  test("concurrent ROOT-origin inserts converge under any ordering", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 10_000 }),
            fc.constantFrom("a", "b", "c", "x"),
          ),
          { minLength: 1, maxLength: 60 },
        ),
        fc.integer(),
        (pairs, seed) => {
          // all ops have same leftOrigin=ROOT, rightOrigin=null
          // this is the pure concurrent case
          const ops: InsertOperation[] = pairs.map(([ctr, ch]) =>
            createInsertOperation([CLIENT, ctr], ch, ROOT_ID, null),
          );
          const order1 = ops.map((_, i) => i);
          const order2 = shuffledIndices(ops.length, seed);
          assert.strictEqual(
            runPermutation(ops, order1),
            runPermutation(ops, order2),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  test("realistic insert/delete sequences converge under any causal ordering", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 24, maxLength: 180 }),
        fc.integer(),
        fc.integer(),
        (bytes, seed1, seed2) => {
          const ops = buildOps(bytes);
          if (ops.length === 0) return;
          const order1 = causalPermutation(ops, seed1);
          const order2 = causalPermutation(ops, seed2);
          const t1 = runPermutation(ops, order1);
          const t2 = runPermutation(ops, order2);

          if (t1 !== t2) {
            console.log("\n=== DIVERGENCE ===");
            ops.forEach((op, i) => {
              if (op.type === "insert") {
                console.log(
                  `[${i}] INSERT id=:${op.id[1]} val="${op.value}" left=:${op.leftOrigin[1]} right=${op.rightOrigin ? ":" + op.rightOrigin[1] : "null"}`,
                );
              } else {
                console.log(`[${i}] DELETE :${op.id[1]}`);
              }
            });
            console.log("ORDER1:", order1);
            console.log("ORDER2:", order2);
            console.log("T1:", t1);
            console.log("T2:", t2);
          }

          assert.strictEqual(t1, t2);
        },
      ),
      { numRuns: 200, seed: 2071779549 },
    );
  });
});

// ─── load tests ──────────────────────────────────────────────────────────────

describe("NodeStore — load", () => {
  test("100k chained inserts complete under 10s", () => {
    const store = makeStore();
    const CLIENT2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as ClientId;
    const n = 100_000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const left: OperationId =
        i === 0 ? ROOT_ID : generateOperationId(CLIENT2, i - 1);
      insertIntoStore(
        store,
        createInsertOperation(generateOperationId(CLIENT2, i), "z", left, null),
      );
    }
    const ms = performance.now() - t0;
    assert.strictEqual(getText(store).length, n);
    console.log(`100k chained inserts: ${ms.toFixed(0)}ms`);
    assert.ok(ms < 10_000, `too slow: ${ms}ms`);
  });

  test("40k inserts + 20k tombstones complete under 10s", () => {
    const store = makeStore();
    const CLIENT3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as ClientId;
    const n = 40_000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const left: OperationId =
        i === 0 ? ROOT_ID : generateOperationId(CLIENT3, i - 1);
      insertIntoStore(
        store,
        createInsertOperation(generateOperationId(CLIENT3, i), "m", left, null),
      );
    }
    for (let i = 0; i < n; i += 2) {
      removeFromStore(
        store,
        createDeleteOperation(
          generateOperationId(CLIENT3, i),
          generateOperationId(CLIENT3, i),
        ),
      );
    }
    const ms = performance.now() - t0;
    assert.strictEqual(getText(store).length, n / 2);
    console.log(`40k inserts + 20k deletes: ${ms.toFixed(0)}ms`);
    assert.ok(ms < 10_000, `too slow: ${ms}ms`);
  });

  // this one is intentionally slow — O(n²) scan. documents the known cost.
  test("10k ROOT-sibling inserts — documents O(n²) scan cost", () => {
    const store = makeStore();
    const CLIENT4 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as ClientId;
    const n = 10_000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      insertIntoStore(
        store,
        createInsertOperation(
          generateOperationId(CLIENT4, i),
          "q",
          ROOT_ID,
          null,
        ),
      );
    }
    const ms = performance.now() - t0;
    assert.strictEqual(getText(store).length, n);
    console.log(`10k ROOT-sibling inserts (O(n²)): ${ms.toFixed(0)}ms`);
    // no time assertion — this is documenting known quadratic behaviour
    // fix: add rightOrigin to bound the scan
  });
});
