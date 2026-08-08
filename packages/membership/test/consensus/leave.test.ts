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
import type { MembershipMessage } from "../../src/consesous/types";
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
) =>
  messages.filter(
    (m): m is Extract<MembershipMessage, { type: T }> => m.type === type,
  );

beforeEach(() => {
  jest.useFakeTimers();
  spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Proposer leave", () => {
  test("batches leave requests then proposes a removal", () => {
    const store = createMembershipStore(
      buildMembership(0, [ALICE, BOB, CAROL]),
    );
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onLeaveRequest({ type: "LEAVE", clientId: BOB });
    jest.advanceTimersByTime(200);

    expect(ofType(messages, "PREPARE")).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: "PREPARE",
      ballot: createBallot(0, ALICE),
      version: 1,
    });

    const prepare = ofType(messages, "PREPARE")[0]!;
    messages.length = 0;

    proposer.onPromise({
      type: "PROMISE",
      ballot: prepare.ballot,
      version: prepare.version,
      senderId: ALICE,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });

    expect(ofType(messages, "ACCEPT")).toHaveLength(0);

    proposer.onPromise({
      type: "PROMISE",
      ballot: prepare.ballot,
      version: prepare.version,
      senderId: CAROL,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });

    const accept = ofType(messages, "ACCEPT")[0]!;
    expect(accept.membership.members.map((m) => m.clientId)).toEqual([
      ALICE,
      CAROL,
    ]);
  });

  test("revive cancels an in-flight removal before COMMIT", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE, BOB]));
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onLeaveRequest({ type: "LEAVE", clientId: BOB });
    jest.advanceTimersByTime(200);
    expect(ofType(messages, "PREPARE")).toHaveLength(1);

    expect(proposer.revive(BOB)).toBe(true);
    messages.length = 0;

    jest.advanceTimersByTime(5_000);
    expect(ofType(messages, "ACCEPT")).toHaveLength(0);
    expect(ofType(messages, "COMMIT")).toHaveLength(0);
  });

  test("two-node leave can commit with quorum 1", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE, BOB]));
    const { messages, broadcast } = collect();
    const proposer = createProposer(store, broadcast, ALICE);

    proposer.onLeaveRequest({ type: "LEAVE", clientId: BOB });
    jest.advanceTimersByTime(200);

    const prepare = ofType(messages, "PREPARE")[0]!;
    messages.length = 0;

    proposer.onPromise({
      type: "PROMISE",
      ballot: prepare.ballot,
      version: prepare.version,
      senderId: ALICE,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });

    const accept = ofType(messages, "ACCEPT")[0]!;
    expect(accept.membership.members.map((m) => m.clientId)).toEqual([ALICE]);
    messages.length = 0;

    proposer.onAccepted({
      type: "ACCEPTED",
      ballot: accept.ballot,
      version: accept.version,
      peerId: ALICE,
    });

    expect(ofType(messages, "COMMIT")[0]?.membership.members.map((m) => m.clientId)).toEqual(
      [ALICE],
    );
  });
});
