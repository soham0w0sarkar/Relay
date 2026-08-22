import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import { computeGCFrontier, createPresence, updatePresence } from "../../src/presence";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as ClientId;

describe("computeGCFrontier", () => {
  test("takes the min clock across peers per client", () => {
    const presence = createPresence();
    updatePresence(presence, {
      clientId: BOB,
      cursor: 0,
      name: "bob",
      color: "#0f0",
      timestamp: 1,
      receivedAt: 1,
      membershipVersion: 1,
      sv: { [ALICE]: 40, [BOB]: 31 },
    });
    updatePresence(presence, {
      clientId: CAROL,
      cursor: 0,
      name: "carol",
      color: "#00f",
      timestamp: 1,
      receivedAt: 1,
      membershipVersion: 1,
      sv: { [ALICE]: 42, [BOB]: 28 },
    });

    const frontier = computeGCFrontier(
      { [ALICE]: 42, [BOB]: 31 },
      presence,
      ALICE,
    );

    expect(frontier.get(ALICE)).toBe(40);
    expect(frontier.get(BOB)).toBe(28);
  });

  test("solo peer frontier equals its own state vector", () => {
    const frontier = computeGCFrontier(
      { [ALICE]: 10, [BOB]: 3 },
      createPresence(),
      ALICE,
    );

    expect(frontier.get(ALICE)).toBe(10);
    expect(frontier.get(BOB)).toBe(3);
  });

  test("ignores self presence entry and uses live mySv", () => {
    const presence = createPresence();
    updatePresence(presence, {
      clientId: ALICE,
      cursor: 0,
      name: "alice",
      color: "#f00",
      timestamp: 1,
      receivedAt: 1,
      membershipVersion: 1,
      sv: { [ALICE]: 5 },
    });
    updatePresence(presence, {
      clientId: BOB,
      cursor: 0,
      name: "bob",
      color: "#0f0",
      timestamp: 1,
      receivedAt: 1,
      membershipVersion: 1,
      sv: { [ALICE]: 8 },
    });

    const frontier = computeGCFrontier({ [ALICE]: 12 }, presence, ALICE);
    expect(frontier.get(ALICE)).toBe(8);
  });

  test("omits clients a peer has never seen", () => {
    const presence = createPresence();
    updatePresence(presence, {
      clientId: BOB,
      cursor: 0,
      name: "bob",
      color: "#0f0",
      timestamp: 1,
      receivedAt: 1,
      membershipVersion: 1,
      sv: { [BOB]: 2 },
    });

    const frontier = computeGCFrontier(
      { [ALICE]: 10, [BOB]: 2 },
      presence,
      ALICE,
    );

    expect(frontier.has(ALICE)).toBe(false);
    expect(frontier.get(BOB)).toBe(2);
  });
});
