import { describe, expect, test } from "bun:test";
import { generateClientId, generateOperationId, ROOT_ID, toKey } from "../src/ids";
import {
  createDeleteOperation,
  createInsertOperation,
} from "../src/operations";
import {
  createGCTracker,
  createNode,
  createNodeStore,
  getText,
  insert,
  remove,
  runGC,
} from "../src/store";

const CLIENT = generateClientId();

const seed = (chars: string) => {
  const root = createNode(ROOT_ID, "", false, null, null);
  const store = createNodeStore(root);
  let left = ROOT_ID;
  const ids = [];
  for (let i = 0; i < chars.length; i++) {
    const id = generateOperationId(CLIENT, i);
    insert(
      store,
      createInsertOperation(id, chars[i]!, left, null),
    );
    ids.push(id);
    left = id;
  }
  return { store, ids };
};

describe("runGC", () => {
  test("physically removes an unreferenced tombstone after the grace period", () => {
    const { store, ids } = seed("ab");
    const last = ids[1]!;
    remove(store, createDeleteOperation(last));
    expect(getText(store)).toBe("a");

    const tracker = createGCTracker();
    const frontier = new Map([[CLIENT, 1]]);

    expect(
      runGC(store, frontier, tracker, { gracePeriodMs: 1_000, now: 0 }),
    ).toEqual([]);
    expect(store.nodes.has(toKey(last))).toBe(true);

    expect(
      runGC(store, frontier, tracker, { gracePeriodMs: 1_000, now: 1_000 }),
    ).toEqual([toKey(last)]);
    expect(store.nodes.has(toKey(last))).toBe(false);
    expect(getText(store)).toBe("a");
  });

  test("keeps a tombstone still used as a leftOrigin", () => {
    const { store, ids } = seed("ab");
    const first = ids[0]!;
    remove(store, createDeleteOperation(first));

    const tracker = createGCTracker();
    const frontier = new Map([[CLIENT, 1]]);

    runGC(store, frontier, tracker, { gracePeriodMs: 0, now: 0 });
    runGC(store, frontier, tracker, { gracePeriodMs: 0, now: 1 });

    expect(store.nodes.has(toKey(first))).toBe(true);
    expect(getText(store)).toBe("b");
  });

  test("does not remove tombstones above the frontier", () => {
    const { store, ids } = seed("a");
    const only = ids[0]!;
    remove(store, createDeleteOperation(only));

    const tracker = createGCTracker();
    runGC(store, new Map([[CLIENT, -1]]), tracker, {
      gracePeriodMs: 0,
      now: 0,
    });
    runGC(store, new Map([[CLIENT, -1]]), tracker, {
      gracePeriodMs: 0,
      now: 1,
    });

    expect(store.nodes.has(toKey(only))).toBe(true);
  });

  test("drops a candidate when the frontier retreats", () => {
    const { store, ids } = seed("a");
    const only = ids[0]!;
    remove(store, createDeleteOperation(only));

    const tracker = createGCTracker();
    runGC(store, new Map([[CLIENT, 0]]), tracker, {
      gracePeriodMs: 5_000,
      now: 0,
    });
    expect(tracker.candidates.has(toKey(only))).toBe(true);

    runGC(store, new Map(), tracker, { gracePeriodMs: 5_000, now: 1_000 });
    expect(tracker.candidates.has(toKey(only))).toBe(false);
  });
});
