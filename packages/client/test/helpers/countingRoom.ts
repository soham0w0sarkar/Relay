import {
  MSG_OP,
  MSG_SYNC_REQUEST,
  MSG_SYNC_RESPONSE,
  type webSocketTransport,
} from "@weavo/transport";
import { MemoryRoom } from "./memoryTransport";

export type WireStats = {
  syncRequests: number;
  syncResponses: number;
  ops: number;
};

export type CountingMemoryRoom = {
  join: () => webSocketTransport;
  stats: WireStats;
  resetStats: () => void;
};

export const createCountingRoom = (): CountingMemoryRoom => {
  const room = new MemoryRoom();
  const baseJoin = room.join.bind(room);
  const stats: WireStats = { syncRequests: 0, syncResponses: 0, ops: 0 };

  const countMessage = (data: Uint8Array) => {
    const tag = data[1];
    if (tag === MSG_SYNC_REQUEST) stats.syncRequests++;
    else if (tag === MSG_SYNC_RESPONSE) stats.syncResponses++;
    else if (tag === MSG_OP) stats.ops++;
  };

  const join = (): webSocketTransport => {
    const raw = baseJoin();
    return {
      connect: raw.connect.bind(raw),
      disconnect: raw.disconnect.bind(raw),
      onMessage: raw.onMessage.bind(raw),
      onOpen: raw.onOpen.bind(raw),
      onClose: raw.onClose.bind(raw),
      send(data: Uint8Array) {
        countMessage(data);
        raw.send(data);
      },
    };
  };

  return {
    join,
    stats,
    resetStats: () => {
      stats.syncRequests = 0;
      stats.syncResponses = 0;
      stats.ops = 0;
    },
  };
};
