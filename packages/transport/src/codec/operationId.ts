import { ROOT_ID, type ClientId, type OperationId } from "@weavo/core";
import { unresolvedClientId } from "@weavo/sync";
import type { Reader, Writer } from "./buffer";
import { readU8, writeU8 } from "./buffer";
import type { IdCodec } from "./idCodec";
import { OP_ID_ROOT, OP_ID_SHORT, OP_ID_UUID } from "./tags";
import { readUuid, writeUuid } from "./uuid";
import { readVarint, writeVarint } from "./varint";

export const encodeClientId = (
  writer: Writer,
  clientId: ClientId,
  codec: IdCodec,
) => {
  if (clientId === ROOT_ID[0]) {
    writeU8(writer, OP_ID_ROOT);
    return;
  }

  const shortId = codec.shortIdOf(clientId);
  if (shortId !== null) {
    writeU8(writer, OP_ID_SHORT);
    writeVarint(writer, shortId);
    return;
  }

  writeU8(writer, OP_ID_UUID);
  writeUuid(writer, clientId);
};

export const decodeClientId = (
  reader: Reader,
  membershipVersion: number,
  codec: IdCodec,
): ClientId => {
  const tag = readU8(reader);

  if (tag === OP_ID_ROOT) return ROOT_ID[0];

  if (tag === OP_ID_SHORT) {
    const shortId = readVarint(reader);
    return (
      codec.clientIdOf(membershipVersion, shortId) ??
      unresolvedClientId(membershipVersion, shortId)
    );
  }

  if (tag === OP_ID_UUID) return readUuid(reader);

  throw new Error(`Unknown client ID tag: ${tag}`);
};

export const encodeOperationId = (
  writer: Writer,
  id: OperationId,
  codec: IdCodec,
) => {
  const [clientId, clock] = id;
  encodeClientId(writer, clientId, codec);
  writeVarint(writer, clock);
};

export const decodeOperationId = (
  reader: Reader,
  membershipVersion: number,
  codec: IdCodec,
): OperationId => {
  const clientId = decodeClientId(reader, membershipVersion, codec);
  return [clientId, readVarint(reader)];
};
