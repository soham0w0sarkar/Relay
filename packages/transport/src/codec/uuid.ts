import type { ClientId } from "@weavo/core";
import type { Reader, Writer } from "./buffer";
import { readBytes, writeBytes } from "./buffer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidToBytes = (uuid: ClientId): Uint8Array => {
  if (!UUID_PATTERN.test(uuid)) throw new Error(`Invalid client UUID: ${uuid}`);

  const hex = uuid.replaceAll("-", "");
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

export const bytesToUuid = (bytes: Uint8Array): ClientId => {
  if (bytes.length !== 16) throw new Error("A UUID must contain 16 bytes");

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

export const writeUuid = (writer: Writer, clientId: ClientId) => {
  writeBytes(writer, uuidToBytes(clientId));
};

export const readUuid = (reader: Reader): ClientId =>
  bytesToUuid(readBytes(reader, 16));
