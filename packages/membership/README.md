<p align="center">
  <img src="https://raw.githubusercontent.com/soham0w0sarkar/Weavo/main/docs/assets/logo.png" width="140" alt="weavo" />
</p>

# @weavo/membership

CASPaxos-based membership, presence, liveness, and GC frontier for Weavo rooms.

## Install

```bash
npm install @weavo/membership
```

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
