<p align="center">
  <img src="https://raw.githubusercontent.com/soham0w0sarkar/Weavo/main/docs/assets/logo.png" width="140" alt="weavo" />
</p>

# @weavo/core

CRDT engine for collaborative text editing. Deterministic insert/delete operations, document replicas, and a skip-list index — the foundation every other `@weavo/*` package builds on.

Most apps should use [`@weavo/client`](https://www.npmjs.com/package/@weavo/client) instead. Reach for `@weavo/core` when you need custom editors, server-side replicas, or direct control over operations.

## Install

```bash
npm install @weavo/core
```

## Quick start

```ts
import {
  createReplica,
  generateClientId,
  onInput,
  apply,
  getText,
} from "@weavo/core";

const clientId = generateClientId();
const doc = createReplica(clientId);

// apply a remote operation
apply(doc, remoteOp, (op, index) => {
  console.log("applied", op, "at", index);
});

const text = getText(doc.store);
```

## What it provides

- **Document replicas** — `createReplica(clientId)` with a node store and skip list
- **Operations** — typed `insert` and `delete` ops with fractional indexing via operation IDs
- **Local input** — `onInput` / `onBeforeInput` turn browser `InputEvent`s into operations
- **Apply** — `apply` merges remote ops into a replica
- **IDs** — `ClientId`, `OperationId`, `RootId`, and comparison helpers
- **Skip list** — index ↔ operation mapping for O(log n) text positions

## API overview

| Export                                 | Description                                      |
| -------------------------------------- | ------------------------------------------------ |
| `createReplica(clientId)`              | Create a new document replica                    |
| `apply(doc, op, onApplied?)`           | Apply one remote operation                       |
| `onInput(event, doc, snapshot)`        | Convert a local `InputEvent` to operations       |
| `getText(store)`                       | Read the current plain text                      |
| `generateClientId()`                   | Create a unique client identifier                |
| `createSkipList()`                     | Low-level index structure                        |
| `takeSnapshot(doc, stateVector)`       | Serialize a replica + state vector to JSON       |
| `restoreSnapshot(snapshot)`            | Restore `{ doc, stateVector }` from a checkpoint |
| `restoreFromStorage(snapshot, delta?)` | Restore base snapshot and replay delta ops       |
| `replayOperations(doc, sv, ops)`       | Apply ops on top of a restored replica           |

See `src/index.ts` for the full export surface.

## Snapshots

Checkpoints capture the full CRDT state — node store, skip list, client counter, and state vector — as JSON. Use them to reload a document without replaying its entire history from scratch.

```ts
import {
  createReplica,
  generateClientId,
  takeSnapshot,
  restoreFromStorage,
  getText,
  type Operation,
} from "@weavo/core";

const clientId = generateClientId();
const doc = createReplica(clientId);
const sv = new Map<string, number>();

// ... apply ops, update sv as you go ...

const base = takeSnapshot(doc, sv);

// persist base + any later ops in your DB
const delta: Operation[] = []; // ops since `base` was saved

// later — restore and continue
const { doc: restored, stateVector } = restoreFromStorage(base, delta);
console.log(getText(restored.store));
```

| Export                                 | Description                                                |
| -------------------------------------- | ---------------------------------------------------------- |
| `takeSnapshot(doc, stateVector)`       | Create a `DocumentSnapshot` (version 1, JSON-serializable) |
| `restoreSnapshot(snapshot)`            | Rebuild `{ doc, stateVector }` without replaying ops       |
| `replayOperations(doc, sv, ops)`       | Apply a list of ops and advance the state vector           |
| `restoreFromStorage(snapshot, delta?)` | Convenience: restore + replay delta in one call            |

`DocumentSnapshot` includes `version`, `clientId`, `counter`, serialized nodes, skip-list structure, and `stateVector`. Pair it with a delta log of `Operation[]` for efficient persistence — same pattern as `@weavo/client`'s `initial` + `onOp` + `weavo.snapshot()`.

## Related packages

| Package            | Role                                                   |
| ------------------ | ------------------------------------------------------ |
| `@weavo/client`    | Browser textarea binding (recommended entry point)     |
| `@weavo/sync`      | State-vector sync and out-of-order operation buffering |
| `@weavo/transport` | WebSocket wire protocol                                |

## Development

```bash
# from packages/core
bun test
bun run build
```

## License

MIT
