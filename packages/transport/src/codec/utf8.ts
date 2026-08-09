import type { Reader, Writer } from "./buffer";
import { readBytes, writeBytes } from "./buffer";
import { readVarint, writeVarint } from "./varint";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const HIGH_START = 0xd800;
const LOW_START = 0xdc00;
const SURROGATE_END = 0xdfff;

const isHighSurrogate = (unit: number) =>
  unit >= HIGH_START && unit < LOW_START;
const isLowSurrogate = (unit: number) =>
  unit >= LOW_START && unit <= SURROGATE_END;

/**
 * A CRDT node holds a single UTF-16 code unit, so astral characters such as
 * emoji arrive here split into unpaired surrogates. TextEncoder replaces those
 * with U+FFFD, which loses the character, so encode them as WTF-8 instead:
 * standard UTF-8 for everything valid, plus 3-byte sequences for lone
 * surrogates.
 */
const hasLoneSurrogate = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (isHighSurrogate(unit)) {
      if (!isLowSurrogate(value.charCodeAt(index + 1))) return true;
      index++;
    } else if (isLowSurrogate(unit)) {
      return true;
    }
  }
  return false;
};

const encodeWtf8 = (value: string): Uint8Array => {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);

    if (unit < 0x80) {
      bytes.push(unit);
      continue;
    }

    if (unit < 0x800) {
      bytes.push(0xc0 | (unit >> 6), 0x80 | (unit & 0x3f));
      continue;
    }

    if (isHighSurrogate(unit)) {
      const next = value.charCodeAt(index + 1);
      if (isLowSurrogate(next)) {
        const codePoint =
          0x10000 + ((unit - HIGH_START) << 10) + (next - LOW_START);
        bytes.push(
          0xf0 | (codePoint >> 18),
          0x80 | ((codePoint >> 12) & 0x3f),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
        index++;
        continue;
      }
    }

    bytes.push(
      0xe0 | (unit >> 12),
      0x80 | ((unit >> 6) & 0x3f),
      0x80 | (unit & 0x3f),
    );
  }

  return new Uint8Array(bytes);
};

const decodeWtf8 = (bytes: Uint8Array): string => {
  let out = "";

  for (let index = 0; index < bytes.length; ) {
    const byte = bytes[index]!;

    if (byte < 0x80) {
      out += String.fromCharCode(byte);
      index += 1;
      continue;
    }

    if (byte < 0xe0) {
      out += String.fromCharCode(
        ((byte & 0x1f) << 6) | (bytes[index + 1]! & 0x3f),
      );
      index += 2;
      continue;
    }

    if (byte < 0xf0) {
      out += String.fromCharCode(
        ((byte & 0x0f) << 12) |
          ((bytes[index + 1]! & 0x3f) << 6) |
          (bytes[index + 2]! & 0x3f),
      );
      index += 3;
      continue;
    }

    const codePoint =
      ((byte & 0x07) << 18) |
      ((bytes[index + 1]! & 0x3f) << 12) |
      ((bytes[index + 2]! & 0x3f) << 6) |
      (bytes[index + 3]! & 0x3f);
    out += String.fromCodePoint(codePoint);
    index += 4;
  }

  return out;
};

export const writeUtf8 = (writer: Writer, value: string) => {
  const bytes = hasLoneSurrogate(value)
    ? encodeWtf8(value)
    : encoder.encode(value);
  writeVarint(writer, bytes.length);
  writeBytes(writer, bytes);
};

export const readUtf8 = (reader: Reader): string => {
  const bytes = readBytes(reader, readVarint(reader));
  try {
    return decoder.decode(bytes);
  } catch {
    return decodeWtf8(bytes);
  }
};
