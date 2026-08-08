import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import {
  compareBallot,
  createBallot,
  nullBallot,
} from "../../src/consesous/Ballot";
import { isMembershipMessage } from "../../src/consesous/types";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

describe("Ballot", () => {
  test("createBallot stores epoch and proposer", () => {
    expect(createBallot(3, ALICE)).toEqual({ epoch: 3, proposer: ALICE });
  });

  test("nullBallot is weaker than any real ballot", () => {
    const nullB = nullBallot();
    expect(nullB).toEqual({ epoch: -1, proposer: "" });
    expect(compareBallot(createBallot(0, ALICE), nullB)).toBeGreaterThan(0);
  });

  test("higher epoch wins regardless of proposer", () => {
    const low = createBallot(1, ALICE);
    const high = createBallot(2, BOB);
    expect(compareBallot(high, low)).toBeGreaterThan(0);
    expect(compareBallot(low, high)).toBeLessThan(0);
  });

  test("equal epoch — lexicographically lower proposer is stronger", () => {
    const a = createBallot(5, ALICE);
    const b = createBallot(5, BOB);

    expect(compareBallot(a, b)).toBeGreaterThan(0);
    expect(compareBallot(b, a)).toBeLessThan(0);
  });

  test("identical ballots compare equal", () => {
    expect(
      compareBallot(createBallot(1, ALICE), createBallot(1, ALICE)),
    ).toBe(0);
  });
});

describe("isMembershipMessage", () => {
  test("accepts known message types", () => {
    expect(isMembershipMessage({ type: "JOIN_REQUEST", clientId: ALICE })).toBe(
      true,
    );
    expect(
      isMembershipMessage({
        type: "PREPARE",
        ballot: createBallot(0, ALICE),
        version: 1,
      }),
    ).toBe(true);
  });

  test("rejects non-objects and unknown types", () => {
    expect(isMembershipMessage(null)).toBe(false);
    expect(isMembershipMessage("PREPARE")).toBe(false);
    expect(isMembershipMessage({ type: "OP" })).toBe(false);
  });
});
