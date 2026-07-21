import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import {
  missingOps,
  update,
  type StateVector,
} from "../src/stateVector";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" as ClientId;

describe("StateVector", () => {
  describe("update", () => {
    test("records the first clock for a client", () => {
      const sv: StateVector = new Map();
      update(sv, [ALICE, 0]);
      expect(sv.get(ALICE)).toBe(0);
    });

    test("advances the clock when a higher op arrives", () => {
      const sv: StateVector = new Map([[ALICE, 2]]);
      update(sv, [ALICE, 5]);
      expect(sv.get(ALICE)).toBe(5);
    });

    test("does not move the clock backwards", () => {
      const sv: StateVector = new Map([[ALICE, 5]]);
      update(sv, [ALICE, 3]);
      expect(sv.get(ALICE)).toBe(5);
    });

    test("does not change the clock for an equal op", () => {
      const sv: StateVector = new Map([[ALICE, 2]]);
      update(sv, [ALICE, 2]);
      expect(sv.get(ALICE)).toBe(2);
    });

    test("tracks multiple clients independently", () => {
      const sv: StateVector = new Map();
      update(sv, [ALICE, 1]);
      update(sv, [BOB, 4]);
      expect(sv.get(ALICE)).toBe(1);
      expect(sv.get(BOB)).toBe(4);
    });
  });

  describe("missingOps", () => {
    test("returns nothing when both vectors match", () => {
      const sv: StateVector = new Map([
        [ALICE, 2],
        [BOB, 1],
      ]);
      expect(missingOps(sv, new Map(sv))).toEqual([]);
    });

    test("returns op ids the peer has not seen yet", () => {
      const mine: StateVector = new Map([[ALICE, 2]]);
      const theirs: StateVector = new Map([[ALICE, 0]]);

      expect(missingOps(mine, theirs)).toEqual([
        [ALICE, 1],
        [ALICE, 2],
      ]);
    });

    test("includes missing ops for clients absent from their vector", () => {
      const mine: StateVector = new Map([
        [ALICE, 1],
        [BOB, 2],
      ]);
      const theirs: StateVector = new Map([[ALICE, 1]]);

      expect(missingOps(mine, theirs)).toEqual([
        [BOB, 0],
        [BOB, 1],
        [BOB, 2],
      ]);
    });

    test("returns all of our ops when their vector is empty", () => {
      const mine: StateVector = new Map([[ALICE, 1]]);

      expect(missingOps(mine, new Map())).toEqual([
        [ALICE, 0],
        [ALICE, 1],
      ]);
    });

    test("returns nothing when we have nothing they lack", () => {
      const mine: StateVector = new Map([[ALICE, 1]]);
      const theirs: StateVector = new Map([[ALICE, 3]]);

      expect(missingOps(mine, theirs)).toEqual([]);
    });
  });

});
