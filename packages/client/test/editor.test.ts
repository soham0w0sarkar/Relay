import "./setup";
import { afterEach, describe, expect, test } from "bun:test";
import type { TextChange } from "../src/types";
import {
  backspace,
  beginInsert,
  completeInsert,
  createPeer,
  createPeerPair,
  createTextarea,
  deleteForward,
  flushMicrotasks,
  insertText,
  moveCursor,
  pasteText,
  seedText,
  teardownPeers,
} from "./helpers/editor";
import { MemoryRoom } from "./helpers/memoryTransport";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("editor — local input", () => {
  let room: MemoryRoom;
  let peer: ReturnType<typeof createPeer>;

  afterEach(() => {
    if (peer) teardownPeers(peer);
  });

  test("inserts text at the cursor", async () => {
    room = new MemoryRoom();
    peer = createPeer(room);
    await flushMicrotasks();

    moveCursor(peer.el, 0);
    insertText(peer.el, "hello");

    expect(peer.el.value).toBe("hello");
    expect(peer.el.selectionStart).toBe(5);
  });

  test("inserts in the middle of existing text", async () => {
    room = new MemoryRoom();
    peer = createPeer(room);
    await flushMicrotasks();

    seedText(peer.el, "hllo");
    moveCursor(peer.el, 1);
    insertText(peer.el, "e");

    expect(peer.el.value).toBe("hello");
  });

  test("backspace deletes the character before the cursor", async () => {
    room = new MemoryRoom();
    peer = createPeer(room);
    await flushMicrotasks();

    seedText(peer.el, "hello");
    moveCursor(peer.el, 5);
    backspace(peer.el);

    expect(peer.el.value).toBe("hell");
    expect(peer.el.selectionStart).toBe(4);
  });

  test("delete removes the character after the cursor", async () => {
    room = new MemoryRoom();
    peer = createPeer(room);
    await flushMicrotasks();

    seedText(peer.el, "hello");
    moveCursor(peer.el, 1);
    deleteForward(peer.el);

    expect(peer.el.value).toBe("hllo");
    expect(peer.el.selectionStart).toBe(1);
  });

  test("replaces a selection on insert", async () => {
    room = new MemoryRoom();
    peer = createPeer(room);
    await flushMicrotasks();

    seedText(peer.el, "hello");
    moveCursor(peer.el, 1, 4);
    insertText(peer.el, "i");

    expect(peer.el.value).toBe("hio");
  });

  test("deletes the full selection with backspace", async () => {
    room = new MemoryRoom();
    peer = createPeer(room);
    await flushMicrotasks();

    seedText(peer.el, "hello");
    moveCursor(peer.el, 0, 5);
    backspace(peer.el);

    expect(peer.el.value).toBe("");
    expect(peer.el.selectionStart).toBe(0);
  });

  test("deletes the full selection with delete", async () => {
    room = new MemoryRoom();
    peer = createPeer(room);
    await flushMicrotasks();

    seedText(peer.el, "hello");
    moveCursor(peer.el, 0, 5);
    deleteForward(peer.el);

    expect(peer.el.value).toBe("");
    expect(peer.el.selectionStart).toBe(0);
  });

  test("emits text changes for local edits", async () => {
    room = new MemoryRoom();
    peer = createPeer(room);
    await flushMicrotasks();

    const changes: TextChange[] = [];
    peer.weavo.textSubscribe((change) => changes.push(change));

    moveCursor(peer.el, 0);
    insertText(peer.el, "ab");

    expect(changes).toEqual([
      { index: 0, insert: "a" },
      { index: 1, insert: "b" },
    ]);
  });
});

describe("editor — remote apply", () => {
  test("syncs inserts from the other peer", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "synced");
    await flushMicrotasks();

    expect(b.el.value).toBe("synced");
    teardownPeers(a, b);
  });

  test("syncs middle inserts from the other peer", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "ace");
    await flushMicrotasks();

    moveCursor(a.el, 1);
    insertText(a.el, "b");
    await flushMicrotasks();

    expect(a.el.value).toBe("abce");
    expect(b.el.value).toBe("abce");
    teardownPeers(a, b);
  });

  test("syncs deletes from the other peer", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "hello");
    await flushMicrotasks();

    moveCursor(a.el, 5);
    backspace(a.el);
    await flushMicrotasks();

    expect(b.el.value).toBe("hell");
    teardownPeers(a, b);
  });

  test("syncs select-all delete from the other peer", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "hello");
    await flushMicrotasks();

    moveCursor(a.el, 0, 5);
    backspace(a.el);
    await flushMicrotasks();

    expect(a.el.value).toBe("");
    expect(b.el.value).toBe("");
    teardownPeers(a, b);
  });

  test("shifts cursor forward when remote inserts before it", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "hello");
    await flushMicrotasks();

    moveCursor(b.el, 5);
    moveCursor(a.el, 5);

    moveCursor(b.el, 1);
    insertText(b.el, "X");
    insertText(b.el, "X");
    await flushMicrotasks();

    expect(a.el.value).toBe("hXXello");
    expect(a.el.selectionStart).toBe(7);
    teardownPeers(a, b);
  });

  test("keeps cursor when remote inserts after it", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "hello");
    await flushMicrotasks();

    moveCursor(a.el, 1);
    moveCursor(b.el, 5);
    insertText(b.el, "!");
    await flushMicrotasks();

    expect(a.el.value).toBe("hello!");
    expect(a.el.selectionStart).toBe(1);
    teardownPeers(a, b);
  });

  test("shifts cursor back when remote deletes before it", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "abcdef");
    await flushMicrotasks();

    moveCursor(a.el, 5);
    moveCursor(b.el, 1);
    backspace(b.el);
    await flushMicrotasks();

    expect(a.el.value).toBe("bcdef");
    expect(a.el.selectionStart).toBe(4);
    teardownPeers(a, b);
  });
});

describe("editor — before snapshot race", () => {
  test("local middle insert after remote insert uses correct index", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "abcdef");
    await flushMicrotasks();

    moveCursor(a.el, 3);
    beginInsert(a.el, "Z");

    await flushMicrotasks();
    moveCursor(b.el, 1);
    insertText(b.el, "X");
    await flushMicrotasks();

    expect(a.el.value.length).toBe(7);
    expect(a.el.value).toMatch(/X/);
    expect(a.el.selectionStart).toBeGreaterThanOrEqual(4);

    completeInsert(a.el, "Z");
    await flushMicrotasks();

    expect(a.el.value).toBe("aXbcZdef");
    expect(a.el.value).toContain("X");
    expect(a.el.value).toContain("Z");
    teardownPeers(a, b);
  });

  test("local middle backspace after remote insert uses correct index", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "abcdef");
    await flushMicrotasks();

    moveCursor(a.el, 5);
    a.el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
    );
    a.el.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
        data: null,
      }),
    );

    await flushMicrotasks();
    moveCursor(b.el, 1);
    insertText(b.el, "X");
    await flushMicrotasks();

    expect(a.el.selectionStart).toBe(6);

    backspace(a.el);
    await flushMicrotasks();

    expect(a.el.value).not.toBe("abcdef");
    expect(a.el.value).toContain("X");
    teardownPeers(a, b);
  });

  test("both peers converge after paste replacing a selection", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "9l 0z9z4xo8t");
    await flushMicrotasks();

    moveCursor(a.el, 3, 9);
    pasteText(a.el, "y78we1");
    await flushMicrotasks();

    expect(a.el.value).toBe("9l y78we1o8t");
    expect(b.el.value).toBe("9l y78we1o8t");
    teardownPeers(a, b);
  });

  test("both peers converge after concurrent middle edits", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "start");
    await flushMicrotasks();

    moveCursor(a.el, 2);
    moveCursor(b.el, 2);
    insertText(a.el, "A");
    await flushMicrotasks();
    insertText(b.el, "B");
    await flushMicrotasks();

    expect(b.el.value).toBe("stABart");
    expect(b.el.value).toContain("A");
    expect(b.el.value).toContain("B");
    teardownPeers(a, b);
  });
});

describe("editor — bind lifecycle", () => {
  test("unbind stops applying remote updates to the textarea", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "hi");
    await flushMicrotasks();
    expect(b.el.value).toBe("hi");

    b.unbind();
    moveCursor(a.el, 2);
    insertText(a.el, "!");
    await flushMicrotasks();

    expect(b.el.value).toBe("hi");
    teardownPeers(a, b);
  });

  test("rebind attaches to a new textarea", async () => {
    const room = new MemoryRoom();
    const a = createPeer(room);
    await flushMicrotasks();

    moveCursor(a.el, 0);
    insertText(a.el, "old");
    await flushMicrotasks();

    a.unbind();
    const nextEl = createTextarea();
    a.weavo.bind(nextEl);
    await flushMicrotasks();

    moveCursor(nextEl, 0);
    insertText(nextEl, "more");
    await flushMicrotasks();

    expect(nextEl.value).toBe("moreold");
    teardownPeers(a);
    nextEl.remove();
  });
});
