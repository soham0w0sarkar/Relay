import { describe, expect, test } from "bun:test";
import {
  apply,
  createInsertOperation,
  createReplica,
  generateOperationId,
  getText,
  replayOperations,
  restoreFromStorage,
  restoreSnapshot,
  takeSnapshot,
  type ClientId,
} from "../src";
import { ROOT_ID } from "../src/ids/RootId";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" as ClientId;

describe("DocumentSnapshot", () => {
  test("round-trips document state and state vector", () => {
    const doc = createReplica(ALICE);
    const left = generateOperationId(BOB, 0);
    const right = generateOperationId(BOB, 1);

    apply(doc, createInsertOperation(left, "h", ROOT_ID, null));
    apply(doc, createInsertOperation(right, "i", left, null));

    const sv = new Map<ClientId, number>([[BOB, 1]]);
    const snapshot = takeSnapshot(doc, sv);
    const { doc: restored, stateVector } = restoreSnapshot(snapshot);

    expect(getText(restored.store)).toBe("hi");
    expect(restored.counter).toBe(doc.counter);
    expect(stateVector.get(BOB)).toBe(1);
    expect(restored.skipList.length).toBe(doc.skipList.length);
  });

  test("restoreFromStorage replays base snapshot plus delta", () => {
    const doc = createReplica(ALICE);
    const sv = new Map<ClientId, number>();

    const first = createInsertOperation(
      generateOperationId(ALICE, 0),
      "hel",
      ROOT_ID,
      null,
    );
    apply(doc, first);
    sv.set(ALICE, 0);

    const snapshot = takeSnapshot(doc, sv);

    const second = createInsertOperation(
      generateOperationId(BOB, 0),
      "lo",
      first.id,
      null,
    );
    const delta = [second];

    const restored = restoreFromStorage(snapshot, delta);
    expect(getText(restored.doc.store)).toBe("hello");
    expect(restored.stateVector.get(ALICE)).toBe(0);
    expect(restored.stateVector.get(BOB)).toBe(0);
  });

  test("replayOperations applies ops incrementally", () => {
    const { doc, stateVector } = restoreSnapshot(
      takeSnapshot(createReplica(ALICE), new Map()),
    );

    replayOperations(doc, stateVector, [
      createInsertOperation(generateOperationId(ALICE, 0), "a", ROOT_ID, null),
      createInsertOperation(
        generateOperationId(ALICE, 1),
        "b",
        generateOperationId(ALICE, 0),
        null,
      ),
    ]);

    expect(getText(doc.store)).toBe("ab");
    expect(stateVector.get(ALICE)).toBe(1);
  });
});
