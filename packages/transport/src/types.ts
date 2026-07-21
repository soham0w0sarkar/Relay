import type { ClientId, Operation } from "@weavo/core";
import type { StateVector } from "@weavo/sync";
import type { webSocketTransport } from "./webSocketTransport/types";

export type RawTransport = webSocketTransport;

export type Message =
  | {
      type: "op";
      op: Operation;
    }
  | {
      type: "sync-request";
      vector: StateVector;
      clientId: ClientId;
    }
  | {
      type: "sync-response";
      ops: Operation[];
      clientIds: ClientId[];
    };

type WireMessage =
  | {
      type: "op";
      op: Operation;
    }
  | {
      type: "sync-request";
      vector: Record<ClientId, number>;
      clientId: ClientId;
    }
  | {
      type: "sync-response";
      ops: Operation[];
      clientIds: ClientId[];
    };

export type Transport = {
  connect(): void;
  disconnect(): void;

  send(message: Message): void;

  onMessage(cb: (message: Message) => void): () => void;

  onOpen(cb: () => void): () => void;
  onClose(cb: () => void): () => void;
};

export type { WireMessage };
