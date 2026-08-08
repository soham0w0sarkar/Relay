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
import { createMembership } from "../../src/membership";
import type { MembershipMessage } from "../../src/types";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ClientId;
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as ClientId;
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as ClientId;

type Peer = {
  id: ClientId;
  handle: ReturnType<typeof createMembership>;
};

const wireRoom = (ids: ClientId[]) => {
  const peers = new Map<ClientId, Peer>();
  const inbox = new Map<ClientId, MembershipMessage[]>();

  for (const id of ids) inbox.set(id, []);

  for (const id of ids) {
    const handle = createMembership(
      (msg) => {
        for (const peerId of ids) {
          if (peerId === id) continue;
          inbox.get(peerId)!.push(msg);
        }
      },
      {
        clientId: id,
        initialMembers: ids,
        heartbeatIntervalMs: 0,
        presenceTimeoutMs: 10_000,
        removalTimeoutMs: 30_000,
      },
    );
    peers.set(id, { id, handle });
  }

  const deliver = () => {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const id of ids) {
        const queue = inbox.get(id)!;
        const peer = peers.get(id)!;
        while (queue.length > 0) {
          progressed = true;
          peer.handle.onMessage(queue.shift()!);
        }
      }
    }
  };

  return { peers, deliver, inbox };
};

beforeEach(() => {
  jest.useFakeTimers({ now: 1_000 });
  spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("leave path", () => {
  test("graceful leave removes presence and commits membership", () => {
    const { peers, deliver } = wireRoom([ALICE, BOB, CAROL]);
    const alice = peers.get(ALICE)!.handle;
    const bob = peers.get(BOB)!.handle;

    bob.onMessage({
      type: "HEARTBEAT",
      clientId: ALICE,
      membershipVersion: 0,
      timestamp: 1_000,
      presence: { cursor: 1, name: "alice", color: "#111" },
      sv: {},
    });
    expect(bob.getPresence().has(ALICE)).toBe(true);

    alice.leave();
    deliver();

    jest.advanceTimersByTime(200);
    deliver();

    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(100);
      deliver();
    }

    expect(bob.getPresence().has(ALICE)).toBe(false);
    expect(
      bob.getCurrent()?.members.map((m) => m.clientId),
    ).toEqual([BOB, CAROL]);
    expect(alice.isJoined()).toBe(false);
  });

  test("ungraceful leave proposes removal after removalTimeout", () => {
    const { peers, inbox } = wireRoom([ALICE, BOB]);
    const alice = peers.get(ALICE)!.handle;
    const bob = peers.get(BOB)!.handle;

    alice.onMessage({
      type: "HEARTBEAT",
      clientId: BOB,
      membershipVersion: 0,
      timestamp: 1_000,
      presence: { cursor: 2, name: "bob", color: "#222" },
      sv: {},
    });
    expect(alice.getPresence().has(BOB)).toBe(true);

    jest.setSystemTime(12_000);
    alice.onMessage({
      type: "HEARTBEAT",
      clientId: ALICE,
      membershipVersion: 0,
      timestamp: 12_000,
      presence: { cursor: 0, name: "alice", color: "#111" },
      sv: {},
    });
    expect(alice.getPresence().has(BOB)).toBe(false);
    expect(alice.getCurrent()?.members.map((m) => m.clientId)).toEqual([
      ALICE,
      BOB,
    ]);

    bob.cancel();

    jest.setSystemTime(32_000);
    alice.onMessage({
      type: "HEARTBEAT",
      clientId: ALICE,
      membershipVersion: 0,
      timestamp: 32_000,
      presence: { cursor: 0, name: "alice", color: "#111" },
      sv: {},
    });

    jest.advanceTimersByTime(200);
    inbox.get(BOB)!.length = 0;

    expect(alice.getCurrent()?.members.map((m) => m.clientId)).toEqual([
      ALICE,
    ]);
  });

  test("heartbeat before COMMIT cancels removal", () => {
    const { peers, deliver } = wireRoom([ALICE, BOB]);
    const alice = peers.get(ALICE)!.handle;

    alice.onMessage({
      type: "HEARTBEAT",
      clientId: BOB,
      membershipVersion: 0,
      timestamp: 1_000,
      presence: { cursor: 2, name: "bob", color: "#222" },
      sv: {},
    });

    jest.setSystemTime(32_000);
    alice.onMessage({
      type: "HEARTBEAT",
      clientId: ALICE,
      membershipVersion: 0,
      timestamp: 32_000,
      presence: { cursor: 0, name: "alice", color: "#111" },
      sv: {},
    });

    jest.advanceTimersByTime(200);
    deliver();

    alice.onMessage({
      type: "HEARTBEAT",
      clientId: BOB,
      membershipVersion: 0,
      timestamp: 32_100,
      presence: { cursor: 3, name: "bob", color: "#222" },
      sv: {},
    });

    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(100);
      deliver();
    }

    expect(alice.getCurrent()?.members.map((m) => m.clientId)).toEqual([
      ALICE,
      BOB,
    ]);
    expect(alice.getPresence().has(BOB)).toBe(true);
  });

  test("removed peer rejoins via JOIN_REQUEST", () => {
    const ids = [ALICE, BOB, CAROL];
    const peers = new Map<ClientId, ReturnType<typeof createMembership>>();
    const inbox = new Map<ClientId, MembershipMessage[]>();
    for (const id of ids) inbox.set(id, []);

    for (const id of ids) {
      peers.set(
        id,
        createMembership(
          (msg) => {
            for (const peerId of ids) {
              if (peerId === id) continue;
              inbox.get(peerId)!.push(msg);
            }
          },
          {
            clientId: id,
            initialMembers: ids,
            heartbeatIntervalMs: 0,
          },
        ),
      );
    }

    const deliver = () => {
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const id of ids) {
          const queue = inbox.get(id)!;
          while (queue.length > 0) {
            progressed = true;
            peers.get(id)!.onMessage(queue.shift()!);
          }
        }
      }
    };

    const alice = peers.get(ALICE)!;
    const bob = peers.get(BOB)!;

    bob.leave();
    deliver();
    jest.advanceTimersByTime(200);
    deliver();
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(100);
      deliver();
    }

    expect(alice.getCurrent()?.members.map((m) => m.clientId)).toEqual([
      ALICE,
      CAROL,
    ]);
    expect(bob.isJoined()).toBe(false);

    bob.requestJoin();
    deliver();
    jest.advanceTimersByTime(200);
    deliver();
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(100);
      deliver();
    }

    expect(bob.isJoined()).toBe(true);
    expect(alice.getCurrent()?.members.map((m) => m.clientId)).toEqual([
      ALICE,
      BOB,
      CAROL,
    ]);
  });
});
