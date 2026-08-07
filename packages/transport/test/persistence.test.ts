import { describe, expect, test } from "bun:test";
import {
  apply,
  createInsertOperation,
  createReplica,
  generateOperationId,
  getText,
  restoreFromStorage,
  takeSnapshot,
  type ClientId,
} from "@weavo/core";
import { ROOT_ID } from "@weavo/core";
import {
  base64ToBytes,
  bytesToBase64,
  decodeDelta,
  decodeDocumentSnapshot,
  encodeDelta,
  encodeDocumentSnapshot,
} from "../src/codec";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

describe("persistence codec", () => {
  test("round-trips a document snapshot denser than JSON", () => {
    const doc = createReplica(ALICE);
    const left = generateOperationId(BOB, 0);
    const right = generateOperationId(BOB, 1);
    apply(doc, createInsertOperation(left, "h", ROOT_ID, null));
    apply(doc, createInsertOperation(right, "i", left, null));

    const snapshot = takeSnapshot(doc, new Map([[BOB, 1]]));
    const bytes = encodeDocumentSnapshot(snapshot);
    const restored = decodeDocumentSnapshot(bytes);

    expect(restored).toEqual(snapshot);
    expect(bytes.byteLength).toBeLessThan(JSON.stringify(snapshot).length);

    const { doc: live } = restoreFromStorage(restored);
    expect(getText(live.store)).toBe("hi");
  });

  test("round-trips a delta log", () => {
    const ops = [
      createInsertOperation(generateOperationId(ALICE, 0), "a", ROOT_ID, null),
      createInsertOperation(
        generateOperationId(ALICE, 1),
        "b",
        generateOperationId(ALICE, 0),
        null,
      ),
    ];

    const bytes = encodeDelta(ops);
    expect(decodeDelta(bytes)).toEqual(ops);
    expect(bytes.byteLength).toBeLessThan(JSON.stringify(ops).length);
  });

  test("base64 helpers round-trip for localStorage-style storage", () => {
    const snapshot = takeSnapshot(createReplica(ALICE), new Map());
    const encoded = bytesToBase64(encodeDocumentSnapshot(snapshot));
    expect(decodeDocumentSnapshot(base64ToBytes(encoded))).toEqual(snapshot);
  });
});
