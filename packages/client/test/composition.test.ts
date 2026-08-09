import "./setup";
import { afterEach, describe, expect, test } from "bun:test";
import {
  backspace,
  composeText,
  createPeer,
  createPeerPair,
  deleteLineBackward,
  deleteWordBackward,
  flushMicrotasks,
  insertText,
  moveCursor,
  seedText,
  teardownPeers,
  type Peer,
} from "./helpers/editor";
import { MemoryRoom } from "./helpers/memoryTransport";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("IME composition", () => {
  let peer: Peer;

  afterEach(() => {
    if (peer) teardownPeers(peer);
  });

  test("commits the final candidate, not every intermediate stage", async () => {
    const room = new MemoryRoom();
    peer = await createPeer(room);
    await flushMicrotasks();

    moveCursor(peer.el, 0);
    composeText(peer.el, ["n", "ni", "に", "日本"]);
    await flushMicrotasks();

    expect(peer.el.value).toBe("日本");
  });

  test("composed text syncs to the other peer once", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    composeText(a.el, ["k", "ka", "か", "漢字"]);
    await flushMicrotasks();

    expect(a.el.value).toBe("漢字");
    expect(b.el.value).toBe("漢字");
    teardownPeers(a, b);
  });

  test("composes into the middle of existing text", async () => {
    const { a, b } = await createPeerPair();

    seedText(a.el, "ab");
    await flushMicrotasks();

    moveCursor(a.el, 1);
    composeText(a.el, ["x", "の"]);
    await flushMicrotasks();

    expect(a.el.value).toBe("aのb");
    expect(b.el.value).toBe("aのb");
    teardownPeers(a, b);
  });

  test("composition replacing a selection removes the old text", async () => {
    const { a, b } = await createPeerPair();

    seedText(a.el, "hello");
    await flushMicrotasks();

    moveCursor(a.el, 1, 4);
    composeText(a.el, ["y", "山"]);
    await flushMicrotasks();

    expect(a.el.value).toBe("h山o");
    expect(b.el.value).toBe("h山o");
    teardownPeers(a, b);
  });

  test("a remote insert during composition does not break either peer", async () => {
    const { a, b } = await createPeerPair();

    seedText(a.el, "start");
    await flushMicrotasks();

    moveCursor(a.el, 5);
    a.el.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    a.el.value = "start" + "か";
    a.el.selectionStart = 6;
    a.el.selectionEnd = 6;
    a.el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        data: "か",
      }),
    );

    moveCursor(b.el, 0);
    insertText(b.el, "Z");
    await flushMicrotasks();

    a.el.value = "start" + "漢";
    a.el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        data: "漢",
      }),
    );
    a.el.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );
    await flushMicrotasks();

    expect(a.el.value).toBe("Zstart漢");
    expect(b.el.value).toBe("Zstart漢");
    teardownPeers(a, b);
  });

  test("cancelled composition leaves the document untouched", async () => {
    const room = new MemoryRoom();
    peer = await createPeer(room);
    await flushMicrotasks();

    seedText(peer.el, "hi");
    await flushMicrotasks();

    moveCursor(peer.el, 2);
    composeText(peer.el, ["n", ""]);
    await flushMicrotasks();

    expect(peer.el.value).toBe("hi");
  });
});

describe("emoji and astral-plane text", () => {
  let peer: Peer;

  afterEach(() => {
    if (peer) teardownPeers(peer);
  });

  test("inserts an emoji and syncs it intact", async () => {
    const { a, b } = await createPeerPair();

    moveCursor(a.el, 0);
    insertText(a.el, "hi 😀");
    await flushMicrotasks();

    expect(a.el.value).toBe("hi 😀");
    expect(b.el.value).toBe("hi 😀");
    expect([...b.el.value].length).toBe(4);
    teardownPeers(a, b);
  });

  test("backspace removes a whole emoji, not half a surrogate pair", async () => {
    const { a, b } = await createPeerPair();

    seedText(a.el, "a😀");
    await flushMicrotasks();

    moveCursor(a.el, a.el.value.length);
    backspace(a.el);
    await flushMicrotasks();

    expect(a.el.value).toBe("a");
    expect(b.el.value).toBe("a");
    teardownPeers(a, b);
  });

  test("backspace removes a whole ZWJ family cluster", async () => {
    const { a, b } = await createPeerPair();

    const family = "👨‍👩‍👧";
    seedText(a.el, `x${family}`);
    await flushMicrotasks();

    moveCursor(a.el, a.el.value.length);
    backspace(a.el);
    await flushMicrotasks();

    expect(a.el.value).toBe("x");
    expect(b.el.value).toBe("x");
    teardownPeers(a, b);
  });

  test("emoji composed through an IME picker commits once", async () => {
    const room = new MemoryRoom();
    peer = await createPeer(room);
    await flushMicrotasks();

    moveCursor(peer.el, 0);
    composeText(peer.el, [":sm", ":smile", "😄"]);
    await flushMicrotasks();

    expect(peer.el.value).toBe("😄");
  });
});

describe("word and line deletes", () => {
  test("Option+Backspace deletes a whole word on both peers", async () => {
    const { a, b } = await createPeerPair();

    seedText(a.el, "hello brave world");
    await flushMicrotasks();

    moveCursor(a.el, a.el.value.length);
    deleteWordBackward(a.el);
    await flushMicrotasks();

    expect(a.el.value).toBe("hello brave ");
    expect(b.el.value).toBe("hello brave ");
    teardownPeers(a, b);
  });

  test("word delete removes a trailing emoji word intact", async () => {
    const { a, b } = await createPeerPair();

    seedText(a.el, "hi 😀🎉");
    await flushMicrotasks();

    moveCursor(a.el, a.el.value.length);
    deleteWordBackward(a.el);
    await flushMicrotasks();

    expect(a.el.value).toBe("hi ");
    expect(b.el.value).toBe("hi ");
    teardownPeers(a, b);
  });

  test("Cmd+Backspace deletes to the start of the line", async () => {
    const { a, b } = await createPeerPair();

    seedText(a.el, "first\nsecond line");
    await flushMicrotasks();

    moveCursor(a.el, a.el.value.length);
    deleteLineBackward(a.el);
    await flushMicrotasks();

    expect(a.el.value).toBe("first\n");
    expect(b.el.value).toBe("first\n");
    teardownPeers(a, b);
  });

  test("word delete converges with a concurrent remote insert", async () => {
    const { a, b } = await createPeerPair();

    seedText(a.el, "alpha beta");
    await flushMicrotasks();

    moveCursor(b.el, 0);
    insertText(b.el, "Z");
    await flushMicrotasks();

    moveCursor(a.el, a.el.value.length);
    deleteWordBackward(a.el);
    await flushMicrotasks();

    expect(a.el.value).toBe("Zalpha ");
    expect(b.el.value).toBe("Zalpha ");
    teardownPeers(a, b);
  });
});
