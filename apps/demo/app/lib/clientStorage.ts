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

export type ColorOption = { name: string; value: string };

export const DISPLAY_COLORS: readonly ColorOption[] = [
  { name: "Teal", value: "#0f766e" },
  { name: "Orange", value: "#c2410c" },
  { name: "Blue", value: "#1d4ed8" },
  { name: "Amber", value: "#a16207" },
  { name: "Red", value: "#b91c1c" },
  { name: "Green", value: "#15803d" },
  { name: "Cyan", value: "#0e7490" },
  { name: "Graphite", value: "#44403c" },
];

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Accepts #rgb or #rrggbb, with or without the hash. Returns lowercase #rrggbb. */
export function normalizeHexColor(input: string): string | null {
  const match = HEX_PATTERN.exec(input.trim());
  if (!match) return null;

  const hex = match[1]!.toLowerCase();
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  return `#${full}`;
}

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
  DISPLAY_COLORS[Math.floor(Math.random() * DISPLAY_COLORS.length)]!.value;

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

  const stored = sessionStorage.getItem(DISPLAY_COLOR_KEY);
  const existing = stored ? normalizeHexColor(stored) : null;
  if (existing) return existing;

  const color = generateDisplayColor();
  sessionStorage.setItem(DISPLAY_COLOR_KEY, color);
  return color;
}

export function setDisplayColor(color: string): string {
  const next = normalizeHexColor(color) ?? getOrCreateDisplayColor();
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
