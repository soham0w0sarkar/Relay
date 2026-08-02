import type { Operation } from "@weavo/core";
import type { TextChange } from "./types";

export const applyTextChange = (value: string, change: TextChange): string => {
  if (change.insert) {
    return (
      value.slice(0, change.index) + change.insert + value.slice(change.index)
    );
  }

  if (change.delete) {
    return (
      value.slice(0, change.index) + value.slice(change.index + change.delete)
    );
  }

  return value;
};

export const toTextChange = (op: Operation, index: number): TextChange => {
  if (op.type === "insert") return { index, insert: op.value };
  return { index, delete: 1 };
};

export const textChangeFromDiff = (
  oldVal: string,
  newVal: string,
): TextChange | null => {
  if (oldVal === newVal) return null;

  let start = 0;
  while (
    start < oldVal.length &&
    start < newVal.length &&
    oldVal[start] === newVal[start]
  ) {
    start++;
  }

  let endOld = oldVal.length;
  let endNew = newVal.length;
  while (
    endOld > start &&
    endNew > start &&
    oldVal[endOld - 1] === newVal[endNew - 1]
  ) {
    endOld--;
    endNew--;
  }

  const inserted = newVal.slice(start, endNew);
  if (inserted.length > 0) return { index: start, insert: inserted };

  const deleted = endOld - start;
  if (deleted > 0) return { index: start, delete: deleted };

  return null;
};
