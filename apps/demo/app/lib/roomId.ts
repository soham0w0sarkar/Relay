const STORAGE_KEY = "weavo-demo-room";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRoomId(): string {
  return crypto.randomUUID();
}

export function shortRoomId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function isRoomId(value: string): boolean {
  return UUID.test(value.trim());
}

/** Accept a raw UUID or legacy `?room=` link pasted into join. */
export function parseRoomId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (isRoomId(trimmed)) return trimmed;

  try {
    const fromQuery = new URL(trimmed).searchParams.get("room");
    if (fromQuery && isRoomId(fromQuery)) return fromQuery;
  } catch {
    // not a URL
  }

  return null;
}

export function loadStoredRoomId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  return stored && isRoomId(stored) ? stored : null;
}

export function storeRoomId(roomId: string | null) {
  if (typeof sessionStorage === "undefined") return;
  if (roomId) sessionStorage.setItem(STORAGE_KEY, roomId);
  else sessionStorage.removeItem(STORAGE_KEY);
}
