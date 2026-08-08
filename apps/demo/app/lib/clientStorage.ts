import type { DocumentSnapshot, Operation } from "@weavo/client";
import {
  base64ToBytes,
  bytesToBase64,
  decodeDelta,
  decodeDocumentSnapshot,
  encodeDelta,
  encodeDocumentSnapshot,
} from "@weavo/transport";

type ClientId = string;

const CLIENT_ID_KEY = "weavo:demo:client-id";
const DISPLAY_NAME_KEY = "weavo:demo:display-name";
const DISPLAY_COLOR_KEY = "weavo:demo:display-color";
const snapshotKey = (roomId: string, clientId: ClientId) =>
  `weavo:demo:${roomId}:snapshot:${clientId}`;
const deltaKey = (roomId: string, clientId: ClientId) =>
  `weavo:demo:${roomId}:delta:${clientId}`;

export type ClientStorage = {
  snapshot: DocumentSnapshot | null;
  delta: Operation[];
};

export const DISPLAY_COLORS = [
  "#0f766e",
  "#c2410c",
  "#1d4ed8",
  "#a16207",
  "#b91c1c",
  "#15803d",
  "#0e7490",
  "#44403c",
] as const;

const newClientId = (): ClientId => crypto.randomUUID();

const decodeStoredSnapshot = (raw: string): DocumentSnapshot => {
  try {
    return decodeDocumentSnapshot(base64ToBytes(raw));
  } catch {
    return JSON.parse(raw) as DocumentSnapshot;
  }
};

const decodeStoredDelta = (raw: string): Operation[] => {
  try {
    return decodeDelta(base64ToBytes(raw));
  } catch {
    return JSON.parse(raw) as Operation[];
  }
};

/** One client id per browser tab (sessionStorage), not shared across tabs. */
export function getOrCreateClientId(): ClientId {
  if (typeof sessionStorage === "undefined") return newClientId();

  const existing = sessionStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const clientId = newClientId();
  sessionStorage.setItem(CLIENT_ID_KEY, clientId);
  return clientId;
}

const NAME_POOL = [
  "Wren",
  "Otter",
  "Lark",
  "Fable",
  "Moss",
  "Ember",
  "Pip",
  "Nimbus",
  "Juniper",
  "Sable",
  "Comet",
  "Fern",
];

const generateDisplayName = () => {
  const word = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
  return `${word}-${Math.floor(Math.random() * 90 + 10)}`;
};

const generateDisplayColor = () =>
  DISPLAY_COLORS[Math.floor(Math.random() * DISPLAY_COLORS.length)]!;

/** One display name per browser tab, matching the client id lifetime. */
export function getOrCreateDisplayName(): string {
  if (typeof sessionStorage === "undefined") return generateDisplayName();

  const existing = sessionStorage.getItem(DISPLAY_NAME_KEY);
  if (existing) return existing;

  const name = generateDisplayName();
  sessionStorage.setItem(DISPLAY_NAME_KEY, name);
  return name;
}

export function setDisplayName(name: string): string {
  const trimmed = name.trim().slice(0, 24) || "Guest";
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  }
  return trimmed;
}

/** One accent color per browser tab for cursors and presence chips. */
export function getOrCreateDisplayColor(): string {
  if (typeof sessionStorage === "undefined") return generateDisplayColor();

  const existing = sessionStorage.getItem(DISPLAY_COLOR_KEY);
  if (existing && (DISPLAY_COLORS as readonly string[]).includes(existing)) {
    return existing;
  }

  const color = generateDisplayColor();
  sessionStorage.setItem(DISPLAY_COLOR_KEY, color);
  return color;
}

export function setDisplayColor(color: string): string {
  const next = (DISPLAY_COLORS as readonly string[]).includes(color)
    ? color
    : generateDisplayColor();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(DISPLAY_COLOR_KEY, next);
  }
  return next;
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
    snapshot: snapshotRaw ? decodeStoredSnapshot(snapshotRaw) : null,
    delta: deltaRaw ? decodeStoredDelta(deltaRaw) : [],
  };
}

export function appendClientDelta(
  roomId: string,
  clientId: ClientId,
  op: Operation,
) {
  const existing = loadClientStorage(roomId, clientId)?.delta ?? [];
  existing.push(op);
  localStorage.setItem(
    deltaKey(roomId, clientId),
    bytesToBase64(encodeDelta(existing)),
  );
}

export function saveClientSnapshot(
  roomId: string,
  clientId: ClientId,
  snapshot: DocumentSnapshot,
) {
  localStorage.setItem(
    snapshotKey(roomId, clientId),
    bytesToBase64(encodeDocumentSnapshot(snapshot)),
  );
  localStorage.setItem(
    deltaKey(roomId, clientId),
    bytesToBase64(encodeDelta([])),
  );
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
