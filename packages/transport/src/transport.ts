import {
  decodeMessage,
  encodeMessage,
  MissingMembershipVersionError,
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
      return raw.onMessage((data) => {
        try {
          cb(decodeMessage(data, codec));
        } catch (error) {
          if (error instanceof MissingMembershipVersionError) {
            codec.onMissingVersion?.(error.version);
            return;
          }
          throw error;
        }
      });
    },

    onOpen: raw.onOpen,
    onClose: raw.onClose,
  };
};
