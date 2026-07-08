import { generateOperationId } from "../ids";
import {
  createDeleteOperation,
  createInsertOperation,
  type Operation,
} from "../operations";
import { findByIndex } from "../skipList";
import { apply } from "./apply";
import type { AppliedOp, Before, Document } from "./types";

const buildOpFromLocalInput = (
  doc: Document,
  insertedText: string,
  insertedLength: number,
  deletedLength: number,
  position: number,
): AppliedOp[] => {
  const applied: AppliedOp[] = [];

  for (let i = 0; i < deletedLength; i++) {
    const op = buildOp(doc, position, "del");
    applied.push({ op, index: apply(doc, op) });
  }

  for (let i = 0; i < insertedLength; i++) {
    const op = buildOp(doc, position + i, "ins", insertedText[i]);
    applied.push({ op, index: apply(doc, op) });
    doc.counter++;
  }

  return applied;
};

export const onBeforeInput = (e: InputEvent, before: Before) => {
  const target = e.target as HTMLTextAreaElement;

  before = {
    start: target.selectionStart,
    end: target.selectionEnd,
    value: target.value,
  };
};

export const onInput = (
  e: InputEvent,
  doc: Document,
  before: Before,
): AppliedOp[] | null => {
  if (!before) return null;

  const deletedLength = before.end - before.start;

  const insertedText =
    e.inputType === "insertLineBreak" ? "\n" : (e.data ?? "");

  switch (e.inputType) {
    case "insertText":
    case "insertLineBreak":
    case "insertFromPaste": {
      return buildOpFromLocalInput(
        doc,
        insertedText,
        insertedText.length,
        deletedLength,
        before.start,
      );
    }

    case "deleteContentBackward":
    case "deleteContentForward":
    case "deleteByCut": {
      const deleteCount = deletedLength > 0 ? deletedLength : 1;
      const deletePosition =
        deletedLength > 0
          ? before.start
          : e.inputType === "deleteContentBackward"
            ? before.start - 1
            : before.start;

      return buildOpFromLocalInput(doc, "", 0, deleteCount, deletePosition);
    }

    default:
      return null;
  }
};

export const buildOp = (
  doc: Document,
  position: number,
  type: "del" | "ins",
  content: string | null = null,
): Operation => {
  if (type === "ins") {
    const predIndex = position - 1;
    const slNodePred =
      predIndex < 0 ? doc.skipList.head : findByIndex(doc.skipList, predIndex);
    if (!slNodePred) throw new Error("no node found");

    const nodeLeft = doc.store.nodes.get(slNodePred.refCrdtKey);
    if (!nodeLeft) throw new Error("no node found");

    const nodeRight = slNodePred.next[0]
      ? doc.store.nodes.get(slNodePred.next[0].refCrdtKey)
      : null;

    const opId = generateOperationId(doc.clientId, doc.counter);
    const op = createInsertOperation(
      opId,
      content!,
      nodeLeft.id,
      nodeRight?.id,
    );

    return op;
  } else {
    const slNodePred = findByIndex(doc.skipList, position);
    if (!slNodePred) throw new Error("no node found");

    const node = doc.store.nodes.get(slNodePred.refCrdtKey);
    if (!node) throw new Error("no node found");

    const op = createDeleteOperation(node.id);
    return op;
  }
};
