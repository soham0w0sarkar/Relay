export type ScenarioColumn = {
  id: string;
  name: string;
  role: string;
  kind?: "hub";
};

type StepBase = {
  clock: string;
  title: string;
  detail: string;
  tally?: string;
  set?: Record<string, string[]>;
  dim?: string[];
};

export type ScenarioStep = StepBase &
  (
    | {
        kind: "send";
        from: string[];
        to: string[];
        via?: string;
        wire: string;
        selfDeliver?: boolean;
        tone?: "warn";
      }
    | {
        kind: "note";
        on: string[];
        text: string;
        tone?: "warn";
      }
  );

export type Scenario = {
  caption: string;
  columns: ScenarioColumn[];
  steps: ScenarioStep[];
};

export const OP_SCENARIO: Scenario = {
  caption: 'One character from Alice\'s keyboard into two other replicas',
  columns: [
    { id: "alice", name: "Alice", role: "author · shortId 0" },
    { id: "relay", name: "Relay", role: "forwards bytes", kind: "hub" },
    { id: "bob", name: "Bob", role: "peer · has v2" },
    { id: "carol", name: "Carol", role: "peer · late joiner" },
  ],
  steps: [
    {
      kind: "note",
      clock: "0 ms",
      on: ["alice"],
      text: 'snapshot before {0, "notes"}',
      title: "Alice presses a key",
      detail:
        "The client captures caret and text before the browser mutates the field. Without that snapshot, the diff taken after the keystroke would be ambiguous.",
      set: {
        alice: ['doc "notes" · caret 0'],
        bob: ['doc "notes" · caret 5'],
        carol: ['doc "notes" · caret 2'],
      },
    },
    {
      kind: "note",
      clock: "1 ms",
      on: ["alice"],
      text: "diff → insert(A) ROOT ← n",
      title: "The diff becomes one operation",
      detail:
        "Old and new values are diffed into a single insert anchored between ROOT and the existing \"n\". Alice applies it to her own replica immediately, so typing never waits on the network.",
      set: {
        alice: ['doc "Anotes" · sv A:1'],
      },
    },
    {
      kind: "note",
      clock: "2 ms",
      on: ["alice"],
      text: "encode: UUID → shortId 0",
      title: "Encoded against membership v2",
      detail:
        "Transport looks Alice up in the committed v2 table and writes one byte of identity instead of her 16-byte UUID. The frame records the version it was encoded against.",
    },
    {
      kind: "send",
      clock: "3 ms",
      from: ["alice"],
      to: ["bob", "carol"],
      via: "relay",
      wire: "op · v2 · shortId 0",
      title: "One write becomes two deliveries",
      detail:
        "The relay never parses the payload — it has no idea whether this frame is an op, a heartbeat, or a ballot. It only knows which sockets belong to the room.",
    },
    {
      kind: "note",
      clock: "6 ms",
      on: ["bob"],
      text: "applied · caret 5 → 6",
      title: "Bob applies it and keeps his place",
      detail:
        "Bob has v2, so shortId 0 resolves to Alice and the operation's dependencies are already satisfied. His caret sat at 5; an insert before it shifts him to 6.",
      set: {
        bob: ['doc "Anotes" · sv A:1'],
      },
    },
    {
      kind: "note",
      clock: "6 ms",
      on: ["carol"],
      text: "unknown v2 → op parked",
      tone: "warn",
      title: "Carol has never seen v2",
      detail:
        "Carol joined before that commit, so shortId 0 resolves to nobody. Rather than guess, the op waits in the dependency buffer.",
      set: {
        carol: ["parked ops: 1"],
      },
    },
    {
      kind: "send",
      clock: "7 ms",
      from: ["carol"],
      to: ["alice"],
      via: "relay",
      wire: "MEMBERSHIP_REQUEST v2",
      tone: "warn",
      title: "She asks the room for the table",
      detail:
        "Any peer holding v2 can answer. Membership frames always carry full UUIDs, so they decode without needing a table first — otherwise this exchange would deadlock.",
    },
    {
      kind: "send",
      clock: "9 ms",
      from: ["alice"],
      to: ["carol"],
      via: "relay",
      wire: "MEMBERSHIP_RESPONSE v2",
      title: "Alice answers",
      detail:
        "The snapshot is the sorted member list. Carol derives the same shortIds from it that everyone else derived, because the ordering is deterministic.",
    },
    {
      kind: "note",
      clock: "12 ms",
      on: ["carol"],
      text: "buffer drains · caret 2 → 3",
      title: "The parked op lands",
      detail:
        "Same document, same convergence, a few milliseconds later. Carol's caret was at 2, so it becomes 3.",
      set: {
        carol: ['doc "Anotes" · sv A:1'],
      },
    },
  ],
};

export const MEMBERSHIP_SCENARIO: Scenario = {
  caption: "Bob joins a room of three — one full CASPaxos round",
  columns: [
    { id: "alice", name: "Alice", role: "proposer · rank 0" },
    { id: "relay", name: "Relay", role: "broadcast", kind: "hub" },
    { id: "bob", name: "Bob", role: "joiner" },
    { id: "carol", name: "Carol", role: "acceptor · rank 1" },
    { id: "dave", name: "Dave", role: "acceptor · rank 2" },
  ],
  steps: [
    {
      kind: "send",
      clock: "0 ms",
      from: ["bob"],
      to: ["alice", "carol", "dave"],
      via: "relay",
      wire: "JOIN_REQUEST Bob",
      title: "Bob asks to join",
      detail:
        "The request is a broadcast, so all three members see it. Bob has no shortId yet, so his frame still carries a full UUID.",
      set: {
        alice: ["v1 = {A, C, D} · quorum 2"],
        bob: ["joined: false"],
        carol: ["v1 · promised: none"],
        dave: ["v1 · promised: none"],
      },
    },
    {
      kind: "note",
      clock: "0 ms",
      on: ["alice", "dave"],
      text: "backoff — Alice 200 ms · Carol 700 ms · Dave 1200 ms",
      title: "Rank decides who proposes",
      detail:
        "All three members could propose, which would mean three competing ballots for one slot. Instead each waits rank × 500 ms plus jitter on top of the 200 ms batch window, so the lowest rank goes first and the rest usually never fire.",
      set: {
        alice: ["batched: [Bob]"],
      },
    },
    {
      kind: "send",
      clock: "212 ms",
      from: ["alice"],
      to: ["carol", "dave"],
      via: "relay",
      selfDeliver: true,
      wire: "PREPARE (epoch 0, Alice) · v2",
      title: "Alice broadcasts PREPARE",
      detail:
        "Note the loop back into Alice's own lifeline: she delivers the message to her local acceptor as well as the wire. She is one of the three votes, not an outside coordinator.",
      set: {
        alice: ["proposing v2 = {A,B,C,D}"],
      },
    },
    {
      kind: "send",
      clock: "214 ms",
      from: ["carol", "dave"],
      to: ["alice"],
      via: "relay",
      wire: "PROMISE (epoch 0, Alice)",
      tally: "3 promises · quorum 2",
      title: "Acceptors promise",
      detail:
        "An acceptor promises only if the ballot is at least as strong as the last one it promised, and it carries back any value it had already accepted for this slot. Nobody had accepted anything, so every promise comes back empty.",
      set: {
        alice: ["promises 3 / 2 ✓"],
        carol: ["promised e0/Alice"],
        dave: ["promised e0/Alice"],
      },
    },
    {
      kind: "send",
      clock: "216 ms",
      from: ["alice"],
      to: ["carol", "dave"],
      via: "relay",
      selfDeliver: true,
      wire: "ACCEPT v2 {A, B, C, D}",
      title: "Quorum reached, so ACCEPT goes out",
      detail:
        "Had any promise carried a previously accepted membership, Alice would be forced to propose that value instead of her own. None did, so her v2 stands.",
    },
    {
      kind: "send",
      clock: "218 ms",
      from: ["carol", "dave"],
      to: ["alice"],
      via: "relay",
      wire: "ACCEPTED v2",
      tally: "3 accepted · quorum 2",
      title: "Acceptors accept",
      detail:
        "Each acceptor records the value it accepted. That record is exactly what would be carried forward if this round died halfway and someone retried with a higher epoch.",
      set: {
        carol: ["accepted v2"],
        dave: ["accepted v2"],
      },
    },
    {
      kind: "send",
      clock: "220 ms",
      from: ["alice"],
      to: ["bob", "carol", "dave"],
      via: "relay",
      wire: "COMMIT v2 + JOIN_RESPONSE",
      title: "One table lands everywhere",
      detail:
        "Members are sorted, then indexed, so every peer derives identical shortIds from the same snapshot. Bob also gets a direct JOIN_RESPONSE in case he missed the broadcast.",
      set: {
        alice: ["v2 · A=0 B=1 C=2 D=3"],
        bob: ["joined ✓ · shortId 1"],
        carol: ["v2 · C=2"],
        dave: ["v2 · D=3"],
      },
    },
    {
      kind: "note",
      clock: "700 ms",
      on: ["carol", "dave"],
      text: "timers cancelled — slot decided",
      title: "The losing proposals never run",
      detail:
        "Carol's 700 ms timer and Dave's 1200 ms timer would have proposed the same join. COMMIT cancels in-flight proposals on every peer, so the room does not pay for a second round.",
    },
    {
      kind: "send",
      clock: "1.2 s",
      from: ["bob"],
      to: ["alice", "carol", "dave"],
      via: "relay",
      wire: "op · v2 · shortId 1",
      title: "Now Bob's edits compress",
      detail:
        "His first operation cites v2 and one byte of identity instead of a UUID. That saving, on every keystroke, is the reason membership consensus exists at all.",
    },
  ],
};

export const PRESENCE_SCENARIO: Scenario = {
  caption: "Carol's laptop sleeps — presence reacts in 10s, membership in 30s",
  columns: [
    { id: "alice", name: "Alice", role: "proposer · rank 0" },
    { id: "relay", name: "Relay", role: "broadcast", kind: "hub" },
    { id: "bob", name: "Bob", role: "acceptor" },
    { id: "carol", name: "Carol", role: "about to vanish" },
  ],
  steps: [
    {
      kind: "send",
      clock: "t = 0.0 s",
      from: ["alice"],
      to: ["bob", "carol"],
      via: "relay",
      wire: "HEARTBEAT ts 1000 · cursor 4",
      title: "Every joined peer beats",
      detail:
        "A heartbeat is not an operation. It carries the live caret, name, and color, with the sender's membership version and state vector riding along for free.",
      set: {
        alice: ["cursor 4 · Ada · teal"],
        bob: ["presence: A, C"],
        carol: ["presence: A, B"],
      },
    },
    {
      kind: "send",
      clock: "t = 0.9 s",
      from: ["carol"],
      to: ["alice", "bob"],
      via: "relay",
      wire: "HEARTBEAT ts 1900 · cursor 11",
      title: "Beats come back the other way",
      detail:
        "There is no server-side roster. Each peer builds its own picture of the room out of the beats it happens to receive.",
      set: {
        carol: ["cursor 11 · Cy · amber"],
        alice: ["carol lastSeen 1900"],
      },
    },
    {
      kind: "send",
      clock: "t = 1.1 s",
      from: ["carol"],
      to: ["alice"],
      via: "relay",
      wire: "HEARTBEAT ts 1400 (delayed)",
      tone: "warn",
      title: "Last write wins on the same key",
      detail:
        "An older beat for Carol arrives out of order. It is dropped rather than merged, because a stale cursor is worse than a slightly late one.",
      set: {
        alice: ["1400 < 1900 → ignored"],
      },
    },
    {
      kind: "note",
      clock: "t = 2.0 s",
      on: ["carol"],
      text: "lid closes · no LEAVE sent",
      tone: "warn",
      title: "Carol disappears without saying so",
      detail:
        "No LEAVE, no close frame — the socket just goes quiet. From the room's side this is indistinguishable from a network drop, which is why it is handled by timers rather than trust.",
      dim: ["carol"],
      set: {
        carol: ["no beats sent"],
      },
    },
    {
      kind: "note",
      clock: "t = 12.0 s",
      on: ["alice", "bob"],
      text: "presenceTimeout 10 s → cursor removed",
      title: "Her cursor vanishes first",
      detail:
        "Presence evicts Carol locally on both peers, so her chip and caret leave the UI. The membership table still lists her and still reserves her shortId.",
      dim: ["carol"],
      set: {
        alice: ["presence: carol dropped"],
        bob: ["presence: carol dropped"],
      },
    },
    {
      kind: "send",
      clock: "t = 32.0 s",
      from: ["alice"],
      to: ["bob"],
      via: "relay",
      selfDeliver: true,
      wire: "PREPARE remove(Carol) · v4",
      tally: "quorum 2 of {A, B}",
      title: "Only now does consensus start",
      detail:
        "Removing Carol repacks every shortId, so a brief hiccup must not be enough to trigger it. Quorum is sized by the post-removal set, so the peer being removed is not required to vote on its own exit.",
      dim: ["carol"],
      set: {
        alice: ["proposing v4 = {A, B}"],
      },
    },
    {
      kind: "send",
      clock: "t = 32.2 s",
      from: ["bob"],
      to: ["alice"],
      via: "relay",
      wire: "PROMISE → ACCEPTED",
      tally: "2 accepted · quorum 2",
      title: "Same spine as a join",
      detail:
        "Prepare, accept, commit. A leave is not a special case in the protocol — only in what triggers it.",
      dim: ["carol"],
      set: {
        bob: ["promised e0/Alice"],
      },
    },
    {
      kind: "send",
      clock: "t = 32.4 s",
      from: ["alice"],
      to: ["bob"],
      via: "relay",
      wire: "COMMIT v4 {A, B}",
      title: "The table repacks",
      detail:
        "Carol's slot is gone and the remaining ids are dense again. Operations still in flight against v3 continue to decode, because old versions stay in the store.",
      dim: ["carol"],
      set: {
        alice: ["v4 · A=0 B=1"],
        bob: ["v4 · A=0 B=1"],
      },
    },
    {
      kind: "send",
      clock: "t = 40.0 s",
      from: ["alice"],
      to: ["carol"],
      via: "relay",
      wire: "COMMIT v4 (on reconnect)",
      title: "Carol wakes into a room without her",
      detail:
        "She receives the current version and sees that she is not in it. There is no attempt to resurrect her old slot.",
      set: {
        carol: ["not in v4"],
      },
    },
    {
      kind: "send",
      clock: "t = 40.1 s",
      from: ["carol"],
      to: ["alice", "bob"],
      via: "relay",
      wire: "JOIN_REQUEST Carol",
      title: "So she starts over",
      detail:
        "She comes back as v5 with a fresh shortId. Anything she sent while considered dead is gone, which is the correct outcome — the room had already moved on without it.",
      set: {
        carol: ["rejoining → v5"],
      },
    },
    {
      kind: "note",
      clock: "—",
      on: ["alice"],
      text: "revive(Carol) · cancel proposal",
      title: "The branch that did not happen",
      detail:
        "Had a single heartbeat from Carol arrived before COMMIT, Alice would have revived her and dropped the in-flight removal. Liveness stays reversible right up until the commit lands.",
    },
  ],
};
