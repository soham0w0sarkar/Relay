import type { Message, RawTransport, Transport, WireMessage } from "./types";

const encodeMessage = (message: Message): WireMessage => {
  if (message.type === "sync-request") {
    return {
      ...message,
      vector: Object.fromEntries(message.vector),
    };
  }
  return message;
};

const decodeMessage = (wire: WireMessage): Message => {
  if (wire.type === "sync-request") {
    return {
      ...wire,
      vector: new Map(Object.entries(wire.vector)),
    };
  }
  return wire;
};

export const createTransport = (raw: RawTransport): Transport => {
  return {
    connect: raw.connect,
    disconnect: raw.disconnect,

    send(message) {
      raw.send(JSON.stringify(encodeMessage(message)));
    },

    onMessage(cb) {
      return raw.onMessage((data) => {
        const wire = JSON.parse(data) as WireMessage;
        cb(decodeMessage(wire));
      });
    },

    onOpen: raw.onOpen,
    onClose: raw.onClose,
  };
};
