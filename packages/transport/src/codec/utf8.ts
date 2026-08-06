import type { Reader, Writer } from "./buffer";
import { readBytes, writeBytes } from "./buffer";
import { readVarint, writeVarint } from "./varint";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const writeUtf8 = (writer: Writer, value: string) => {
  const bytes = encoder.encode(value);
  writeVarint(writer, bytes.length);
  writeBytes(writer, bytes);
};

export const readUtf8 = (reader: Reader): string =>
  decoder.decode(readBytes(reader, readVarint(reader)));
