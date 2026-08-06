<p align="center">
  <img src="https://raw.githubusercontent.com/soham0w0sarkar/Weavo/main/docs/assets/logo.png" width="140" alt="weavo" />
</p>

# @weavo/transport

WebSocket transport for Weavo. Encodes CRDT operations, state-vector sync, and membership consensus messages into versioned binary frames over a pluggable raw transport.

Installed automatically with [`@weavo/client`](https://www.npmjs.com/package/@weavo/client). Use this package directly for custom backends, in-memory test doubles, or server-side relay logic.

## Install

```bash
npm install @weavo/transport
```

## Quick start

```ts
import { createWebSocketTransport, createTransport } from "@weavo/transport";

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

| Type            | Payload              | Purpose                                                            |
| --------------- | -------------------- | ------------------------------------------------------------------ |
| `op`            | `Operation`          | Broadcast a local or remote CRDT operation                         |
| `sync-request`  | `vector`, `clientId` | Ask peers for missing operations                                   |
| `sync-response` | `ops`, `clientIds`   | Reply with operations the requester lacks                          |
| membership      | `MembershipMessage`  | CASPaxos join/leave/presence (`PREPARE`, `COMMIT`, `HEARTBEAT`, …) |

`Message` is the flat union of sync messages and [`MembershipMessage`](https://github.com/soham0w0sarkar/Weavo/tree/main/packages/membership) from `@weavo/membership`. Use `isMembershipMessage` to demux on receive. Membership semantics stay in `@weavo/membership`; transport only carries the wire shapes.

`createTransport` handles binary serialization at the transport boundary. Operations, clocks, state vectors, and message tags use compact binary encodings. Pass an `idCodec` (usually wired from `@weavo/membership`) so sync frames carry a membership version and known client ids compress to short integers; unmapped ids stay full 16-byte UUIDs. Membership payloads are JSON encoded inside a versioned binary membership frame.

## API overview

| Export                          | Description                                         |
| ------------------------------- | --------------------------------------------------- |
| `createWebSocketTransport(url)` | Browser WebSocket-backed `RawTransport`             |
| `createTransport(raw, options?)`| Typed message layer over a raw transport            |
| `RawTransport`                  | Interface for custom transports (tests, Node, etc.) |
| `Transport`                     | Typed send/receive with parsed `Message` objects    |
| `IdCodec`                       | Optional shortId / UUID encode-decode lookups       |

### Custom transport

```ts
import { createTransport, type RawTransport } from "@weavo/transport";

const raw: RawTransport = {
  connect() {
    /* ... */
  },
  disconnect() {
    /* ... */
  },
  send(data: Uint8Array) {
    /* ... */
  },
  onMessage(cb) {
    return () => {};
  },
  onOpen(cb) {
    return () => {};
  },
  onClose(cb) {
    return () => {};
  },
};

const transport = createTransport(raw);
```

## Related packages

| Package             | Role                                         |
| ------------------- | -------------------------------------------- |
| `@weavo/core`       | CRDT operations carried in messages          |
| `@weavo/sync`       | State vectors used in sync requests          |
| `@weavo/membership` | Membership / consensus message types         |
| `@weavo/client`     | Wires transport to a textarea out of the box |

## Development

```bash
# from packages/transport
bun test
bun run build
```

## License

MIT
