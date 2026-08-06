import type { Operation } from "@weavo/core";
import type { Reader, Writer } from "./buffer";
import {
  assertFullyRead,
  createReader,
  createWriter,
  readBytes,
  readU8,
  toBytes,
  writeBytes,
  writeU8,
} from "./buffer";
import { decodeOperationId, encodeOperationId } from "./operationId";
import { OP_DELETE, OP_INSERT, OP_INSERT_NO_RIGHT } from "./tags";
import { readUtf8, writeUtf8 } from "./utf8";
import { readVarint, writeVarint } from "./varint";

export const encodeOperation = (op: Operation): Uint8Array => {
  const writer = createWriter();

  if (op.type === "delete") {
    writeU8(writer, OP_DELETE);
    encodeOperationId(writer, op.target);
    return toBytes(writer);
  }

  writeU8(writer, op.rightOrigin === null ? OP_INSERT_NO_RIGHT : OP_INSERT);
  encodeOperationId(writer, op.id);
  writeUtf8(writer, op.value);
  encodeOperationId(writer, op.leftOrigin);
  if (op.rightOrigin !== null) encodeOperationId(writer, op.rightOrigin);
  return toBytes(writer);
};

export const decodeOperation = (bytes: Uint8Array): Operation => {
  const reader = createReader(bytes);
  const tag = readU8(reader);
  let operation: Operation;

  if (tag === OP_DELETE) {
    operation = { type: "delete", target: decodeOperationId(reader) };
  } else if (tag === OP_INSERT || tag === OP_INSERT_NO_RIGHT) {
    operation = {
      type: "insert",
      id: decodeOperationId(reader),
      value: readUtf8(reader),
      leftOrigin: decodeOperationId(reader),
      rightOrigin: tag === OP_INSERT ? decodeOperationId(reader) : null,
    };
  } else {
    throw new Error(`Unknown operation tag: ${tag}`);
  }

  assertFullyRead(reader);
  return operation;
};

export const writeOperation = (writer: Writer, op: Operation) => {
  const bytes = encodeOperation(op);
  writeVarint(writer, bytes.length);
  writeBytes(writer, bytes);
};

export const readOperation = (reader: Reader): Operation =>
  decodeOperation(readBytes(reader, readVarint(reader)));
