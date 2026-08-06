import type { ServerWebSocket } from "bun";

type RoomData = { room: string };

const PORT = Number(process.env.PORT ?? 8080);
const startedAt = Date.now();
const rooms = new Map<string, Set<ServerWebSocket<RoomData>>>();

const getRoom = (room: string) => {
  if (!rooms.has(room)) rooms.set(room, new Set());
  return rooms.get(room)!;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
};

const httpResponse = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...corsHeaders,
    },
  });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });

const websocketUrl = (req: Request) => {
  const host = req.headers.get("host") ?? `localhost:${PORT}`;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const wsProto = proto === "https" ? "wss" : "ws";
  return `${wsProto}://${host}`;
};

Bun.serve<RoomData>({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "*",
        },
      });
    }

    if (url.pathname === "/health") {
      return httpResponse("ok\n");
    }

    if (url.pathname === "/ready") {
      return jsonResponse({
        ready: true,
        service: "weavo-server",
        websocket: websocketUrl(req),
        uptime: process.uptime(),
        startedAt: new Date(startedAt).toISOString(),
      });
    }

    const room = url.searchParams.get("room") ?? "default";

    if (server.upgrade(req, { data: { room } })) return undefined;

    return httpResponse(
      `Weavo WebSocket server\nConnect with ?room=<id>\nHealth: /health\nReady: /ready\n`,
    );
  },
  websocket: {
    open(ws) {
      const peers = getRoom(ws.data.room);
      peers.add(ws);
      console.log(
        `client joined room "${ws.data.room}" (${peers.size} connected)`,
      );
    },
    message(ws, message) {
      const peers = getRoom(ws.data.room);

      for (const peer of peers) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(message);
        }
      }
    },
    close(ws) {
      const peers = rooms.get(ws.data.room);
      if (!peers) return;
      peers.delete(ws);
      if (peers.size === 0) rooms.delete(ws.data.room);
      console.log(
        `client left room "${ws.data.room}" (${peers.size} connected)`,
      );
    },
  },
});

console.log(`Weavo WebSocket server listening on ws://0.0.0.0:${PORT}`);
console.log(`Local:   ws://localhost:${PORT}`);
console.log(`Network: open the demo Network URL on your phone (same Wi‑Fi)`);
