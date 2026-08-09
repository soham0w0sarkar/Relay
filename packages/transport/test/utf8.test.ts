import { describe, expect, test } from "bun:test";
import { createReader, createWriter, toBytes } from "../src/codec/buffer";
import { readUtf8, writeUtf8 } from "../src/codec/utf8";

const roundTrip = (value: string): string => {
  const writer = createWriter();
  writeUtf8(writer, value);
  return readUtf8(createReader(toBytes(writer)));
};

describe("utf8 codec", () => {
  test("round-trips ascii and multi-byte text", () => {
    for (const value of ["", "hello", "héllo", "日本語", "🎉 party"]) {
      expect(roundTrip(value)).toBe(value);
    }
  });

  test("round-trips a lone high surrogate", () => {
    const half = "😀".charAt(0);
    expect(roundTrip(half)).toBe(half);
  });

  test("round-trips a lone low surrogate", () => {
    const half = "😀".charAt(1);
    expect(roundTrip(half)).toBe(half);
  });

  test("split surrogates rejoin into the original emoji", () => {
    const emoji = "😀";
    const rejoined = roundTrip(emoji.charAt(0)) + roundTrip(emoji.charAt(1));
    expect(rejoined).toBe(emoji);
  });

  test("round-trips every code unit of a ZWJ sequence separately", () => {
    const family = "👨‍👩‍👧";
    const rejoined = [...Array(family.length).keys()]
      .map((index) => roundTrip(family.charAt(index)))
      .join("");
    expect(rejoined).toBe(family);
  });
});
