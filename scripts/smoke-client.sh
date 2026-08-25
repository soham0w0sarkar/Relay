#!/usr/bin/env bash
# Smoke-test the published @weavo/client from npm (not the workspace).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$(mktemp -d "${TMPDIR:-/tmp}/weavo-client-smoke.XXXXXX")"
cleanup() { rm -rf "$DIR"; }
trap cleanup EXIT

echo "→ temp dir: $DIR"
cd "$DIR"

cat > package.json <<'EOF'
{
  "name": "weavo-client-smoke",
  "private": true,
  "type": "module"
}
EOF

echo "→ installing @weavo/client@2.0.2 from npm…"
npm install --no-fund --no-audit @weavo/client@2.0.2

node -e '
const pkg = require("./node_modules/@weavo/client/package.json");
const deps = pkg.dependencies || {};
console.log("installed:", pkg.name + "@" + pkg.version);
console.log("deps:", Object.entries(deps).map(([k,v]) => k+"@"+v).join(", "));
'

cat > smoke.mjs <<'EOF'
import { createWeavo } from "@weavo/client";

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/** Minimal in-memory RawTransport (same shape as WebSocketTransport). */
class MemoryRoom {
  #clients = new Set();

  join() {
    const messageHandlers = new Set();
    const openHandlers = new Set();
    const closeHandlers = new Set();
    const room = this;

    const client = {
      deliver(data) {
        for (const cb of messageHandlers) cb(data);
      },
    };

    return {
      connect() {
        room.#clients.add(client);
        queueMicrotask(() => {
          for (const cb of openHandlers) cb();
        });
      },
      disconnect() {
        room.#clients.delete(client);
        for (const cb of closeHandlers) cb();
      },
      send(data) {
        for (const peer of room.#clients) {
          if (peer !== client) peer.deliver(data);
        }
      },
      onMessage(cb) {
        messageHandlers.add(cb);
        return () => messageHandlers.delete(cb);
      },
      onOpen(cb) {
        openHandlers.add(cb);
        return () => openHandlers.delete(cb);
      },
      onClose(cb) {
        closeHandlers.add(cb);
        return () => closeHandlers.delete(cb);
      },
    };
  }
}

const waitUntil = async (pred, label, ms = 3000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timeout waiting for ${label}`);
};

const room = new MemoryRoom();

const alice = createWeavo(room.join(), {
  clientId: "alice-smoke-0001",
  name: "Alice",
  color: "#7c3aed",
  foundingGraceMs: 0,
  heartbeatIntervalMs: 50,
});

assert(!alice.membership.isJoined(), "alice should start unjoined");

await waitUntil(() => alice.membership.isJoined(), "alice join");
assert(alice.membership.shortIdOf("alice-smoke-0001") === 0, "alice shortId");

const bob = createWeavo(room.join(), {
  clientId: "bob-smoke-00000002",
  name: "Bob",
  color: "#ea580c",
  foundingGraceMs: 5_000,
  heartbeatIntervalMs: 50,
});

await waitUntil(() => bob.membership.isJoined(), "bob join");
assert(bob.membership.getCurrent()?.members.length === 2, "two members");

alice.setIdentity({ name: "Alicia" });
await waitUntil(
  () => bob.getPresence().get("alice-smoke-0001")?.name === "Alicia",
  "alice presence rename on bob",
  4000,
);

const snap = alice.snapshot();
assert(snap && typeof snap === "object", "snapshot shape");

alice.disconnect();
bob.disconnect();

console.log("ok — @weavo/client joined, presence renamed, snapshot taken");
EOF

echo "→ running smoke…"
node smoke.mjs
echo "→ smoke passed"
