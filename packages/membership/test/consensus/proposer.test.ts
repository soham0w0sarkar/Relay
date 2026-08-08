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
import { createBallot } from "../../src/consesous/Ballot";
import { createProposer } from "../../src/consesous/Proposer";
import type {
  MembershipMessage,
  PromiseMessage,
} from "../../src/consesous/types";
import {
  buildMembership,
  createMembershipStore,
} from "../../src/membershipStore";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as ClientId;

const collect = () => {
  const messages: MembershipMessage[] = [];
  return {
    messages,
    broadcast: (msg: MembershipMessage) => {
      messages.push(msg);
    },
  };
};

const ofType = <T extends MembershipMessage["type"]>(
  messages: MembershipMessage[],
  type: T,
) => messages.filter((m): m is Extract<MembershipMessage, { type: T }> => m.type === type);

beforeEach(() => {
  jest.useFakeTimers();
  spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Proposer", () => {
  test("batches join requests then broadcasts PREPARE", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: BOB });
    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: CAROL });
    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: BOB });

    expect(messages).toHaveLength(0);

    jest.advanceTimersByTime(199);
    expect(messages).toHaveLength(0);
    jest.advanceTimersByTime(1);

    expect(ofType(messages, "PREPARE")).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: "PREPARE",
      ballot: createBallot(0, ALICE),
      version: 1,
    });
  });

  test("onPromise waits for quorum before ACCEPT", () => {
    const store = createMembershipStore(
      buildMembership(0, [ALICE, BOB, CAROL]),
    );
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as ClientId });
    jest.advanceTimersByTime(200);

    const prepare = ofType(messages, "PREPARE")[0]!;
    messages.length = 0;

    const promise = (senderId: ClientId): PromiseMessage => ({
      type: "PROMISE",
      ballot: prepare.ballot,
      version: prepare.version,
      senderId,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });

    proposer.onPromise(promise(ALICE));
    expect(ofType(messages, "ACCEPT")).toHaveLength(0);

    proposer.onPromise(promise(BOB));
    expect(ofType(messages, "ACCEPT")).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "ACCEPT",
      version: 1,
      ballot: createBallot(0, ALICE),
    });
    expect(messages[0]?.type === "ACCEPT" && messages[0].membership.members.map((m) => m.clientId)).toEqual([
      ALICE,
      BOB,
      CAROL,
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ]);
  });

  test("onPromise ignores mismatched ballot or version", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: BOB });
    jest.advanceTimersByTime(200);
    messages.length = 0;

    proposer.onPromise({
      type: "PROMISE",
      ballot: createBallot(99, ALICE),
      version: 1,
      senderId: ALICE,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });
    proposer.onPromise({
      type: "PROMISE",
      ballot: createBallot(0, ALICE),
      version: 99,
      senderId: ALICE,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });
    proposer.onPromise({
      type: "PROMISE",
      ballot: createBallot(0, BOB),
      version: 1,
      senderId: ALICE,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });

    expect(messages).toHaveLength(0);
  });

  test("carry-forward uses membership from highest lastAcceptedBallot", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE, BOB]));
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: CAROL });
    jest.advanceTimersByTime(200);
    const prepare = ofType(messages, "PREPARE")[0]!;
    messages.length = 0;

    const proposedByUs = buildMembership(1, [ALICE, BOB, CAROL]);
    const earlierAccepted = buildMembership(1, [ALICE, BOB]);

    const carried = buildMembership(1, [ALICE, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as ClientId]);

    proposer.onPromise({
      type: "PROMISE",
      ballot: prepare.ballot,
      version: 1,
      senderId: ALICE,
      lastAcceptedBallot: createBallot(0, BOB),
      lastAcceptedMembership: earlierAccepted,
    });
    proposer.onPromise({
      type: "PROMISE",
      ballot: prepare.ballot,
      version: 1,
      senderId: BOB,
      lastAcceptedBallot: createBallot(1, CAROL),
      lastAcceptedMembership: carried,
    });

    const accept = ofType(messages, "ACCEPT")[0]!;
    expect(accept.membership).toEqual(carried);
    expect(accept.membership).not.toEqual(proposedByUs);
  });

  test("onAccepted commits after quorum and only once", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE, BOB]));
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: CAROL });
    jest.advanceTimersByTime(200);
    const prepare = ofType(messages, "PREPARE")[0]!;

    proposer.onPromise({
      type: "PROMISE",
      ballot: prepare.ballot,
      version: 1,
      senderId: ALICE,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });
    proposer.onPromise({
      type: "PROMISE",
      ballot: prepare.ballot,
      version: 1,
      senderId: BOB,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });

    const accept = ofType(messages, "ACCEPT")[0]!;
    messages.length = 0;

    proposer.onAccepted({
      type: "ACCEPTED",
      ballot: accept.ballot,
      version: 1,
      peerId: ALICE,
    });
    expect(ofType(messages, "COMMIT")).toHaveLength(0);

    proposer.onAccepted({
      type: "ACCEPTED",
      ballot: accept.ballot,
      version: 1,
      peerId: BOB,
    });
    expect(ofType(messages, "COMMIT")).toHaveLength(1);
    expect(ofType(messages, "JOIN_RESPONSE")).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "COMMIT",
      version: 1,
      membership: accept.membership,
    });
    expect(messages[1]).toMatchObject({
      type: "JOIN_RESPONSE",
      membership: accept.membership,
    });

    messages.length = 0;
    proposer.onAccepted({
      type: "ACCEPTED",
      ballot: accept.ballot,
      version: 1,
      peerId: ALICE,
    });
    expect(messages).toHaveLength(0);
  });

  test("cancel clears pending proposal so timers do nothing", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: BOB });
    proposer.cancel();
    jest.advanceTimersByTime(5000);
    expect(messages).toHaveLength(0);
  });

  test("retries PREPARE with a higher epoch after timeout", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: BOB });
    jest.advanceTimersByTime(200);
    expect(ofType(messages, "PREPARE")[0]?.ballot.epoch).toBe(0);

    jest.advanceTimersByTime(2000);
    const prepares = ofType(messages, "PREPARE");
    expect(prepares).toHaveLength(2);
    expect(prepares[1]?.ballot.epoch).toBe(1);
  });
});
