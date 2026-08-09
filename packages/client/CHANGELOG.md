# @weavo/client

## 2.0.2

### Patch Changes

- Support IME composition: hold ops until `compositionend` and commit the final candidate once, so Chinese/Japanese/Korean input and emoji pickers sync correctly.
- Delete whole graphemes, words, and lines. Every delete now mirrors the span the browser removed from the textarea, so emoji, ZWJ sequences, Option/Ctrl+Backspace, and Cmd+Backspace no longer leave broken half-characters.
- Updated dependencies
  - @weavo/transport@2.0.2

## 2.0.1

### Patch Changes

- Replace leftover `workspace:*` dependency on `@weavo/membership` so the package installs from npm.

## 2.0.0

### Major Changes

- Ship CASPaxos membership with LWW presence and leave, and wire it through the client stack.
  - **@weavo/membership**: first release — join consensus, shortId tables, presence heartbeats, graceful `LEAVE`, and ungraceful removal after liveness timeout
  - **@weavo/client**: gate editing until join, encode ops against the membership table, expose peer presence, `disconnect()` leave, and live identity updates
  - **@weavo/transport**: binary message frames, shortId compression, membership codecs, and snapshot/delta persistence encoding
  - **@weavo/sync**: hold ops whose membership version has not arrived yet, then apply once the table lands
  - **@weavo/core**: snapshot and skip-list changes used by the persistence path

### Patch Changes

- Updated dependencies
  - @weavo/membership@1.0.0
  - @weavo/transport@2.0.0
  - @weavo/sync@2.0.0
  - @weavo/core@2.0.0

## 1.2.2

### Patch Changes

- fix:skiplist logic error of linear search
- Updated dependencies
  - @weavo/core@1.2.2

## 1.2.1

### Patch Changes

- updating tests
- Updated dependencies
  - @weavo/core@1.2.1
  - @weavo/sync@1.1.1
  - @weavo/transport@1.1.1

## 1.2.0

### Minor Changes

- Add snapshot and delta persistence for document state restoration. Introduce `takeSnapshot`, `restoreFromSnapshot`, and `weavo.snapshot()` APIs in @weavo/core and @weavo/client.

### Patch Changes

- Updated dependencies
  - @weavo/core@1.2.0

## 1.1.0

### Minor Changes

- tests

### Patch Changes

- Updated dependencies
  - @weavo/core@1.1.0
  - @weavo/sync@1.1.0
  - @weavo/transport@1.1.0

## 1.0.3

### Patch Changes

- Reconnect
- Updated dependencies
  - @weavo/transport@1.0.3
  - @weavo/core@1.0.3
  - @weavo/sync@1.0.3

## 1.0.2

### Patch Changes

- ad2c8ae: Add WebSocket auto-reconnect with send queue and tab wake-up. Update package READMEs, npm keywords, and client reconnection docs.
- Updated dependencies [ad2c8ae]
  - @weavo/core@1.0.2
  - @weavo/sync@1.0.2
  - @weavo/transport@1.0.2

## 1.0.0

### Major Changes

- b5cf20f: first release

### Patch Changes

- Updated dependencies [b5cf20f]
  - @weavo/transport@1.0.0
  - @weavo/core@1.0.0
  - @weavo/sync@1.0.0
