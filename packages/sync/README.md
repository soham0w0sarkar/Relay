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
- **Membership waiting** — hold operations whose shortIds belong to a membership version this peer hasn't received yet

## Membership versions

A remote operation can arrive with client ids compressed against a membership version we don't have. `@weavo/transport` decodes those as unresolved ids rather than failing, so the operation is just another one with an unmet dependency: `canApply` returns `false`, `addToBuffer` parks it under that version, and `flushMembership` resolves and applies it once the table commits.

```ts
import { addToBuffer, canApply, flushMembership } from "@weavo/sync";

if (!canApply(doc, remoteOp)) addToBuffer(buffer, doc, remoteOp);

// after a membership message updates the store
for (const { op, index } of flushMembership(buffer, doc, membership)) {
  onApplied(op, index);
}
```

## API overview

| Export                                  | Description                                                   |
| --------------------------------------- | ------------------------------------------------------------- |
| `update(sv, operationId)`               | Advance a client's clock in a state vector                    |
| `missingOps(mine, theirs)`              | List operation IDs they haven't received                      |
| `addToBuffer(buffer, doc, op)`          | Queue an operation waiting on origins or a membership version |
| `flush(buffer, doc, op)`                | Apply operations unblocked by a newly applied operation       |
| `flushMembership(buffer, doc, members)` | Resolve and apply operations parked on a membership version   |
| `canApply(doc, op)`                     | Check whether an operation can be applied now                 |
| `resolveOperation(op, membership)`      | Swap unresolved shortIds for real client ids                  |
| `pendingMembershipVersion(op)`          | The membership version an operation still needs, if any       |

## Related packages

| Package             | Role                                         |
| ------------------- | -------------------------------------------- |
| `@weavo/core`       | Document replicas and CRDT operations        |
| `@weavo/membership` | Membership tables used to resolve shortIds   |
| `@weavo/transport`  | Sends sync requests/responses over WebSocket |
| `@weavo/client`     | End-to-end browser integration               |

## Development

```bash
# from packages/sync
bun test
bun run build
```

## License

MIT
