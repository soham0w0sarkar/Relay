import type { ClientId, Operation } from "@weavo/core";
import { isMembershipMessage } from "@weavo/membership";
import type { Message } from "../types";
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
import {
  decodeOperation,
  encodeOperation,
  readOperation,
  writeOperation,
} from "./operation";
import { decodeStateVector, encodeStateVector } from "./stateVector";
import {
  MSG_MEMBERSHIP,
  MSG_OP,
  MSG_SYNC_REQUEST,
  MSG_SYNC_RESPONSE,
  WIRE_VERSION,
} from "./tags";
import { readUtf8, writeUtf8 } from "./utf8";
import { readUuid, writeUuid } from "./uuid";
import { readVarint, writeVarint } from "./varint";

export const encodeMessage = (message: Message): Uint8Array => {
  const writer = createWriter();
  writeU8(writer, WIRE_VERSION);

  if (message.type === "op") {
    writeU8(writer, MSG_OP);
    const operation = encodeOperation(message.op);
    writeVarint(writer, operation.length);
    writeBytes(writer, operation);
  } else if (message.type === "sync-request") {
    writeU8(writer, MSG_SYNC_REQUEST);
    encodeStateVector(writer, message.vector);
    writeUuid(writer, message.clientId);
  } else if (message.type === "sync-response") {
    writeU8(writer, MSG_SYNC_RESPONSE);
    writeVarint(writer, message.ops.length);
    for (const operation of message.ops) writeOperation(writer, operation);
    writeVarint(writer, message.clientIds.length);
    for (const clientId of message.clientIds) writeUuid(writer, clientId);
  } else {
    writeU8(writer, MSG_MEMBERSHIP);
    writeUtf8(writer, JSON.stringify(message));
  }

  return toBytes(writer);
};

export const decodeMessage = (bytes: Uint8Array): Message => {
  const reader = createReader(bytes);
  const version = readU8(reader);
  if (version !== WIRE_VERSION) {
    throw new Error(`Unsupported wire version: ${version}`);
  }

  const tag = readU8(reader);
  let message: Message;

  if (tag === MSG_OP) {
    const operationBytes = readBytes(reader, readVarint(reader));
    message = { type: "op", op: decodeOperation(operationBytes) };
  } else if (tag === MSG_SYNC_REQUEST) {
    message = {
      type: "sync-request",
      vector: decodeStateVector(reader),
      clientId: readUuid(reader),
    };
  } else if (tag === MSG_SYNC_RESPONSE) {
    const ops: Operation[] = [];
    const operationCount = readVarint(reader);
    for (let index = 0; index < operationCount; index++) {
      ops.push(readOperation(reader));
    }

    const clientIds: ClientId[] = [];
    const clientCount = readVarint(reader);
    for (let index = 0; index < clientCount; index++) {
      clientIds.push(readUuid(reader));
    }
    message = { type: "sync-response", ops, clientIds };
  } else if (tag === MSG_MEMBERSHIP) {
    const parsed: unknown = JSON.parse(readUtf8(reader));
    if (!isMembershipMessage(parsed)) {
      throw new Error("Invalid membership message");
    }
    message = parsed;
  } else {
    throw new Error(`Unknown message tag: ${tag}`);
  }

  assertFullyRead(reader);
  return message;
};
