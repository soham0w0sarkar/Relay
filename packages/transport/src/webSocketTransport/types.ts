export type Unsubscribe = () => void;

export type WebSocketTransportOptions = {
  reconnect?: boolean;
  reconnectMinDelay?: number;
  reconnectMaxDelay?: number;
};

export type webSocketTransport = {
  connect(): void;
  disconnect(): void;

  send(data: string): void;

  onMessage(cb: (data: string) => void): Unsubscribe;
  onOpen(cb: () => void): Unsubscribe;
  onClose(cb: () => void): Unsubscribe;
};
