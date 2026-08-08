<p align="center">
  <img src="https://raw.githubusercontent.com/soham0w0sarkar/Weavo/main/docs/assets/logo.png" width="140" alt="weavo" />
</p>

# @weavo/membership

CASPaxos-based membership, presence, liveness, and GC frontier for Weavo rooms.

## Install

```bash
npm install @weavo/membership
```

## What it owns

- **Membership** — versioned UUID → `shortId` tables committed with prepare / accept / commit
- **Presence** — LWW map of live peers (`cursor`, `name`, `color`) updated from `HEARTBEAT`s
- **Heartbeats** — ~2s broadcast after join; carries presence plus piggybacked `membershipVersion` and state vector
- **Liveness** — silent peers become suspect (~10s, presence dropped) then proposed for removal (~30s)
- **Leave** — graceful `LEAVE` or ungraceful timeout → `removeMember` via the same consensus spine as join

```ts
import { createMembership } from "@weavo/membership";

const membership = createMembership(send, {
  clientId,
  getPresence: () => ({ cursor, name, color }),
  getStateVector: () => Object.fromEntries(sv),
});

membership.onPresence((peers) => {
  // Map<ClientId, { clientId, cursor, name, color }>
});

// Graceful exit — peers remove you via CASPaxos
membership.leave();
```

Pass `heartbeatIntervalMs: 0` to disable the timer (tests). Tune `presenceTimeoutMs` / `removalTimeoutMs` for suspect vs remove thresholds.

## Development

```bash
# from packages/membership
bun test
bun run build
```

## Related packages

| Package            | Role                         |
| ------------------ | ---------------------------- |
| `@weavo/core`      | CRDT operations and replicas |
| `@weavo/sync`      | State-vector synchronization |
| `@weavo/transport` | Wire transport               |
| `@weavo/client`    | Browser client               |

## License

MIT
