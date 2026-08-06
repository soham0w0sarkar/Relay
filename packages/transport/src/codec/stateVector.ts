import type { StateVector } from "@weavo/sync";
import type { Reader, Writer } from "./buffer";
import { readUuid, writeUuid } from "./uuid";
import { readVarint, writeVarint } from "./varint";

export const encodeStateVector = (writer: Writer, vector: StateVector) => {
  writeVarint(writer, vector.size);
  for (const [clientId, clock] of vector) {
    writeUuid(writer, clientId);
    writeVarint(writer, clock);
  }
};

export const decodeStateVector = (reader: Reader): StateVector => {
  const vector: StateVector = new Map();
  const count = readVarint(reader);

  for (let index = 0; index < count; index++) {
    vector.set(readUuid(reader), readVarint(reader));
  }
  return vector;
};
