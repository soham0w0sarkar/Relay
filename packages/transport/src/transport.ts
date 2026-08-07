import {
  decodeMessage,
  encodeMessage,
  uuidOnlyCodec,
  type IdCodec,
} from "./codec";
import type { RawTransport, Transport } from "./types";

export type CreateTransportOptions = {
  idCodec?: IdCodec;
};

export const createTransport = (
  raw: RawTransport,
  options: CreateTransportOptions = {},
): Transport => {
  const codec = options.idCodec ?? uuidOnlyCodec;

  return {
    connect: raw.connect,
    disconnect: raw.disconnect,

    send(message) {
      raw.send(encodeMessage(message, codec));
    },

    onMessage(cb) {
      return raw.onMessage((data) => cb(decodeMessage(data, codec)));
    },

    onOpen: raw.onOpen,
    onClose: raw.onClose,
  };
};
