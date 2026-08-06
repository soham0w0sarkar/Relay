export type Writer = {
  buf: Uint8Array;
  offset: number;
};

export const createWriter = (capacity = 64): Writer => ({
  buf: new Uint8Array(capacity),
  offset: 0,
});

export const ensureCapacity = (writer: Writer, needed: number) => {
  if (writer.offset + needed <= writer.buf.length) return;
  const next = new Uint8Array(
    Math.max(writer.buf.length * 2, writer.offset + needed),
  );
  next.set(writer.buf.subarray(0, writer.offset));
  writer.buf = next;
};

export const toBytes = (writer: Writer): Uint8Array =>
  writer.buf.slice(0, writer.offset);

export type Reader = {
  buf: Uint8Array;
  offset: number;
};

export const createReader = (buf: Uint8Array): Reader => ({
  buf,
  offset: 0,
});

const assertReadable = (reader: Reader, length: number) => {
  if (length < 0 || reader.offset + length > reader.buf.length) {
    throw new Error("Unexpected end of binary message");
  }
};

export const writeU8 = (writer: Writer, value: number) => {
  ensureCapacity(writer, 1);
  writer.buf[writer.offset++] = value;
};

export const readU8 = (reader: Reader): number => {
  assertReadable(reader, 1);
  return reader.buf[reader.offset++]!;
};

export const writeBytes = (writer: Writer, bytes: Uint8Array) => {
  ensureCapacity(writer, bytes.length);
  writer.buf.set(bytes, writer.offset);
  writer.offset += bytes.length;
};

export const readBytes = (reader: Reader, length: number): Uint8Array => {
  assertReadable(reader, length);
  const bytes = reader.buf.slice(reader.offset, reader.offset + length);
  reader.offset += length;
  return bytes;
};

export const assertFullyRead = (reader: Reader) => {
  if (reader.offset !== reader.buf.length) {
    throw new Error("Unexpected trailing bytes in binary message");
  }
};
