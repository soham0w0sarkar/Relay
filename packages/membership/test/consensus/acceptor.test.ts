import { describe, expect, test } from "bun:test";
import type { ClientId } from "@weavo/core";
import { createAcceptor } from "../../src/consesous/Acceptor";
import { createBallot } from "../../src/consesous/Ballot";
import type { MembershipMessage } from "../../src/consesous/types";
import {
  buildMembership,
  createMembershipStore,
  get,
} from "../../src/membershipStore";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;

const collect = () => {
  const messages: MembershipMessage[] = [];
  return {
    messages,
    broadcast: (msg: MembershipMessage) => {
      messages.push(msg);
    },
  };
};

describe("Acceptor", () => {
  test("onPrepare promises when ballot is at least as strong as promised", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const acceptor = createAcceptor(store, broadcast, ALICE);

    acceptor.onPrepare({
      type: "PREPARE",
      ballot: createBallot(0, BOB),
      version: 1,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "PROMISE",
      ballot: createBallot(0, BOB),
      version: 1,
      senderId: ALICE,
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });
  });

  test("onPrepare ignores a weaker ballot for the same version", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const acceptor = createAcceptor(store, broadcast, ALICE);

    acceptor.onPrepare({
      type: "PREPARE",
      ballot: createBallot(2, ALICE),
      version: 1,
    });
    acceptor.onPrepare({
      type: "PREPARE",
      ballot: createBallot(1, ALICE),
      version: 1,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ ballot: createBallot(2, ALICE) });
  });

  test("onPrepare for a new version is independent of another slot", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const acceptor = createAcceptor(store, broadcast, ALICE);

    acceptor.onPrepare({
      type: "PREPARE",
      ballot: createBallot(5, ALICE),
      version: 1,
    });
    acceptor.onPrepare({
      type: "PREPARE",
      ballot: createBallot(0, BOB),
      version: 2,
    });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ version: 2, ballot: createBallot(0, BOB) });
  });

  test("onAccept records value and replies ACCEPTED", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const acceptor = createAcceptor(store, broadcast, ALICE);
    const membership = buildMembership(1, [ALICE, BOB]);
    const ballot = createBallot(0, ALICE);

    acceptor.onPrepare({ type: "PREPARE", ballot, version: 1 });
    acceptor.onAccept({
      type: "ACCEPT",
      ballot,
      version: 1,
      membership,
    });

    expect(messages.at(-1)).toEqual({
      type: "ACCEPTED",
      ballot,
      version: 1,
      peerId: ALICE,
    });
  });

  test("onAccept rejects ballots weaker than promised", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const acceptor = createAcceptor(store, broadcast, ALICE);
    const membership = buildMembership(1, [ALICE, BOB]);

    acceptor.onPrepare({
      type: "PREPARE",
      ballot: createBallot(2, ALICE),
      version: 1,
    });
    messages.length = 0;

    acceptor.onAccept({
      type: "ACCEPT",
      ballot: createBallot(1, ALICE),
      version: 1,
      membership,
    });

    expect(messages).toHaveLength(0);
  });

  test("later PREPARE includes last accepted value", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const acceptor = createAcceptor(store, broadcast, ALICE);
    const membership = buildMembership(1, [ALICE, BOB]);
    const first = createBallot(0, ALICE);

    acceptor.onPrepare({ type: "PREPARE", ballot: first, version: 1 });
    acceptor.onAccept({
      type: "ACCEPT",
      ballot: first,
      version: 1,
      membership,
    });
    messages.length = 0;

    acceptor.onPrepare({
      type: "PREPARE",
      ballot: createBallot(1, BOB),
      version: 1,
    });

    expect(messages[0]).toMatchObject({
      type: "PROMISE",
      lastAcceptedBallot: first,
      lastAcceptedMembership: membership,
    });
  });

  test("onCommit writes store and clears acceptor ballot state", () => {
    const store = createMembershipStore(buildMembership(0, [ALICE]));
    const { messages, broadcast } = collect();
    const acceptor = createAcceptor(store, broadcast, ALICE);
    const membership = buildMembership(1, [ALICE, BOB]);
    const ballot = createBallot(0, ALICE);

    acceptor.onPrepare({ type: "PREPARE", ballot, version: 1 });
    acceptor.onAccept({
      type: "ACCEPT",
      ballot,
      version: 1,
      membership,
    });
    acceptor.onCommit({ type: "COMMIT", version: 1, membership });

    expect(store.currentVersion).toBe(1);
    expect(get(store, 1)).toEqual(membership);

    messages.length = 0;
    acceptor.onPrepare({
      type: "PREPARE",
      ballot: createBallot(0, BOB),
      version: 2,
    });
    expect(messages[0]).toMatchObject({
      lastAcceptedBallot: null,
      lastAcceptedMembership: null,
    });
  });

  test("onMembershipRequest replies when version exists", () => {
    const initial = buildMembership(0, [ALICE]);
    const store = createMembershipStore(initial);
    const { messages, broadcast } = collect();
    const acceptor = createAcceptor(store, broadcast, ALICE);

    acceptor.onMembershipRequest({
      type: "MEMBERSHIP_REQUEST",
      version: 0,
      requesterId: BOB,
    });
    expect(messages).toEqual([
      { type: "MEMBERSHIP_RESPONSE", version: 0, membership: initial },
    ]);

    messages.length = 0;
    acceptor.onMembershipRequest({
      type: "MEMBERSHIP_REQUEST",
      version: 99,
      requesterId: BOB,
    });
    expect(messages).toHaveLength(0);
  });
});
