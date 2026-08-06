import type { webSocketTransport } from "@weavo/transport";

type Handler = () => void;
type MessageHandler = (data: Uint8Array) => void;

type MemoryClient = {
  deliver: (data: Uint8Array) => void;
};

export class MemoryRoom {
  private clients = new Set<MemoryClient>();

  join(): webSocketTransport {
    const messageHandlers = new Set<MessageHandler>();
    const openHandlers = new Set<Handler>();
    const closeHandlers = new Set<Handler>();
    const room = this;

    const client: MemoryClient = {
      deliver(data: Uint8Array) {
        for (const cb of messageHandlers) cb(data);
      },
    };

    return {
      connect() {
        room.clients.add(client);
        queueMicrotask(() => {
          for (const cb of openHandlers) cb();
        });
      },

      disconnect() {
        room.clients.delete(client);
        for (const cb of closeHandlers) cb();
      },

      send(data: Uint8Array) {
        for (const peer of room.clients) {
          if (peer !== client) peer.deliver(data);
        }
      },

      onMessage(cb: MessageHandler) {
        messageHandlers.add(cb);
        return () => messageHandlers.delete(cb);
      },

      onOpen(cb: Handler) {
        openHandlers.add(cb);
        return () => openHandlers.delete(cb);
      },

      onClose(cb: Handler) {
        closeHandlers.add(cb);
        return () => closeHandlers.delete(cb);
      },
    };
  }
}
