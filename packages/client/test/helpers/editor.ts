import { createWeavo } from "../../src/Document";
import { MemoryRoom } from "./memoryTransport";

export const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

export const createTextarea = (): HTMLTextAreaElement => {
  const el = document.createElement("textarea");
  document.body.appendChild(el);
  return el;
};

const setCursor = (
  el: HTMLTextAreaElement,
  start: number,
  end: number = start,
) => {
  el.focus();
  el.selectionStart = start;
  el.selectionEnd = end;
};

export const moveCursor = (
  el: HTMLTextAreaElement,
  start: number,
  end: number = start,
) => {
  setCursor(el, start, end);
  el.dispatchEvent(new Event("select", { bubbles: true }));
};

const dispatchBeforeInput = (
  el: HTMLTextAreaElement,
  inputType: string,
  data: string | null,
) => {
  el.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType,
      data,
    }),
  );
};

const dispatchInput = (
  el: HTMLTextAreaElement,
  inputType: string,
  data: string | null,
) => {
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType,
      data,
    }),
  );
};

export const beginInsert = (el: HTMLTextAreaElement, text: string) => {
  dispatchBeforeInput(el, "insertText", text);
};

export const completeInsert = (el: HTMLTextAreaElement, text: string) => {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  moveCursor(el, start + text.length);
  dispatchInput(el, "insertText", text);
};

export const insertText = (el: HTMLTextAreaElement, text: string) => {
  beginInsert(el, text);
  completeInsert(el, text);
};

export const pasteText = (el: HTMLTextAreaElement, text: string) => {
  dispatchBeforeInput(el, "insertFromPaste", text);
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  moveCursor(el, start + text.length);
  dispatchInput(el, "insertFromPaste", text);
};

/** Rapid single-character inserts without yielding — simulates fast typing. */
export const typeFast = (el: HTMLTextAreaElement, text: string) => {
  for (const char of text) insertText(el, char);
};

export const seedText = (el: HTMLTextAreaElement, text: string) => {
  moveCursor(el, 0);
  insertText(el, text);
};

export const backspace = (el: HTMLTextAreaElement) => {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const hasSelection = end > start;
  if (!hasSelection && start === 0) return;

  const deleteLen = hasSelection ? end - start : 1;
  const deleteStart = hasSelection ? start : start - deleteLen;

  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
  );
  dispatchBeforeInput(el, "deleteContentBackward", null);

  el.value =
    el.value.slice(0, deleteStart) + el.value.slice(deleteStart + deleteLen);
  setCursor(el, deleteStart);

  dispatchInput(el, "deleteContentBackward", null);
};

export const deleteForward = (el: HTMLTextAreaElement) => {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const hasSelection = end > start;
  const deleteLen = hasSelection ? end - start : 1;
  if (!hasSelection && start >= el.value.length) return;

  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
  );
  dispatchBeforeInput(el, "deleteContentForward", null);

  el.value = el.value.slice(0, start) + el.value.slice(start + deleteLen);
  moveCursor(el, start);

  dispatchInput(el, "deleteContentForward", null);
};

export type Peer = {
  weavo: ReturnType<typeof createWeavo>;
  el: HTMLTextAreaElement;
  unbind: () => void;
};

export const createPeer = (room: MemoryRoom): Peer => {
  const weavo = createWeavo(room.join());
  const el = createTextarea();
  const unbind = weavo.bind(el);
  return { weavo, el, unbind };
};

export const createPeerPair = async () => {
  const room = new MemoryRoom();
  const a = createPeer(room);
  const b = createPeer(room);
  await flushMicrotasks();
  return { room, a, b };
};

export const teardownPeers = (...peers: Peer[]) => {
  for (const peer of peers) {
    peer.unbind();
    peer.weavo.disconnect();
    peer.el.remove();
  }
};
