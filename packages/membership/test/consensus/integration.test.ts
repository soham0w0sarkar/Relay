import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  spyOn,
  test,
} from "bun:test";
import type { ClientId } from "@weavo/core";
import { createAcceptor } from "../../src/consesous/Acceptor";
import { createBallot } from "../../src/consesous/Ballot";
import { createProposer } from "../../src/consesous/Proposer";
import type { MembershipMessage } from "../../src/consesous/types";
import {
  buildMembership,
  createMembershipStore,
  get,
} from "../../src/membershipStore";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as ClientId;
const DAVE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as ClientId;

type Peer = {
  id: ClientId;
  store: ReturnType<typeof createMembershipStore>;
  proposer: ReturnType<typeof createProposer>;
  acceptor: ReturnType<typeof createAcceptor>;
};

const wireRoom = (ids: ClientId[]) => {
  const inbox = new Map<ClientId, MembershipMessage[]>();
  for (const id of ids) inbox.set(id, []);

  const peers: Peer[] = ids.map((id) => {
    const store = createMembershipStore(buildMembership(0, ids));
    const broadcast = (msg: MembershipMessage) => {
      for (const peerId of ids) inbox.get(peerId)!.push(msg);
    };
    return {
      id,
      store,
      proposer: createProposer(store, broadcast, id),
      acceptor: createAcceptor(store, broadcast, id),
    };
  });

  const deliver = () => {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const peer of peers) {
        const queue = inbox.get(peer.id)!;
        while (queue.length > 0) {
          progressed = true;
          const msg = queue.shift()!;
          switch (msg.type) {
            case "JOIN_REQUEST":
              peer.proposer.onJoinRequest(msg);
              break;
            case "PREPARE":
              peer.acceptor.onPrepare(msg);
              break;
            case "PROMISE":
              peer.proposer.onPromise(msg);
              break;
            case "ACCEPT":
              peer.acceptor.onAccept(msg);
              break;
            case "ACCEPTED":
              peer.proposer.onAccepted(msg);
              break;
            case "COMMIT":
              peer.acceptor.onCommit(msg);
              peer.proposer.cancel();
              break;
            default:
              break;
          }
        }
      }
    }
  };

  return { peers, deliver, inbox };
};

beforeEach(() => {
  jest.useFakeTimers();
  spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("consensus integration", () => {
  test("solo peer joins a member through full PREPARE→COMMIT", () => {
    const { peers, inbox, deliver } = wireRoom([ALICE]);
    const [alice] = peers;

    inbox.get(ALICE)!.push({ type: "JOIN_REQUEST", clientId: BOB });
    deliver();

    jest.advanceTimersByTime(200);
    deliver();

    expect(alice.store.currentVersion).toBe(1);
    expect(get(alice.store, 1)?.members.map((m) => m.clientId)).toEqual([
      ALICE,
      BOB,
    ]);
  });

  test("three peers agree on a batched join", () => {
    const { peers, inbox, deliver } = wireRoom([ALICE, BOB, CAROL]);

    for (const id of [ALICE, BOB, CAROL]) {
      inbox.get(id)!.push({ type: "JOIN_REQUEST", clientId: DAVE });
    }
    deliver();

    // Alice (rank 0) proposes first; COMMIT cancels other proposers
    jest.advanceTimersByTime(200);
    deliver();

    for (const peer of peers) {
      expect(peer.store.currentVersion).toBe(1);
      expect(get(peer.store, 1)?.members.map((m) => m.clientId)).toEqual([
        ALICE,
        BOB,
        CAROL,
        DAVE,
      ]);
    }
  });

  test("carry-forward commits previously accepted membership on retry", () => {
    const accepted = buildMembership(1, [ALICE, BOB, CAROL]);
    const conflicting = buildMembership(1, [ALICE, BOB, DAVE]);

    const store = createMembershipStore(buildMembership(0, [ALICE, BOB]));
    const out: MembershipMessage[] = [];
    const proposer = createProposer(store, (m) => out.push(m), ALICE);

    // Simulate mid-protocol: proposal already in flight for conflicting value
    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: DAVE });
    jest.advanceTimersByTime(200);
    expect(out[0]?.type).toBe("PREPARE");
    const ballot = createBallot(0, ALICE);
    out.length = 0;

    // Quorum promises: one carries the earlier accepted (CAROL) membership
    // with a stronger prior ballot than any other.
    proposer.onPromise({
      type: "PROMISE",
      ballot,
      version: 1,
      senderId: ALICE,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });
    proposer.onPromise({
      type: "PROMISE",
      ballot,
      version: 1,
      senderId: BOB,
      lastAcceptedBallot: createBallot(0, BOB),
      lastAcceptedMembership: accepted,
    });

    const accept = out.find((m) => m.type === "ACCEPT");
    expect(accept?.type === "ACCEPT" && accept.membership).toEqual(accepted);
    expect(accept?.type === "ACCEPT" && accept.membership).not.toEqual(
      conflicting,
    );
  });
});
