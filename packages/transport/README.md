<p align="center">
  <img src="https://raw.githubusercontent.com/soham0w0sarkar/Weavo/main/docs/assets/logo.png" width="140" alt="weavo" />
</p>

# @weavo/transport

WebSocket transport for Weavo. Encodes CRDT operations and state-vector sync messages as JSON over a pluggable raw transport.

Installed automatically with [`@weavo/client`](https://www.npmjs.com/package/@weavo/client). Use this package directly for custom backends, in-memory test doubles, or server-side relay logic.

## Install

```bash
npm install @weavo/transport
```

## Quick start

```ts
import {
  createWebSocketTransport,
  createTransport,
} from "@weavo/transport";

const raw = createWebSocketTransport("ws://localhost:8080?room=doc-1");
const transport = createTransport(raw);

transport.connect();

transport.onOpen(() => {
  transport.send({ type: "sync-request", vector: new Map(), clientId });
});

transport.onMessage((message) => {
  if (message.type === "op") apply(doc, message.op);
});

transport.send({ type: "op", op });
```

## Message types

| Type | Payload | Purpose |
| --- | --- | --- |
| `op` | `Operation` | Broadcast a local or remote CRDT operation |
| `sync-request` | `vector`, `clientId` | Ask peers for missing operations |
| `sync-response` | `ops`, `clientIds` | Reply with operations the requester lacks |

`createTransport` handles JSON serialization and converts state-vector maps at the transport boundary.

## API overview

| Export | Description |
| --- | --- |
| `createWebSocketTransport(url)` | Browser WebSocket-backed `RawTransport` |
| `createTransport(raw)` | Typed message layer over a raw transport |
| `RawTransport` | Interface for custom transports (tests, Node, etc.) |
| `Transport` | Typed send/receive with parsed `Message` objects |

### Custom transport

```ts
import { createTransport, type RawTransport } from "@weavo/transport";

const raw: RawTransport = {
  connect() { /* ... */ },
  disconnect() { /* ... */ },
  send(data: string) { /* ... */ },
  onMessage(cb) { return () => {}; },
  onOpen(cb) { return () => {}; },
  onClose(cb) { return () => {}; },
};

const transport = createTransport(raw);
```

## Related packages

| Package | Role |
| --- | --- |
| `@weavo/core` | CRDT operations carried in messages |
| `@weavo/sync` | State vectors used in sync requests |
| `@weavo/client` | Wires transport to a textarea out of the box |

## Development

```bash
# from packages/transport
bun test
bun run build
```

## License

MIT
