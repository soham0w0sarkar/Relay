import { describe, expect, test } from "bun:test";
import {
  reconcileBefore,
  transformPosition,
  transformSnapshot,
} from "../src/inputSnapshot";

describe("transformPosition", () => {
  test("shifts cursor forward for remote insert before cursor", () => {
    expect(transformPosition(5, { index: 2, insert: "XY" })).toBe(7);
  });

  test("keeps cursor for remote insert at or after cursor", () => {
    expect(transformPosition(2, { index: 2, insert: "X" })).toBe(3);
    expect(transformPosition(1, { index: 2, insert: "X" })).toBe(1);
  });

  test("shifts cursor back for remote delete before cursor", () => {
    expect(transformPosition(5, { index: 1, delete: 2 })).toBe(3);
  });

  test("collapses cursor inside remote delete", () => {
    expect(transformPosition(2, { index: 1, delete: 2 })).toBe(1);
  });
});

describe("transformSnapshot", () => {
  test("tracks middle remote insert against pending before snapshot", () => {
    const before = { start: 3, end: 3, value: "abcdef" };
    const change = { index: 1, insert: "XY" };

    expect(transformSnapshot(before, change)).toEqual({
      start: 5,
      end: 5,
      value: "aXYbcdef",
    });
  });

  test("tracks middle remote delete against pending before snapshot", () => {
    const before = { start: 4, end: 4, value: "aXYbcdef" };
    const change = { index: 2, delete: 2 };

    expect(transformSnapshot(before, change)).toEqual({
      start: 2,
      end: 2,
      value: "aXcdef",
    });
  });

  test("tracks selection spanning remote delete", () => {
    const before = { start: 2, end: 5, value: "aXYbcdef" };
    const change = { index: 1, delete: 2 };

    expect(transformSnapshot(before, change)).toEqual({
      start: 1,
      end: 3,
      value: "abcdef",
    });
  });
});

describe("reconcileBefore", () => {
  test("returns transformed snapshot when only local edit happened", () => {
    const before = { start: 5, end: 5, value: "aXYbcdef" };

    expect(reconcileBefore(before, "aXYbcZdef", "insertText", "Z")).toBe(
      before,
    );

    expect(
      reconcileBefore(before, "aXYbdef", "deleteContentBackward", null),
    ).toBe(before);
  });

  test("adjusts positions when remote drift slips through before input", () => {
    const before = { start: 3, end: 3, value: "abcdef" };
    const afterRemoteInsert = "aXYbcZdef";

    expect(
      reconcileBefore(before, afterRemoteInsert, "insertText", "Z"),
    ).toEqual({
      start: 5,
      end: 5,
      value: "aXYbcdef",
    });
  });
});
