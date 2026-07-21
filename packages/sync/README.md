<p align="center">
  <img src="https://raw.githubusercontent.com/soham0w0sarkar/Weavo/main/docs/assets/logo.png" width="140" alt="weavo" />
</p>

# @weavo/sync

State-vector synchronization and out-of-order operation buffering for Weavo CRDT replicas. Tracks what each peer has seen and replays missing operations in dependency order.

Installed automatically with [`@weavo/client`](https://www.npmjs.com/package/@weavo/client). Use this package directly when building custom sync servers or non-browser clients.

## Install

```bash
npm install @weavo/sync
```

## Quick start

```ts
import { update, missingOps, addToBuffer, flush } from "@weavo/sync";
import type { StateVector } from "@weavo/sync";

const sv: StateVector = new Map();

// record that we've applied an operation
update(sv, op.id);

// find ops a peer is missing
const missing = missingOps(mySv, theirSv);

// buffer out-of-order ops, then flush when dependencies arrive
addToBuffer(doc, remoteOp);
const applied = flush(doc);
```

## What it provides

- **State vectors** — per-client logical clocks for incremental sync
- **`missingOps`** — compute which operation IDs a peer still needs
- **Operation buffer** — hold inserts until left/right origins exist, then `flush`

## API overview

| Export | Description |
| --- | --- |
| `update(sv, operationId)` | Advance a client's clock in a state vector |
| `missingOps(mine, theirs)` | List operation IDs they haven't received |
| `addToBuffer(doc, op)` | Queue an out-of-order operation |
| `flush(doc)` | Apply all operations whose dependencies are satisfied |
| `canApply(doc, op)` | Check whether an operation can be applied now |

## Related packages

| Package | Role |
| --- | --- |
| `@weavo/core` | Document replicas and CRDT operations |
| `@weavo/transport` | Sends sync requests/responses over WebSocket |
| `@weavo/client` | End-to-end browser integration |

## Development

```bash
# from packages/sync
bun test
bun run build
```

## License

MIT
