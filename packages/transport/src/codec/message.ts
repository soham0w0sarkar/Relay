import type { ClientId, Operation } from "@weavo/core";
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
import type { IdCodec } from "./idCodec";
import {
  MissingMembershipVersionError,
  uuidOnlyCodec,
} from "./idCodec";
import {
  decodeMembershipMessage,
  encodeMembershipMessage,
} from "./membership";
import {
  decodeOperation,
  encodeOperation,
  readOperation,
  writeOperation,
} from "./operation";
import { decodeClientId, encodeClientId } from "./operationId";
import { decodeStateVector, encodeStateVector } from "./stateVector";
import {
  MSG_MEMBERSHIP,
  MSG_OP,
  MSG_SYNC_REQUEST,
  MSG_SYNC_RESPONSE,
  WIRE_VERSION,
} from "./tags";
import { readVarint, writeVarint } from "./varint";

const ensureMembershipVersion = (
  membershipVersion: number,
  codec: IdCodec,
) => {
  if (codec.hasVersion && !codec.hasVersion(membershipVersion)) {
    throw new MissingMembershipVersionError(membershipVersion);
  }
};

export const encodeMessage = (
  message: Message,
  codec: IdCodec = uuidOnlyCodec,
): Uint8Array => {
  const writer = createWriter();
  writeU8(writer, WIRE_VERSION);

  if (message.type === "op") {
    writeU8(writer, MSG_OP);
    writeVarint(writer, codec.encodeVersion());
    const operation = encodeOperation(message.op, codec);
    writeVarint(writer, operation.length);
    writeBytes(writer, operation);
  } else if (message.type === "sync-request") {
    writeU8(writer, MSG_SYNC_REQUEST);
    writeVarint(writer, codec.encodeVersion());
    encodeStateVector(writer, message.vector, codec);
    encodeClientId(writer, message.clientId, codec);
  } else if (message.type === "sync-response") {
    writeU8(writer, MSG_SYNC_RESPONSE);
    writeVarint(writer, codec.encodeVersion());
    writeVarint(writer, message.ops.length);
    for (const operation of message.ops) writeOperation(writer, operation, codec);
    writeVarint(writer, message.clientIds.length);
    for (const clientId of message.clientIds) {
      encodeClientId(writer, clientId, codec);
    }
  } else {
    writeU8(writer, MSG_MEMBERSHIP);
    encodeMembershipMessage(writer, message);
  }

  return toBytes(writer);
};

export const decodeMessage = (
  bytes: Uint8Array,
  codec: IdCodec = uuidOnlyCodec,
): Message => {
  const reader = createReader(bytes);
  const version = readU8(reader);
  if (version !== WIRE_VERSION) {
    throw new Error(`Unsupported wire version: ${version}`);
  }

  const tag = readU8(reader);
  let message: Message;

  if (tag === MSG_OP) {
    const membershipVersion = readVarint(reader);
    ensureMembershipVersion(membershipVersion, codec);
    const operationBytes = readBytes(reader, readVarint(reader));
    message = {
      type: "op",
      op: decodeOperation(operationBytes, membershipVersion, codec),
    };
  } else if (tag === MSG_SYNC_REQUEST) {
    const membershipVersion = readVarint(reader);
    ensureMembershipVersion(membershipVersion, codec);
    message = {
      type: "sync-request",
      vector: decodeStateVector(reader, membershipVersion, codec),
      clientId: decodeClientId(reader, membershipVersion, codec),
    };
  } else if (tag === MSG_SYNC_RESPONSE) {
    const membershipVersion = readVarint(reader);
    ensureMembershipVersion(membershipVersion, codec);
    const ops: Operation[] = [];
    const operationCount = readVarint(reader);
    for (let index = 0; index < operationCount; index++) {
      ops.push(readOperation(reader, membershipVersion, codec));
    }

    const clientIds: ClientId[] = [];
    const clientCount = readVarint(reader);
    for (let index = 0; index < clientCount; index++) {
      clientIds.push(decodeClientId(reader, membershipVersion, codec));
    }
    message = { type: "sync-response", ops, clientIds };
  } else if (tag === MSG_MEMBERSHIP) {
    message = decodeMembershipMessage(reader);
  } else {
    throw new Error(`Unknown message tag: ${tag}`);
  }

  assertFullyRead(reader);
  return message;
};
