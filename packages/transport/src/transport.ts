import { decodeMessage, encodeMessage } from "./codec";
import type { RawTransport, Transport } from "./types";

export const createTransport = (raw: RawTransport): Transport => {
  return {
    connect: raw.connect,
    disconnect: raw.disconnect,

    send(message) {
      raw.send(encodeMessage(message));
    },

    onMessage(cb) {
      return raw.onMessage((data) => cb(decodeMessage(data)));
    },

    onOpen: raw.onOpen,
    onClose: raw.onClose,
  };
};
