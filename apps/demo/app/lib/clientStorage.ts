import type { DocumentSnapshot, Operation } from "@weavo/client";

type ClientId = string;

const CLIENT_ID_KEY = "weavo:demo:client-id";
const snapshotKey = (roomId: string, clientId: ClientId) =>
  `weavo:demo:${roomId}:snapshot:${clientId}`;
const deltaKey = (roomId: string, clientId: ClientId) =>
  `weavo:demo:${roomId}:delta:${clientId}`;

export type ClientStorage = {
  snapshot: DocumentSnapshot | null;
  delta: Operation[];
};

const newClientId = (): ClientId => crypto.randomUUID();

/** One client id per browser tab (sessionStorage), not shared across tabs. */
export function getOrCreateClientId(): ClientId {
  if (typeof sessionStorage === "undefined") return newClientId();

  const existing = sessionStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const clientId = newClientId();
  sessionStorage.setItem(CLIENT_ID_KEY, clientId);
  return clientId;
}

export function loadClientStorage(
  roomId: string,
  clientId: ClientId,
): ClientStorage | null {
  if (typeof localStorage === "undefined" || !roomId) return null;

  const snapshotRaw = localStorage.getItem(snapshotKey(roomId, clientId));
  const deltaRaw = localStorage.getItem(deltaKey(roomId, clientId));

  if (!snapshotRaw && !deltaRaw) return null;

  return {
    snapshot: snapshotRaw ? (JSON.parse(snapshotRaw) as DocumentSnapshot) : null,
    delta: deltaRaw ? (JSON.parse(deltaRaw) as Operation[]) : [],
  };
}

export function appendClientDelta(
  roomId: string,
  clientId: ClientId,
  op: Operation,
) {
  const existing = loadClientStorage(roomId, clientId)?.delta ?? [];
  existing.push(op);
  localStorage.setItem(deltaKey(roomId, clientId), JSON.stringify(existing));
}

export function saveClientSnapshot(
  roomId: string,
  clientId: ClientId,
  snapshot: DocumentSnapshot,
) {
  localStorage.setItem(snapshotKey(roomId, clientId), JSON.stringify(snapshot));
  localStorage.setItem(deltaKey(roomId, clientId), JSON.stringify([]));
}

export function hasClientSnapshot(roomId: string, clientId: ClientId): boolean {
  if (typeof localStorage === "undefined" || !roomId) return false;
  return localStorage.getItem(snapshotKey(roomId, clientId)) !== null;
}

export function clearClientStorage(roomId: string, clientId: ClientId) {
  if (typeof localStorage === "undefined" || !roomId) return;
  localStorage.removeItem(snapshotKey(roomId, clientId));
  localStorage.removeItem(deltaKey(roomId, clientId));
}
