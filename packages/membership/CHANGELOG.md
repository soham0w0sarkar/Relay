# @weavo/membership

## 1.0.0

### Major Changes

- Ship CASPaxos membership with LWW presence and leave, and wire it through the client stack.
  - **@weavo/membership**: first release — join consensus, shortId tables, presence heartbeats, graceful `LEAVE`, and ungraceful removal after liveness timeout
  - **@weavo/client**: gate editing until join, encode ops against the membership table, expose peer presence, `disconnect()` leave, and live identity updates
  - **@weavo/transport**: binary message frames, shortId compression, membership codecs, and snapshot/delta persistence encoding
  - **@weavo/sync**: hold ops whose membership version has not arrived yet, then apply once the table lands
  - **@weavo/core**: snapshot and skip-list changes used by the persistence path

### Patch Changes

- Updated dependencies
  - @weavo/core@2.0.0
