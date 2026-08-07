<p align="center">
  <img src="https://raw.githubusercontent.com/soham0w0sarkar/Weavo/main/docs/assets/logo.png" width="140" alt="weavo" />
</p>

# @weavo/transport

WebSocket transport for Weavo. Encodes CRDT operations, state-vector sync, and membership consensus into versioned binary frames, and provides a UUID-stable binary codec for document snapshots and deltas.

Installed automatically with [`@weavo/client`](https://www.npmjs.com/package/@weavo/client). Use this package directly for custom backends, in-memory test doubles, relays, or persistence.

## Install

```bash
npm install @weavo/transport
```

## Quick start

```ts
import { createWebSocketTransport, createTransport } from "@weavo/transport";

const raw = createWebSocketTransport("ws://localhost:8080?room=doc-1");
const transport = createTransport(raw, {
  // optional — omit for UUID-only encoding
  idCodec: {
    encodeVersion: () => membership.getCurrent()?.version ?? 0,
    shortIdOf: (id) => membership.shortIdOf(id),
    clientIdOf: (version, shortId) => {
      /* lookup historical table */
    },
    hasVersion: (version) => membership.getVersion(version) !== null,
    onMissingVersion: (version) => membership.requestMembership(version),
  },
});

transport.connect();

transport.onOpen(() => {
  transport.send({ type: "sync-request", vector: new Map(), clientId });
});

transport.onMessage((message) => {
  if (message.type === "op") apply(doc, message.op);
});

transport.send({ type: "op", op });
```

## Wire format (`WIRE_VERSION = 3`)

Every frame starts with `WIRE_VERSION`, then a message tag:

| Tag                 | Type            | Body                                            |
| ------------------- | --------------- | ----------------------------------------------- |
| `MSG_OP`            | `op`            | membership version + length-prefixed operation  |
| `MSG_SYNC_REQUEST`  | `sync-request`  | membership version + state vector + client id   |
| `MSG_SYNC_RESPONSE` | `sync-response` | membership version + ops + requester client ids |
| `MSG_MEMBERSHIP`    | membership      | subtype tag + fields (see below)                |

### Sync path ids

With an `IdCodec`, known clients encode as `OP_ID_SHORT` (varint). Unknown clients and `ROOT` use `OP_ID_UUID` / `OP_ID_ROOT`. The frame’s membership version selects which table decode uses.

Without an `IdCodec`, everything stays UUID (tests / pre-join).

A shortId that the table can't map does not fail the frame. Decode keeps it as an unresolved client id (`unresolvedClientId` from `@weavo/sync`) and calls `onMissingVersion`; `@weavo/sync` holds the operation in its buffer until that membership version arrives and then resolves it.

### Membership path (always UUID)

Consensus and join messages cannot compress against the shortId table they are building. Under `MSG_MEMBERSHIP`, a subtype tag selects the layout:

`JOIN_REQUEST`, `JOIN_RESPONSE`, `LEAVE`, `PREPARE`, `PROMISE`, `ACCEPT`, `ACCEPTED`, `COMMIT`, `MEMBERSHIP_REQUEST`, `MEMBERSHIP_RESPONSE`, `HEARTBEAT`

`Membership` on the wire is `version` + UUID list; shortIds are rebuilt with `buildMembership`. Heartbeat timestamps use a uint53 split (ms since epoch exceeds uint32).

`Message` is the flat union of sync messages and [`MembershipMessage`](https://github.com/soham0w0sarkar/Weavo/tree/main/packages/membership). Use `isMembershipMessage` to demux on receive. Semantics stay in `@weavo/membership`; transport only carries the bytes.

## Persistence codec

In-memory `DocumentSnapshot` / `Operation[]` stay typed objects. For disk:

```ts
import {
  bytesToBase64,
  base64ToBytes,
  encodeDocumentSnapshot,
  decodeDocumentSnapshot,
  encodeDelta,
  decodeDelta,
} from "@weavo/transport";

localStorage.setItem(
  "doc:snapshot",
  bytesToBase64(encodeDocumentSnapshot(weavo.snapshot())),
);
localStorage.setItem("doc:delta", bytesToBase64(encodeDelta([])));

const snapshot = decodeDocumentSnapshot(
  base64ToBytes(localStorage.getItem("doc:snapshot")!),
);
const delta = decodeDelta(base64ToBytes(localStorage.getItem("doc:delta")!));
```

Persistence always uses full UUIDs (`PERSIST_VERSION`). ShortIds are membership-version-local and must not be written to storage.

## API overview

| Export                                              | Description                             |
| --------------------------------------------------- | --------------------------------------- |
| `createWebSocketTransport(url)`                     | Browser WebSocket-backed `RawTransport` |
| `createTransport(raw, options?)`                    | Typed message layer; optional `idCodec` |
| `IdCodec` / `uuidOnlyCodec`                         | shortId ↔ UUID lookups for sync frames  |
| `encodeMessage` / `decodeMessage`                   | Low-level frame codec                   |
| `encodeDocumentSnapshot` / `decodeDocumentSnapshot` | Binary document checkpoints             |
| `encodeDelta` / `decodeDelta`                       | Binary op delta logs                    |
| `bytesToBase64` / `base64ToBytes`                   | Helpers for string-only stores          |
| `RawTransport` / `Transport`                        | Pluggable byte pipe vs typed messages   |
| `WIRE_VERSION` / `PERSIST_VERSION`                  | Current format versions                 |
| `MSG_*` / `MEM_*` / `OP_*`                          | Frame and subtype tags                  |

### Custom transport

```ts
import { createTransport, type RawTransport } from "@weavo/transport";

const raw: RawTransport = {
  connect() {},
  disconnect() {},
  send(data: Uint8Array) {},
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

| Package             | Role                                       |
| ------------------- | ------------------------------------------ |
| `@weavo/core`       | CRDT ops and `DocumentSnapshot`            |
| `@weavo/sync`       | State vectors used in sync requests        |
| `@weavo/membership` | Membership / consensus types and table     |
| `@weavo/client`     | Wires transport + membership to a textarea |

## Development

```bash
# from packages/transport
bun test
bun run build
```

## License

MIT
