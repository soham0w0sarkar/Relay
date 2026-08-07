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
import {
  addToBuffer,
  canApply,
  createBuffer,
  flush,
  flushMembership,
  membershipKey,
  pendingMembershipVersion,
  resolveOperation,
  unresolvedClientId,
} from "../src/buffer";

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

describe("operations waiting on a membership version", () => {
  const membershipOf = (version: number, members: ClientId[]) => ({
    getVersion: (asked: number) =>
      asked === version
        ? {
            version,
            members: members.map((clientId, shortId) => ({
              clientId,
              shortId,
            })),
          }
        : null,
  });

  test("canApply refuses an op whose shortIds are still unresolved", () => {
    const doc = createReplica(ALICE);
    const op = createInsertOperation(
      [unresolvedClientId(3, 1), 0],
      "a",
      ROOT_ID,
      null,
    );

    expect(pendingMembershipVersion(op)).toBe(3);
    expect(canApply(doc, op)).toBe(false);
  });

  test("parks the op under its membership version, then applies on arrival", () => {
    const doc = createReplica(ALICE);
    const buffer = createBuffer();
    const op = createInsertOperation(
      [unresolvedClientId(3, 1), 0],
      "a",
      ROOT_ID,
      null,
    );

    addToBuffer(buffer, doc, op);
    expect(buffer.waiting.get(membershipKey(3))?.size).toBe(1);
    expect(getText(doc.store)).toBe("");

    const applied = flushMembership(buffer, doc, membershipOf(3, [ALICE, BOB]));

    expect(applied).toHaveLength(1);
    expect(applied[0]!.op).toEqual(
      createInsertOperation([BOB, 0], "a", ROOT_ID, null),
    );
    expect(getText(doc.store)).toBe("a");
    expect(buffer.waiting.size).toBe(0);
    expect(buffer.buffered.size).toBe(0);
  });

  test("leaves ops parked when a different version arrives", () => {
    const doc = createReplica(ALICE);
    const buffer = createBuffer();
    const op = createInsertOperation(
      [unresolvedClientId(3, 1), 0],
      "a",
      ROOT_ID,
      null,
    );

    addToBuffer(buffer, doc, op);

    expect(flushMembership(buffer, doc, membershipOf(2, [ALICE]))).toEqual([]);
    expect(buffer.waiting.get(membershipKey(3))?.size).toBe(1);
  });

  test("resolved op still missing its origin falls back to dependency waiting", () => {
    const doc = createReplica(ALICE);
    const buffer = createBuffer();
    const missingLeft = generateOperationId(ALICE, 7);
    const op = createInsertOperation(
      [unresolvedClientId(3, 1), 0],
      "z",
      missingLeft,
      null,
    );

    addToBuffer(buffer, doc, op);
    expect(flushMembership(buffer, doc, membershipOf(3, [ALICE, BOB]))).toEqual(
      [],
    );

    expect(buffer.waiting.get(membershipKey(3))).toBeUndefined();
    expect(buffer.waiting.get(toKey(missingLeft))?.size).toBe(1);
    expect(buffer.buffered.get(toKey([BOB, 0]))).toBeDefined();

    const leftOp = createInsertOperation(missingLeft, "x", ROOT_ID, null);
    apply(doc, leftOp);

    expect(flush(buffer, doc, leftOp)).toHaveLength(1);
    expect(getText(doc.store)).toBe("xz");
  });

  test("parks a delete whose target is unresolved", () => {
    const doc = createReplica(ALICE);
    const buffer = createBuffer();
    const insert = createInsertOperation([BOB, 0], "a", ROOT_ID, null);
    apply(doc, insert);

    const del = {
      type: "delete" as const,
      target: [unresolvedClientId(3, 1), 0] as [ClientId, number],
    };

    addToBuffer(buffer, doc, del);
    expect(buffer.waiting.get(membershipKey(3))?.size).toBe(1);

    const applied = flushMembership(buffer, doc, membershipOf(3, [ALICE, BOB]));

    expect(applied).toHaveLength(1);
    expect(getText(doc.store)).toBe("");
    expect(buffer.pendingDeletes.size).toBe(0);
  });

  test("resolveOperation rewrites every unresolved id in one op", () => {
    const op = createInsertOperation(
      [unresolvedClientId(3, 1), 2],
      "q",
      [unresolvedClientId(3, 0), 1],
      null,
    );

    expect(resolveOperation(op, membershipOf(3, [ALICE, BOB]))).toEqual(
      createInsertOperation([BOB, 2], "q", [ALICE, 1], null),
    );
  });
});
