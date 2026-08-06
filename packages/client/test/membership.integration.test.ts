import "./setup";
import { describe, expect, test } from "bun:test";
import { createWeavo } from "../src/Document";
import {
  createTextarea,
  flushMicrotasks,
  insertText,
  waitUntilJoined,
} from "./helpers/editor";
import { MemoryRoom } from "./helpers/memoryTransport";

describe("membership join gate", () => {
  test("solo peer founds the room before sending ops", async () => {
    const room = new MemoryRoom();
    const weavo = createWeavo(room.join(), { foundingGraceMs: 0 });
    const el = createTextarea();
    weavo.bind(el);

    expect(weavo.membership.isJoined()).toBe(false);

    await waitUntilJoined(weavo);
    expect(weavo.membership.isJoined()).toBe(true);
    expect(weavo.membership.shortIdOf(weavo.membership.clientId)).toBe(0);

    insertText(el, "hello");
    expect(el.value).toBe("hello");

    weavo.disconnect();
    el.remove();
  });

  test("second peer waits for JOIN_RESPONSE before syncing ops", async () => {
    const room = new MemoryRoom();
    const founder = createWeavo(room.join(), { foundingGraceMs: 0 });
    const founderEl = createTextarea();
    founder.bind(founderEl);
    await waitUntilJoined(founder);

    insertText(founderEl, "hi");
    await flushMicrotasks();

    const joiner = createWeavo(room.join(), { foundingGraceMs: 5_000 });
    const joinerEl = createTextarea();
    joiner.bind(joinerEl);

    expect(joiner.membership.isJoined()).toBe(false);
    await waitUntilJoined(joiner);
    expect(joiner.membership.isJoined()).toBe(true);
    expect(joiner.membership.getCurrent()?.members).toHaveLength(2);

    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(joinerEl.value).toBe("hi");

    insertText(joinerEl, "!");
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(founderEl.value).toBe("hi!");

    founder.disconnect();
    joiner.disconnect();
    founderEl.remove();
    joinerEl.remove();
  });
});
