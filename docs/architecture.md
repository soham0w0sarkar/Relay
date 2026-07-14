# Weavo — Architecture & Design Notes

Weavo is evolving into a **collaboration SDK**. The textarea is the first adapter, not the product.

Roadmap:

- **v1** — Collaborative text editing
- **v2** — CRDT garbage collection
- **v3** — Higher-level collaborative primitives (shared objects, PromiseMirror, …)

---

## Package map

```
@weavo/core
    ├─ RGA-style CRDT (node store)
    ├─ Skip list (textarea index ↔ op id)
    ├─ Operations & replicas
    └─ Snapshots

@weavo/sync
    ├─ State vectors
    ├─ Missing-op discovery
    ├─ Dependency buffer
    └─ Map ↔ JSON wire helper for state vectors

@weavo/transport
    ├─ Message types (op / sync-request / sync-response)
    ├─ JSON over RawTransport
    └─ WebSocket implementation

@weavo/client
    ├─ Textarea adapter + selection transform
    └─ Orchestrates sync + transport

apps/weavo-server
    └─ Dumb relay — forwards frames, no protocol
```

Each package owns one concern. If a change forces you to rewrite two packages for one idea, the boundary is wrong.

---

## Philosophy: dumb relay

The relay forwards opaque messages. It does not:

- parse ops
- track ACKs
- suppress responses
- store document state

Correctness lives on clients. That makes Weavo portable to any broadcast-capable pipe (WebSocket room, WebRTC mesh, custom bus).

A smart server would simplify storm control and replay — and couple the protocol to that server. Weavo deliberately rejects that trade.

---

## Two structures in the document

A replica is not one data structure. It is two views of the same document:

| Structure | Owns | Fast at |
| --- | --- | --- |
| **Node store** | Causal CRDT order (`leftOrigin` / `rightOrigin`, tombstones) | Merge, equality of history |
| **Skip list** | Visible character positions | Map caret index ↔ op id |

`apply` always updates both:

1. insert/remove in the CRDT linked list
2. insert/remove the same id in the skip list at the derived index

The textarea only understands indices. The CRDT only understands operation ids. The skip list is the bridge.

---

## Why a skip list (not “just walk the list”)

Typing and remote edits need:

- “character at index *i*” → op id (local input)
- “op id just applied” → index (move the caret / splice the DOM value)

A plain walk of the CRDT list is **O(n)** per lookup. Continuous typing and remote concurrent edits would make that the hot path.

The skip list gives **expected O(log n)** index ↔ node mapping:

- height drawn geometrically (`P = 0.5`, max 32)
- **spans** at each level count how many base-level nodes a forward jump covers — Redis-style ranking, not a plain skip list
- insert at index *i* finds predecessors via span sums, then splices and adjusts spans
- remove walks predecessors that point at the target (including a careful “is between?” check for non-sorted id space)

Important nuance: the skip list is **not** ordered by operation id. It is ordered by **document position**. Op ids are only stored as `refCrdtKey` so we can jump from CRDT identity back to position.

Deletes tombstone the CRDT node but remove it from the skip list — visible length shrinks; history stays for concurrent inserts that still reference the deleted node as an origin.

---

## Why the CRDT looks like an RGA

Inserts carry:

```
id, value, leftOrigin, rightOrigin?
```

Effectively: “put this character between these two known characters.” Concurrent inserts with the same left origin are ordered by `compareOperationId` — clock first, then client UUID — so every replica gets the same sibling order without a central sequencer.

`ROOT` (`["ROOT", 0]`) is a local sentinel every replica materializes on `createReplica`. It is never synced as an op; first character ops use it as `leftOrigin`.

Deletes set `tombstone = true`. Physically removing from the CRDT list would break later concurrent ops that still cite that id as an origin.

---

## Sync: state vectors, buffer, anti-entropy

**State vector** — `Map<ClientId, clock>`: highest applied clock per peer. Diffing two vectors yields the exact op ids the other side still needs (`missingOps`).

**Dependency buffer** — ops can arrive before their left/right origins. They sit in `waiting` / `buffered` until `canApply`, then `flush` cascades newly unblocked children. Deletes wait on their target separately.

**Live path** — each local op broadcasts as `{ type: "op", op }` (JSON today). On open, a peer sends `{ type: "sync-request", vector, clientId }` to catch up.

---

## Sync-response suppression (the backoff)

Under broadcast, *N* peers joining can each emit a sync-request. If every peer with the missing ops answered immediately, you get an **O(N²)** response storm: same payload, many senders.

Weavo fixes that client-side (no smart relay):

1. Incoming sync-requests queue their `clientId`s.
2. The first one schedules a **single** timer; later requests while the timer is live only enqueue ids.
3. Delay is exponential with rate proportional to how much you have to send:

```
delay = -ln(U) / missingOps.length     // U ~ Uniform(0,1)
```

   Geometric waiting times: many missings ⇒ respond sooner (you are a useful source); zero missings ⇒ delay set to `2^31 - 1` (effectively “don't bother”).

4. When the winner fires, it sends **one** `sync-response` with `{ ops, clientIds: [...queued requesters] }`.
5. Losers see a response whose `clientIds` does **not** include them → they **cancel** their own pending timer. Requesters who are listed apply the ops.

Load tests live under `packages/client/test/responseSuppression.load.test.ts` — hundreds of peers, one batched response.

---

## Transport boundary

`@weavo/transport` is JSON today. `createTransport` is the only serialize/deserialize point. Core and sync never see strings.

That isolation matters: a future binary codec (compact client ints, varints, tagged ops) swaps here without touching `apply` or the skip list. In-memory structures stay objects because typing does Map lookups and pointer walks constantly — decoding blobs on every keystroke would be the wrong place to save bytes.

---

## Broadcast makes membership deeper than “compression”

The room is broadcast-only: there is no private `A → B`. Every frame is decoded by everyone.

If the wire ever says `client = 5`, every receiver must already agree `5 → uuid`. That shared dictionary is not a CRDT concern (eventual merge). It is a **membership / dictionary** concern (immediate decode correctness).

Compression was the first feature that surfaces this. Presence, GC frontiers (“everyone still online is past clock X”), and future shared objects all need the same abstraction: **who is in the room**.

Membership is therefore the next protocol layer — above transport, beside sync — not a relay feature.

---

## Key design question

For every new idea: **whose package?**

| Idea | Home |
| --- | --- |
| Concurrent insert order | `@weavo/core` |
| “I have clocks you don't” | `@weavo/sync` |
| Wire shape / codecs | `@weavo/transport` |
| Who is here / fail / GC frontier | membership (future package) |
| Forward bytes | relay |
| DOM textarea + selection | `@weavo/client` |

---

## Open questions

- Membership protocol under broadcast (join / leave / catch-up for missed commits)
- Safe UUID → compact int transition once membership is authoritative
- Presence vs failure-detector heartbeat overlap
- Tombstone / history GC once a frontier is collectively known
- Binary wire codec at the transport boundary
- Late joiner recovery without a smart server
