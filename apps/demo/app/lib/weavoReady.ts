import { getWeavoWsBase, isPrivateNetworkHost } from "./weavoUrl";

export type WeavoReadyResponse = {
  ready: boolean;
  service: string;
  websocket: string;
  uptime: number;
  startedAt: string;
};

/** HTTP base for the configured Weavo server (wss → https). */
export function getWeavoHttpBase(): string {
  const url = new URL(getWeavoWsBase());
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.origin;
}

/** Ping /ready — wakes Render from sleep and checks if WebSocket connections are accepted. */
export async function checkWeavoServerReady(): Promise<WeavoReadyResponse> {
  const res = await fetch(`${getWeavoHttpBase()}/ready`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Weavo server not ready (${res.status})`);
  const body = (await res.json()) as WeavoReadyResponse;
  if (!body.ready) throw new Error("Weavo server not ready");
  return body;
}

/** True for hosted production relays — not localhost or same-Wi‑Fi LAN. */
export function isRemoteWeavoServer(): boolean {
  const { hostname } = new URL(getWeavoWsBase());
  return !isPrivateNetworkHost(hostname);
}
