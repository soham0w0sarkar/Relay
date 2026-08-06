import { ROOT_ID, type OperationId } from "@weavo/core";
import type { Reader, Writer } from "./buffer";
import { readU8, writeU8 } from "./buffer";
import { OP_ID_ROOT, OP_ID_UUID } from "./tags";
import { readUuid, writeUuid } from "./uuid";
import { readVarint, writeVarint } from "./varint";

export const encodeOperationId = (writer: Writer, id: OperationId) => {
  const [clientId, clock] = id;

  if (clientId === ROOT_ID[0]) {
    writeU8(writer, OP_ID_ROOT);
  } else {
    writeU8(writer, OP_ID_UUID);
    writeUuid(writer, clientId);
  }
  writeVarint(writer, clock);
};

export const decodeOperationId = (reader: Reader): OperationId => {
  const tag = readU8(reader);
  if (tag === OP_ID_ROOT) return [ROOT_ID[0], readVarint(reader)];
  if (tag === OP_ID_UUID) return [readUuid(reader), readVarint(reader)];
  throw new Error(`Unknown operation ID tag: ${tag}`);
};
