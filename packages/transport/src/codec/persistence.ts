import {
  ROOT_ID,
  toKey,
  type ClientId,
  type DocumentSnapshot,
  type Operation,
  type OperationId,
  type OperationKey,
  type SerializedSkipListNode,
  type SerializedStoreNode,
} from "@weavo/core";
import {
  assertFullyRead,
  createReader,
  createWriter,
  readU8,
  toBytes,
  writeU8,
  type Reader,
  type Writer,
} from "./buffer";
import { uuidOnlyCodec } from "./idCodec";
import { readOperation, writeOperation } from "./operation";
import { decodeOperationId, encodeOperationId } from "./operationId";
import { decodeStateVector, encodeStateVector } from "./stateVector";
import { readUtf8, writeUtf8 } from "./utf8";
import { readUuid, writeUuid } from "./uuid";
import { readVarint, writeVarint } from "./varint";

export const PERSIST_VERSION = 1;

const fromKey = (key: OperationKey): OperationId => {
  if (key === toKey(ROOT_ID)) return ROOT_ID;
  const sep = key.lastIndexOf(":");
  if (sep <= 0) throw new Error(`Invalid operation key: ${key}`);
  const clock = Number(key.slice(sep + 1));
  if (!Number.isInteger(clock) || clock < 0) {
    throw new Error(`Invalid operation key clock: ${key}`);
  }
  return [key.slice(0, sep) as ClientId, clock];
};

const writeOptionalOperationId = (
  writer: Writer,
  id: OperationId | null,
) => {
  if (id === null) {
    writeU8(writer, 0);
    return;
  }
  writeU8(writer, 1);
  encodeOperationId(writer, id, uuidOnlyCodec);
};

const readOptionalOperationId = (reader: Reader): OperationId | null => {
  const flag = readU8(reader);
  if (flag === 0) return null;
  if (flag === 1) return decodeOperationId(reader, 0, uuidOnlyCodec);
  throw new Error(`Invalid optional operation id flag: ${flag}`);
};

const writeOptionalOperationKey = (
  writer: Writer,
  key: OperationKey | null,
) => {
  if (key === null) {
    writeU8(writer, 0);
    return;
  }
  writeU8(writer, 1);
  encodeOperationId(writer, fromKey(key), uuidOnlyCodec);
};

const readOptionalOperationKey = (reader: Reader): OperationKey | null => {
  const flag = readU8(reader);
  if (flag === 0) return null;
  if (flag === 1) {
    return toKey(decodeOperationId(reader, 0, uuidOnlyCodec));
  }
  throw new Error(`Invalid optional operation key flag: ${flag}`);
};

const writeStoreNode = (writer: Writer, node: SerializedStoreNode) => {
  encodeOperationId(writer, node.id, uuidOnlyCodec);
  writeUtf8(writer, node.value);
  writeU8(writer, node.tombstone ? 1 : 0);
  writeOptionalOperationId(writer, node.leftOrigin);
  writeOptionalOperationId(writer, node.rightOrigin);
  writeOptionalOperationKey(writer, node.nextKey);
};

const readStoreNode = (reader: Reader): SerializedStoreNode => ({
  id: decodeOperationId(reader, 0, uuidOnlyCodec),
  value: readUtf8(reader),
  tombstone: readU8(reader) === 1,
  leftOrigin: readOptionalOperationId(reader),
  rightOrigin: readOptionalOperationId(reader),
  nextKey: readOptionalOperationKey(reader),
});

const writeSkipListNode = (writer: Writer, node: SerializedSkipListNode) => {
  encodeOperationId(writer, fromKey(node.refCrdtKey), uuidOnlyCodec);
  writeVarint(writer, node.height);
  if (node.nextKeys.length !== node.height || node.span.length !== node.height) {
    throw new Error("Skip list node height does not match nextKeys/span length");
  }
  for (const key of node.nextKeys) writeOptionalOperationKey(writer, key);
  for (const span of node.span) writeVarint(writer, span);
};

const readSkipListNode = (reader: Reader): SerializedSkipListNode => {
  const refCrdtKey = toKey(decodeOperationId(reader, 0, uuidOnlyCodec));
  const height = readVarint(reader);
  const nextKeys: (OperationKey | null)[] = [];
  for (let index = 0; index < height; index++) {
    nextKeys.push(readOptionalOperationKey(reader));
  }
  const span: number[] = [];
  for (let index = 0; index < height; index++) {
    span.push(readVarint(reader));
  }
  return { refCrdtKey, height, nextKeys, span };
};

export const encodeDocumentSnapshot = (
  snapshot: DocumentSnapshot,
): Uint8Array => {
  if (snapshot.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
  }

  const writer = createWriter();
  writeU8(writer, PERSIST_VERSION);
  writeUuid(writer, snapshot.clientId);
  writeVarint(writer, snapshot.counter);

  writeVarint(writer, snapshot.nodes.length);
  for (const node of snapshot.nodes) writeStoreNode(writer, node);

  writeVarint(writer, snapshot.skipListLength);
  writeVarint(writer, snapshot.skipListNodes.length);
  for (const node of snapshot.skipListNodes) writeSkipListNode(writer, node);

  encodeStateVector(
    writer,
    new Map(Object.entries(snapshot.stateVector)),
    uuidOnlyCodec,
  );

  return toBytes(writer);
};

export const decodeDocumentSnapshot = (bytes: Uint8Array): DocumentSnapshot => {
  const reader = createReader(bytes);
  const version = readU8(reader);
  if (version !== PERSIST_VERSION) {
    throw new Error(`Unsupported persistence version: ${version}`);
  }

  const clientId = readUuid(reader);
  const counter = readVarint(reader);

  const nodeCount = readVarint(reader);
  const nodes: SerializedStoreNode[] = [];
  for (let index = 0; index < nodeCount; index++) {
    nodes.push(readStoreNode(reader));
  }

  const skipListLength = readVarint(reader);
  const skipCount = readVarint(reader);
  const skipListNodes: SerializedSkipListNode[] = [];
  for (let index = 0; index < skipCount; index++) {
    skipListNodes.push(readSkipListNode(reader));
  }

  const stateVector = Object.fromEntries(
    decodeStateVector(reader, 0, uuidOnlyCodec),
  );

  assertFullyRead(reader);

  return {
    version: 1,
    clientId,
    counter,
    nodes,
    skipListNodes,
    skipListLength,
    stateVector,
  };
};

export const encodeDelta = (ops: Operation[]): Uint8Array => {
  const writer = createWriter();
  writeU8(writer, PERSIST_VERSION);
  writeVarint(writer, ops.length);
  for (const op of ops) writeOperation(writer, op, uuidOnlyCodec);
  return toBytes(writer);
};

export const decodeDelta = (bytes: Uint8Array): Operation[] => {
  const reader = createReader(bytes);
  const version = readU8(reader);
  if (version !== PERSIST_VERSION) {
    throw new Error(`Unsupported persistence version: ${version}`);
  }

  const count = readVarint(reader);
  const ops: Operation[] = [];
  for (let index = 0; index < count; index++) {
    ops.push(readOperation(reader, 0, uuidOnlyCodec));
  }
  assertFullyRead(reader);
  return ops;
};

type GlobalBuffer = {
  from(data: Uint8Array | string, encoding?: string): Uint8Array & {
    toString(encoding: string): string;
  };
};

const nodeBuffer = (globalThis as { Buffer?: GlobalBuffer }).Buffer;

export const bytesToBase64 = (bytes: Uint8Array): string => {
  if (nodeBuffer) {
    return nodeBuffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const base64ToBytes = (value: string): Uint8Array => {
  if (nodeBuffer) {
    return new Uint8Array(nodeBuffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};
