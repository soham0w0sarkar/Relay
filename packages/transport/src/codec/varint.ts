import type { Reader, Writer } from "./buffer";
import { readU8, writeU8 } from "./buffer";

export const writeVarint = (writer: Writer, value: number) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`Value is outside uint32 range: ${value}`);
  }

  let remaining = value;
  while (remaining >= 0x80) {
    writeU8(writer, (remaining % 0x80) | 0x80);
    remaining = Math.floor(remaining / 0x80);
  }
  writeU8(writer, remaining);
};

export const readVarint = (reader: Reader): number => {
  let result = 0;
  let multiplier = 1;

  for (let index = 0; index < 5; index++) {
    const byte = readU8(reader);
    result += (byte & 0x7f) * multiplier;

    if ((byte & 0x80) === 0) {
      if (result > 0xffff_ffff) throw new Error("Varint exceeds uint32 range");
      return result;
    }

    multiplier *= 0x80;
  }

  throw new Error("Varint exceeds uint32 range");
};

/** Encode a non-negative safe integer (fits JS number) as two uint32 varints. */
export const writeUint53 = (writer: Writer, value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Value is outside uint53 range: ${value}`);
  }
  writeVarint(writer, Math.floor(value / 0x1_0000_0000));
  writeVarint(writer, value % 0x1_0000_0000);
};

export const readUint53 = (reader: Reader): number => {
  const high = readVarint(reader);
  const low = readVarint(reader);
  return high * 0x1_0000_0000 + low;
};
