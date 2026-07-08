import "./setup";
import { afterEach, describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  backspace,
  createPeerPair,
  deleteForward,
  flushMicrotasks,
  insertText,
  moveCursor,
  pasteText,
  seedText,
  teardownPeers,
  typeFast,
  type Peer,
} from "./helpers/editor";

afterEach(() => {
  document.body.innerHTML = "";
});

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789 ";

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const charArb = fc.constantFrom(...alphabet.split(""));
const textArb = (min: number, max: number) =>
  fc.array(charArb, { minLength: min, maxLength: max }).map((chars) => chars.join(""));

const actionArb = fc.oneof(
  fc.record({
    kind: fc.constant("type" as const),
    peer: fc.boolean(),
    text: textArb(1, 8),
    fast: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant("paste" as const),
    peer: fc.boolean(),
    text: textArb(1, 24),
    replaceSelection: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant("dualFast" as const),
    textA: textArb(1, 6),
    textB: textArb(1, 6),
  }),
  fc.record({
    kind: fc.constant("middleRace" as const),
    textA: textArb(1, 6),
    textB: textArb(1, 6),
    paste: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant("delete" as const),
    peer: fc.boolean(),
    forward: fc.boolean(),
    replaceSelection: fc.boolean(),
  }),
);

const randomPos = (rand: () => number, len: number) =>
  len === 0 ? 0 : Math.floor(rand() * (len + 1));

type Action = {
  kind: "type";
  peer: boolean;
  text: string;
  fast: boolean;
} | {
  kind: "paste";
  peer: boolean;
  text: string;
  replaceSelection: boolean;
} | {
  kind: "dualFast";
  textA: string;
  textB: string;
} | {
  kind: "middleRace";
  textA: string;
  textB: string;
  paste: boolean;
} | {
  kind: "delete";
  peer: boolean;
  forward: boolean;
  replaceSelection: boolean;
};

const applyAction = async (a: Peer, b: Peer, action: Action, rand: () => number) => {
  const peer = (useB: boolean) => (useB ? b : a);

  switch (action.kind) {
    case "type": {
      const p = peer(action.peer);
      moveCursor(p.el, randomPos(rand, p.el.value.length));
      if (action.fast) typeFast(p.el, action.text);
      else insertText(p.el, action.text);
      break;
    }
    case "paste": {
      const p = peer(action.peer);
      const len = p.el.value.length;
      const start = randomPos(rand, len);
      if (action.replaceSelection && len > 0) {
        const end = start + Math.floor(rand() * (len - start + 1));
        moveCursor(p.el, start, end);
      } else {
        moveCursor(p.el, start);
      }
      pasteText(p.el, action.text);
      break;
    }
    case "dualFast": {
      moveCursor(a.el, randomPos(rand, a.el.value.length));
      moveCursor(b.el, randomPos(rand, b.el.value.length));
      typeFast(a.el, action.textA);
      typeFast(b.el, action.textB);
      break;
    }
    case "middleRace": {
      const len = Math.max(a.el.value.length, b.el.value.length, 1);
      const pos = randomPos(rand, len);
      moveCursor(a.el, Math.min(pos, a.el.value.length));
      moveCursor(b.el, Math.min(pos, b.el.value.length));
      if (action.paste) pasteText(a.el, action.textA);
      else typeFast(a.el, action.textA);
      if (action.paste) insertText(b.el, action.textB);
      else typeFast(b.el, action.textB);
      break;
    }
    case "delete": {
      const p = peer(action.peer);
      if (p.el.value.length === 0) return;
      const start = randomPos(rand, p.el.value.length);
      const end =
        action.replaceSelection && start < p.el.value.length
          ? start + Math.floor(rand() * (p.el.value.length - start + 1))
          : start;
      moveCursor(p.el, start, end);
      if (action.forward) {
        if (end >= p.el.value.length && end === start) return;
        deleteForward(p.el);
      } else {
        if (start === 0 && end === start) return;
        backspace(p.el);
      }
      break;
    }
  }
};

describe("collaborative fuzz — two peers", () => {
  test("middle insert, paste, fast typing, and deletes stay converged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(actionArb, { minLength: 20, maxLength: 120 }),
        fc.option(textArb(1, 40), { nil: undefined }),
        fc.integer({ min: 1, max: 2 ** 31 - 1 }),
        async (actions, seed, posSeed) => {
          const rand = mulberry32(posSeed);
          const { a, b } = await createPeerPair();

          if (seed) {
            seedText(a.el, seed);
            await flushMicrotasks();
          }

          for (const action of actions) {
            await applyAction(a, b, action, rand);
            await flushMicrotasks();
            expect(a.el.value).toBe(b.el.value);
          }

          teardownPeers(a, b);
        },
      ),
      {
        numRuns: 80,
        seed: 42,
        endOnFailure: true,
      },
    );
  }, 90_000);
});
