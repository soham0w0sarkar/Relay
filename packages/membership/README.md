<p align="center">
  <img src="https://raw.githubusercontent.com/soham0w0sarkar/Weavo/main/docs/assets/logo.png" width="140" alt="weavo" />
</p>

# @weavo/membership

CASPaxos-based membership, presence, failure detection, and GC for Weavo rooms.

Scaffold only — implementation coming next.

## Layout

```
src/
  consensus/           Ballot, Acceptor, Proposer, ProposalCoordinator
  membership/          Membership, Table, Store, ProposalBuilder
  failure/             FailureDetector (heartbeat / suspect / remove)
  presence/            PresenceCRDT (LWW)
  gc/                  GCFrontier, MembershipGC, TombstoneGC
  transport/           MembershipTransport
  MembershipManager.ts wires modules + public API
  index.ts             public exports
```

## Development

```bash
# from packages/membership
bun test
bun run build
```

## License

MIT
