import type {
  Unsubscribe,
  webSocketTransport,
  WebSocketTransportOptions,
} from "./types";

const defaultOptions = {
  reconnect: true,
  reconnectMinDelay: 1000,
  reconnectMaxDelay: 30_000,
} satisfies Required<WebSocketTransportOptions>;

export const createWebSocketTransport = (
  url: string,
  options: WebSocketTransportOptions = {},
): webSocketTransport => {
  const { reconnect, reconnectMinDelay, reconnectMaxDelay } = {
    ...defaultOptions,
    ...options,
  };

  let socket: WebSocket | null = null;
  let closedIntentionally = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const pendingSend: string[] = [];

  const messageListeners = new Set<(data: string) => void>();
  const openListeners = new Set<() => void>();
  const closeListeners = new Set<() => void>();

  const subscribe = <T>(listeners: Set<T>, cb: T): Unsubscribe => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  };

  const isOpen = () => socket?.readyState === WebSocket.OPEN;

  const flushPending = () => {
    while (pendingSend.length > 0 && isOpen()) {
      socket!.send(pendingSend.shift()!);
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const scheduleReconnect = () => {
    if (!reconnect || closedIntentionally) return;
    clearReconnectTimer();
    const delay = Math.min(
      reconnectMinDelay * 2 ** reconnectAttempt,
      reconnectMaxDelay,
    );
    reconnectAttempt++;
    reconnectTimer = setTimeout(connectInternal, delay);
  };

  const connectInternal = () => {
    if (
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      reconnectAttempt = 0;
      flushPending();
      openListeners.forEach((cb) => cb());
    });

    socket.addEventListener("message", (event) => {
      messageListeners.forEach((cb) => cb(event.data));
    });

    socket.addEventListener("close", () => {
      socket = null;
      closeListeners.forEach((cb) => cb());
      scheduleReconnect();
    });
  };

  if (typeof document !== "undefined" && reconnect) {
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        !closedIntentionally &&
        !isOpen() &&
        socket?.readyState !== WebSocket.CONNECTING
      ) {
        reconnectAttempt = 0;
        clearReconnectTimer();
        connectInternal();
      }
    });
  }

  return {
    connect() {
      closedIntentionally = false;
      connectInternal();
    },

    disconnect() {
      closedIntentionally = true;
      clearReconnectTimer();
      pendingSend.length = 0;
      socket?.close();
    },

    send(data: string) {
      if (isOpen()) {
        socket!.send(data);
        return;
      }

      if (closedIntentionally) {
        throw new Error("Transport not connected");
      }

      pendingSend.push(data);
      if (reconnect && !socket && reconnectTimer === undefined) {
        reconnectAttempt = 0;
        connectInternal();
      }
    },

    onMessage(cb) {
      return subscribe(messageListeners, cb);
    },

    onOpen(cb) {
      return subscribe(openListeners, cb);
    },

    onClose(cb) {
      return subscribe(closeListeners, cb);
    },
  };
};
