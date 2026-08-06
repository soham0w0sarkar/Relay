import type { StateVector } from "@weavo/sync";
import type { Reader, Writer } from "./buffer";
import type { IdCodec } from "./idCodec";
import { decodeClientId, encodeClientId } from "./operationId";
import { readVarint, writeVarint } from "./varint";

export const encodeStateVector = (
  writer: Writer,
  vector: StateVector,
  codec: IdCodec,
) => {
  writeVarint(writer, vector.size);
  for (const [clientId, clock] of vector) {
    encodeClientId(writer, clientId, codec);
    writeVarint(writer, clock);
  }
};

export const decodeStateVector = (
  reader: Reader,
  membershipVersion: number,
  codec: IdCodec,
): StateVector => {
  const vector: StateVector = new Map();
  const count = readVarint(reader);

  for (let index = 0; index < count; index++) {
    const clientId = decodeClientId(reader, membershipVersion, codec);
    vector.set(clientId, readVarint(reader));
  }
  return vector;
};
