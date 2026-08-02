import { describe, expect, test } from "bun:test";
import {
  apply,
  createInsertOperation,
  createReplica,
  generateOperationId,
  getText,
  ROOT_ID,
  toKey,
  type ClientId,
} from "@weavo/core";
import { addToBuffer, canApply, createBuffer, flush } from "../src/buffer";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" as ClientId;

describe("OperationBuffer", () => {
  test("createBuffer starts with empty maps", () => {
    const buffer = createBuffer();
    expect(buffer.waiting.size).toBe(0);
    expect(buffer.buffered.size).toBe(0);
    expect(buffer.pendingDeletes.size).toBe(0);
  });

  test("buffers an insert until its left origin exists", () => {
    const doc = createReplica(ALICE);
    const buffer = createBuffer();
    const left = generateOperationId(BOB, 0);
    const dependent = createInsertOperation(
      generateOperationId(ALICE, 0),
      "a",
      left,
      null,
    );

    expect(canApply(doc, dependent)).toBe(false);
    addToBuffer(buffer, doc, dependent);

    expect(buffer.buffered.size).toBe(1);
    expect(getText(doc.store)).toBe("");

    const leftOp = createInsertOperation(left, "x", ROOT_ID, null);
    apply(doc, leftOp);

    const applied = flush(buffer, doc, leftOp);
    expect(applied).toHaveLength(1);
    expect(getText(doc.store)).toBe("xa");
    expect(buffer.buffered.size).toBe(0);
  });

  test("flush chains dependent inserts blocked on each other", () => {
    const doc = createReplica(ALICE);
    const buffer = createBuffer();

    const firstId = generateOperationId(BOB, 0);
    const secondId = generateOperationId(BOB, 1);

    const second = createInsertOperation(secondId, "b", firstId, null);
    const first = createInsertOperation(firstId, "a", ROOT_ID, null);

    addToBuffer(buffer, doc, second);
    apply(doc, first);

    const applied = flush(buffer, doc, first);
    expect(applied).toHaveLength(1);
    expect(getText(doc.store)).toBe("ab");
  });

  test("buffers delete ops until the target exists", () => {
    const doc = createReplica(ALICE);
    const buffer = createBuffer();
    const target = generateOperationId(BOB, 0);
    const insert = createInsertOperation(target, "a", ROOT_ID, null);
    const del = { type: "delete" as const, target };

    addToBuffer(buffer, doc, del);
    expect(buffer.pendingDeletes.has(toKey(target))).toBe(true);

    apply(doc, insert);
    expect(flush(buffer, doc, del)).toEqual([]);
    expect(buffer.pendingDeletes.size).toBe(0);
  });

  test("separate buffers do not share queued operations", () => {
    const docA = createReplica(ALICE);
    const docB = createReplica(BOB);
    const bufferA = createBuffer();
    const bufferB = createBuffer();

    const missingLeft = generateOperationId(BOB, 0);
    const dependent = createInsertOperation(
      generateOperationId(ALICE, 0),
      "z",
      missingLeft,
      null,
    );

    addToBuffer(bufferA, docA, dependent);
    expect(bufferA.buffered.size).toBe(1);
    expect(bufferB.buffered.size).toBe(0);

    const leftOp = createInsertOperation(missingLeft, "x", ROOT_ID, null);
    apply(docB, leftOp);

    expect(flush(bufferB, docB, leftOp)).toHaveLength(0);
    expect(bufferA.buffered.size).toBe(1);
    expect(getText(docA.store)).toBe("");
    expect(getText(docB.store)).toBe("x");
  });
});
