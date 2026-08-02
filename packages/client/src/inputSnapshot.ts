export type InputSnapshot = { start: number; end: number; value: string };

type TextMutation = { index: number; insert?: string; delete?: number };

export const transformPosition = (
  pos: number,
  change: TextMutation,
): number => {
  const { index, insert, delete: del } = change;
  if (insert) return pos >= index ? pos + insert.length : pos;
  if (del) {
    if (pos > index + del) return pos - del;
    if (pos > index) return index;
    return pos;
  }
  return pos;
};

export const transformSnapshot = (
  snapshot: InputSnapshot,
  change: TextMutation,
): InputSnapshot => {
  const { index, insert, delete: del } = change;
  let { start, end, value } = snapshot;

  if (insert) {
    value = value.slice(0, index) + insert + value.slice(index);
    if (start >= index) start += insert.length;
    if (end >= index) end += insert.length;
  } else if (del) {
    value = value.slice(0, index) + value.slice(index + del);
    if (start > index + del) start -= del;
    else if (start > index) start = index;
    if (end > index + del) end -= del;
    else if (end > index) end = index;
  }

  return { start, end, value };
};

const undoLocalEdit = (
  newValue: string,
  before: InputSnapshot,
  inputType: string,
  data: string | null,
): string => {
  const inserted = inputType === "insertLineBreak" ? "\n" : (data ?? "");

  switch (inputType) {
    case "insertText":
    case "insertLineBreak":
    case "insertFromPaste":
      return (
        newValue.slice(0, before.start) +
        before.value.slice(before.start, before.end) +
        newValue.slice(before.start + inserted.length)
      );

    case "deleteContentBackward": {
      const deleteLen = before.end - before.start || 1;
      const deleteStart =
        before.end > before.start ? before.start : before.start - deleteLen;
      return (
        newValue.slice(0, deleteStart) +
        before.value.slice(deleteStart, deleteStart + deleteLen) +
        newValue.slice(deleteStart)
      );
    }

    case "deleteContentForward":
    case "deleteByCut": {
      const deleteLen = before.end - before.start || 1;
      return (
        newValue.slice(0, before.start) +
        before.value.slice(before.start, before.start + deleteLen) +
        newValue.slice(before.start)
      );
    }

    default:
      return newValue;
  }
};

const diffRegion = (oldVal: string, newVal: string) => {
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

  return { start, endOld, endNew };
};

const reconcileDriftedBefore = (
  before: InputSnapshot,
  newValue: string,
  inputType: string,
  data: string | null,
): InputSnapshot => {
  const oldVal = before.value;
  const { start, endOld, endNew } = diffRegion(oldVal, newValue);

  if (
    inputType === "insertText" ||
    inputType === "insertLineBreak" ||
    inputType === "insertFromPaste"
  ) {
    const inserted = inputType === "insertLineBreak" ? "\n" : (data ?? "");
    const remoteLen = endNew - start - (endOld - start) - inserted.length;
    if (remoteLen > 0) {
      return transformSnapshot(before, {
        index: start,
        insert: newValue.slice(start, start + remoteLen),
      });
    }
    return before;
  }

  if (
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward" ||
    inputType === "deleteByCut"
  ) {
    const localLen = before.end - before.start || 1;
    const remoteLen = endOld - start - (endNew - start) - localLen;
    if (remoteLen > 0) {
      return transformSnapshot(before, { index: start, delete: remoteLen });
    }
    return before;
  }

  return before;
};

export const reconcileBefore = (
  before: InputSnapshot,
  newValue: string,
  inputType: string,
  data: string | null = null,
): InputSnapshot => {
  const oldVal = before.value;
  if (oldVal === newValue) return before;

  const valueBeforeLocalEdit = undoLocalEdit(newValue, before, inputType, data);
  if (valueBeforeLocalEdit === oldVal) return before;

  return reconcileDriftedBefore(before, newValue, inputType, data);
};
