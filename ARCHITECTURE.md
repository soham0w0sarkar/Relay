# Weavo — Architecture & Design Notes

Internal notes. Written as we figured things out, not as a product pitch.

Weavo started as “make a textarea collaborative.” It kept refusing to stay that small. The textarea is still the first adapter — but underneath it we’ve been stacking pieces that only make sense once you’ve hit the previous wall.

Rough roadmap (more “what the last problem forced” than a product plan):

- **v1** — Collaborative text editing
- **v2** — CRDT garbage collection (once we can trust who’s still alive)
- **v3** — Higher-level collaborative primitives (shared objects, PromiseMirror, …)

---

## Package map

```
@weavo/core
    ├─ YATA-style CRDT (node store)
    ├─ Skip list (textarea index ↔ op id)
    ├─ Operations & replicas
    └─ Snapshots

@weavo/sync
    ├─ State vectors
    ├─ Missing-op discovery
    ├─ Dependency buffer
    └─ State-vector operations

@weavo/transport
    ├─ Message types (op / sync / membership wire union)
    ├─ Versioned binary frames (`WIRE_VERSION = 3`)
    ├─ shortId / UUID id codec (sync path)
    ├─ Binary membership subtype codec (UUID ids)
    ├─ Snapshot / delta persistence codec (UUID-stable)
    └─ WebSocket implementation

@weavo/membership
    ├─ Membership table + versioned store (UUID ↔ shortId)
    ├─ CASPaxos-style consensus (proposer / acceptor)
    ├─ JOIN_REQUEST → COMMIT → JOIN_RESPONSE join gate
    ├─ Presence & liveness (next)
    └─ GC frontier (after that)

@weavo/client
    ├─ Textarea adapter + selection transform
    ├─ Membership join before ops / sync-request
    ├─ IdCodec wired from membership into transport
    └─ Orchestrates sync + transport + membership

apps/weavo-server
    └─ Dumb relay — forwards frames, no protocol
```

Rule we keep coming back to: each package owns one concern. If a change wants two packages rewritten for one idea, we drew the line wrong.

---

## First decision that wouldn’t die: dumb relay

We could have put brains in the server. Track ACKs, suppress storms, own the member list, store the doc. It would have been easier _once_.

Instead the relay only forwards opaque messages. No parsing ops, no document state, no membership. Correctness lives on the clients.

That sounds stubborn until you try porting the same protocol to WebRTC mesh or some random bus and realize you don’t have to rewrite the interesting parts. The cost is real though — every problem below is a problem because the server won’t help.

---

## The document is two structures (and it has to be)

Early on it felt like one CRDT list should be enough. Then we tried driving a textarea from it.

The textarea thinks in character indices. The CRDT thinks in operation ids (`leftOrigin` / `rightOrigin`). Mapping one to the other by walking the list is **O(n)** per lookup, and typing _is_ continuous lookups. That path melts.

So a replica is two views of the same document:

| Structure      | Owns                                                         | Fast at                    |
| -------------- | ------------------------------------------------------------ | -------------------------- |
| **Node store** | Causal CRDT order (`leftOrigin` / `rightOrigin`, tombstones) | Merge, equality of history |
| **Skip list**  | Visible character positions                                  | Map caret index ↔ op id    |

Every `apply` updates both: splice the CRDT linked list, then splice the same id into the skip list at the derived index. The skip list is the bridge. Without it the UI fights the CRDT on every keystroke.

---

## Skip list details (the part that actually works)

We needed:

- index → op id (local typing)
- op id → index (remote apply, move caret, splice the DOM value)

Expected **O(log n)** both ways, with **spans** at each level counting how many base nodes a forward jump covers — Redis-style ranking, not a textbook skip list that only searches by key.

Other quirks we had to get right:

- height drawn geometrically (`P = 0.5`, max 32)
- ordered by **document position**, not operation id — ids live in `refCrdtKey` so we can jump back
- deletes tombstone the CRDT node but _remove_ it from the skip list (visible length shrinks; history stays for concurrent inserts still pointing at that origin)

---

## CRDT shape: RGA-ish, on purpose

Inserts look like:

```
id, value, leftOrigin, rightOrigin?
```

“Put this character between these two known characters.” Concurrent inserts with the same left origin order by `compareOperationId` — clock first, then client UUID — so every replica lands on the same sibling order without a sequencer.

`ROOT` (`["ROOT", 0]`) is a local sentinel from `createReplica`. Never synced. First character ops hang off it as `leftOrigin`.

Deletes set `tombstone = true`. Physically yanking the node out of the CRDT list breaks later concurrent ops that still cite that id. So history sticks around until something can prove it’s safe to drop — which is a later chapter.

---

## Sync: state vectors, then the buffer, then the storm

Once ops flow, peers need catch-up. State vectors (`Map<ClientId, clock>`) fell out naturally: diff two vectors, you know exactly which op ids the other side is missing.

Then ops started arriving before their origins. Dependency buffer: park them in `waiting` / `buffered` until `canApply`, then `flush` cascades. Deletes wait on their target separately. Suddenly live sync stopped randomly wedging.

Live path today: broadcast `{ type: "op", op }` as a binary frame. On open, send `{ type: "sync-request", vector, clientId }`.

That last part looked fine with two peers. With _N_ peers joining at once, every peer with the missing ops answered, and we got an **O(N²)** response storm — same payload, many senders. The relay can’t suppress it (dumb on purpose). So we fixed it on the client:

1. Queue incoming sync-request `clientId`s.
2. First one arms a single timer; later ones only enqueue.
3. Delay proportional to how useful you are:

```
delay = -ln(U) / missingOps.length     // U ~ Uniform(0,1)
```

Lots of missing ops → you answer sooner. Nothing useful → delay ≈ forever.

4. Winner sends one `sync-response` with `{ ops, clientIds: [...queued] }`.
5. Losers see a response that doesn’t list them → cancel their timer. Listed requesters apply the ops.

There’s a load test under `packages/client/test/responseSuppression.load.test.ts` with hundreds of peers and one batched response. Same instinct shows up again in membership jitter: prefer math over a coordinator.

Suppression fixed _who_ answers. It didn’t shrink _what_ they send. A late joiner still gets one `sync-response` packed with every missing op — and without short ids that payload is where UUID bloat stops being ambient keystroke tax and turns into a single heavy catch-up frame.

---

## Transport boundary

`@weavo/transport` is the only serialize/deserialize point. Core and sync stay on typed objects — typing is Map lookups and pointer walks, constantly. Frames are versioned binary (`WIRE_VERSION = 3`).

| Path                                         | Encoding                                                      | Client ids                                                                     |
| -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `op` / `sync-request` / `sync-response`      | Binary + membership version on the frame                      | `shortId` when the joined table knows them; else 16-byte UUID                  |
| Membership (`JOIN_*`, `PREPARE`…`COMMIT`, …) | Binary subtype tags under `MSG_MEMBERSHIP`                    | Always full UUID — these frames _build_ the shortId table                      |
| Persistence (snapshot + delta)               | Binary (`PERSIST_VERSION`), optional base64 for string stores | Always full UUID — shortIds are membership-version-local and must not hit disk |

Decode never fails on a membership version we don't have. A shortId we can't map stays in the operation as `~<version>:<shortId>` and `requestMembership(version)` goes out. Resolution is the applier's job, not the codec's: `canApply` refuses any op still carrying one, `addToBuffer` parks it in `waiting` under that version, and when the table lands `flushMembership` swaps the shortIds for real client ids and applies whatever unblocks.

Outbound membership messages are applied locally _before_ broadcast so a joiner’s immediate `sync-request` can decode against the version the sender just committed.

---

## Then we looked at the wire and saw UUIDs everywhere

Here’s where membership actually came from.

An op id is `(clientId, clock)`. `clientId` is a UUID. Every insert on the wire carries that id _and_ `leftOrigin` / `rightOrigin` — more `(clientId, clock)` pairs. Character-at-a-time editing means you’re shipping those UUIDs constantly, and under broadcast every peer pays for every frame.

### How bad is it, roughly

Before binary framing, a typical single-character JSON insert frame landed around **~170 bytes**. Of that, **~70+ characters were just UUID text** — often ~40% of the frame — before counting quotes, commas, and field names. A concurrent insert with three distinct ids (`id`, `leftOrigin`, `rightOrigin`) pushed past **~210 bytes**, with **three** 36-char UUIDs (~50% of the payload). One `(uuid, clock)` pair alone serialized to ~43 JSON characters; the same pair with a small integer client id was ~6.

That’s for _one keystroke from one peer_. Typing is continuous:

| Pace        | Chars / sec | UUID-form send (1 peer) | Same traffic, 5-peer room\*            |
| ----------- | ----------- | ----------------------- | -------------------------------------- |
| Casual      | ~4          | ~40 KB / min            | ~200 KB / min received across the room |
| Fast typing | ~8          | ~80 KB / min            | ~400 KB / min                          |
| Burst       | ~12         | ~125 KB / min           | ~600 KB / min                          |

\*Broadcast: each frame is copied to everyone. Five peers don’t send 5× if only one is typing — but every listener still _receives_ the full fat op. Two people typing at once doubles the send side.

The binary codec removes JSON field-name overhead and, once a peer is joined, swaps known client UUIDs for 1–2 byte `shortId`s against the frame’s membership version. Unmapped clients (and pre-join traffic) still fall back to full UUIDs.

### Sync-response is where you _feel_ it

Live ops dribble. A `sync-response` dumps history in one shot — every missing insert still carrying those UUIDs. Historical JSON sizes for a catch-up packed with single-character inserts (3 requester ids on the envelope; the ops are the bulk):

| Missing ops | What that is roughly              | UUID-form response | shortId-form response | You don’t send |
| ----------- | --------------------------------- | ------------------ | --------------------- | -------------- |
| 200         | short paragraph of catch-up       | ~31 KB             | ~18 KB                | ~13 KB         |
| 1 000       | ~3 min at casual pace             | ~153 KB            | ~88 KB                | ~65 KB         |
| 3 000       | ~10 min at ~5 chars/s             | ~464 KB            | ~268 KB               | ~196 KB        |
| 10 000      | long session / multi-peer backlog | ~1.5 MB            | ~0.9 MB               | ~0.65 MB       |

Same ~40% cut as the live path, but applied to a frame that has to parse, allocate, and apply in a burst. Unbloated catch-up feels like “document appears”; bloated catch-up feels like the tab hitching while you decode hundreds of kilobytes of repeated UUID strings you already could have named `2`. And because the response is still broadcast, every peer in the room receives that brick even if only the late joiner needed it — which is exactly why suppression mattered, and why shortId compression on the sync path mattered next.

So the next move felt obvious: stop putting full UUIDs on the hot path. Give each peer in the room a small integer (`shortId`), encode against that, done.

Except the table has to be **identical** on every peer. If A thinks `shortId = 3` is Alice and B thinks it’s Bob, ops decode as the wrong replica and the CRDT quietly diverges. You can’t derive short ids locally and hope. You need a shared, versioned membership:

1. Collect the client UUIDs in the room.
2. Sort them (same order everywhere).
3. Assign `shortId = index`.
4. Bump a membership `version` on every join/leave.
5. Encode ops against a specific version so decode knows which table to use.

On one machine that’s a sorted array. On a broadcast mesh with no membership server, peers disagree about who joined, who left, and in what order — and any disagreement on the set is disagreement on short ids. That’s the wall. `@weavo/membership` is the attempt to climb it: consensus on the next membership snapshot _before_ anyone compresses against it.

Presence, failure detection, GC frontiers — they all want “who’s in the room” too. Those showed up after. The thing that forced the package was UUID weight on every op.

---

## Membership shape

A membership is an immutable snapshot: sorted UUIDs → deterministic `shortId`s (`0 .. n-1`), plus a monotonic `version`. Older versions stick around in a store so in-flight ops encoded against them can still decode while the room moves forward.

Joins/leaves don’t patch the live set. They propose the _next_ snapshot and commit it. Until commit, keep encoding with the previous version — full UUIDs still work, they’re just fat.

---

## Consensus we can run over the same pipe

Classic Paxos wants unicast and often a leader. We have broadcast and a dumb relay. So we run a CASPaxos-shaped flow on the same pipe everything else already uses:

| Phase   | Messages              | Role                                                      |
| ------- | --------------------- | --------------------------------------------------------- |
| Prepare | `PREPARE` → `PROMISE` | Win promises; carry forward any previously accepted value |
| Accept  | `ACCEPT` → `ACCEPTED` | Quorum accepts the (possibly carried) membership          |
| Commit  | `COMMIT`              | Install the version; clear acceptor ballot state          |

**Proposer** — `JOIN_REQUEST` lands, batch late joiners for a short window, wait rank × delay + jitter (lower rank goes first so we don’t all propose at once), then:

1. bump epoch, broadcast `PREPARE`
2. collect `PROMISE` to quorum
3. carry-forward: if anyone already accepted a value for this slot, take the membership from the highest accepted ballot — don’t invent a conflicting one
4. one `ACCEPT` (`acceptSent` so retries don’t double-fire)
5. collect `ACCEPTED` to quorum → `COMMIT`, then proposer-only `JOIN_RESPONSE`
6. prepare timeout → retry with a higher epoch; `cancel()` wipes in-flight state

**Acceptor** — promise if the ballot is ≥ what you promised; same bar on accept; reply `ACCEPTED`; on `COMMIT`, write the store and clear ballot maps.

Ballots are `(epoch, proposerId)`. Total order, no sequencer.

`@weavo/client` waits on that join path: `JOIN_REQUEST` on open, ops and the first `sync-request` only after `isJoined` (via `COMMIT` / `JOIN_RESPONSE`, or solo founding after `foundingGraceMs`). After join, transport encodes ops/sync against the current membership version with `shortId`s; receivers look up historical tables by the version on the frame (and `requestMembership` if a version is missing).

---

## Presence is not membership

Presence is ephemeral: who is here right now, where their cursor is, what they call themselves. It is a last-write-wins map keyed by `clientId`. Every joined peer broadcasts a `HEARTBEAT` about every 2s carrying `{ cursor, name, color }`, plus piggybacked `membershipVersion` and `sv`. Receivers keep the entry with the higher timestamp. Miss ~10s of heartbeats and the peer drops out of the local presence map.

Wrong presence for a beat is a flicker. Wrong membership is a permanently corrupted document. Different stakes, different tools — LWW eventual consistency here, CASPaxos on the member set.

`weavo.onPresence` exposes `Map<clientId, { cursor, name, color }>`. Leave/remove proposals after a longer silence still sit on the open membership spine.

---

## Key design question

For every new idea: **whose package?**

| Idea                                | Home                |
| ----------------------------------- | ------------------- |
| Concurrent insert order             | `@weavo/core`       |
| “I have clocks you don't”           | `@weavo/sync`       |
| Wire + persistence serialization    | `@weavo/transport`  |
| Member set / shortId table / commit | `@weavo/membership` |
| Presence / liveness heartbeats      | `@weavo/membership` |
| Forward bytes                       | relay               |
| DOM textarea + selection            | `@weavo/client`     |

---

## Still open

- ~~Membership shortId table + lookups (`shortIdOf` / `clientIdOf`)~~
- ~~Join gate in `@weavo/client` (`JOIN_REQUEST` → `JOIN_RESPONSE` / founding, ops+sync after `isJoined`)~~
- ~~Flip the wire from UUID → shortId, and how membership version rides on each op~~
- ~~Binary membership frames (UUID ids; no shortId on the consensus path)~~
- ~~Binary snapshot / delta persistence codec (UUID-stable)~~
- ~~Late joiners who missed a `COMMIT` (ops wait in the buffer until their membership version arrives)~~
- Leave / remove on the same prepare → accept → commit spine
- ~~Heartbeats for presence / failure detection once the set is stable~~
- Tombstone GC once we can compute a frontier over live members (sv already rides on heartbeats)

Each of those is probably another “oh, now we need…” — same pattern as how we got here.
