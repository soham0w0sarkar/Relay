import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "bun:test";
import type { ClientId } from "@weavo/core";
import { createMembership } from "../../src/membership";
import type { Membership, MembershipHandle, MembershipMessage } from "../../src/types";

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clientId = (n: number) =>
  `${n.toString(16).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa` as ClientId;

type Pending = {
  due: number;
  to: ClientId;
  msg: MembershipMessage;
};

type HostileOptions = {
  dropRate: number;
  duplicateRate: number;
  maxDelayMs: number;
  commitDropRate: number;
};

class HostileRoom {
  readonly peers = new Map<ClientId, MembershipHandle>();
  private pending: Pending[] = [];
  private now = 0;
  private readonly rng: () => number;
  private readonly opts: HostileOptions;
  stats = { sent: 0, dropped: 0, duplicated: 0, delivered: 0 };

  constructor(seed: number, opts: HostileOptions) {
    this.rng = mulberry32(seed);
    this.opts = opts;
  }

  addPeer(id: ClientId, initialMembers: ClientId[]) {
    const handle = createMembership(
      (msg) => this.broadcast(id, msg),
      { clientId: id, initialMembers, initialVersion: 0 },
    );
    this.peers.set(id, handle);
    return handle;
  }

  broadcast(_from: ClientId, msg: MembershipMessage) {
    this.stats.sent++;
    for (const to of this.peers.keys()) {
      const dropRate =
        msg.type === "COMMIT" ? this.opts.commitDropRate : this.opts.dropRate;
      if (this.rng() < dropRate) {
        this.stats.dropped++;
        continue;
      }

      const copies = this.rng() < this.opts.duplicateRate ? 2 : 1;
      if (copies > 1) this.stats.duplicated++;

      for (let i = 0; i < copies; i++) {
        const delay = Math.floor(this.rng() * (this.opts.maxDelayMs + 1));
        this.pending.push({
          due: this.now + delay,
          to,
          msg,
        });
      }
    }
  }

  advance(ms: number) {
    const step = 5;
    let left = ms;
    while (left > 0) {
      const dt = Math.min(step, left);
      this.now += dt;
      jest.advanceTimersByTime(dt);
      this.flushDue();
      left -= dt;
    }
  }

  private flushDue() {
    let guard = 0;
    while (guard++ < 10_000) {
      this.pending.sort((a, b) => a.due - b.due);
      const next = this.pending[0];
      if (!next || next.due > this.now) return;
      this.pending.shift();
      const peer = this.peers.get(next.to);
      if (!peer) continue;
      this.stats.delivered++;
      peer.onMessage(next.msg);
    }
  }

  antiEntropy() {
    let best: Membership | null = null;
    for (const peer of this.peers.values()) {
      const cur = peer.getCurrent();
      if (!cur) continue;
      if (!best || cur.version > best.version) best = cur;
    }
    if (!best) return;

    for (const peer of this.peers.values()) {
      peer.onMessage({
        type: "MEMBERSHIP_RESPONSE",
        version: best.version,
        membership: best,
      });
    }
  }

  tables(): Membership[] {
    return [...this.peers.values()].map((p) => {
      const cur = p.getCurrent();
      if (!cur) throw new Error(`peer ${p.clientId} has no membership`);
      return cur;
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("hostile membership convergence", () => {
  test("many concurrent joins under loss/dup/delay — all peers share one table", () => {
    const founders = Array.from({ length: 5 }, (_, i) => clientId(i + 1));
    const joiners = Array.from({ length: 12 }, (_, i) => clientId(100 + i));

    const room = new HostileRoom(0xc0ffee, {
      dropRate: 0.15,
      duplicateRate: 0.25,
      maxDelayMs: 80,
      commitDropRate: 0.35,
    });

    for (const id of founders) room.addPeer(id, founders);

    for (const joiner of joiners) {
      for (const founder of founders) {
        room.peers.get(founder)!.requestJoin(joiner);
      }
    }

    for (let round = 0; round < 8; round++) {
      room.advance(2500);
      const sample = room.peers.get(founders[0]!)!.getCurrent();
      const present = new Set(sample?.members.map((m) => m.clientId) ?? []);
      for (const joiner of joiners) {
        if (present.has(joiner)) continue;
        const announcer = founders[round % founders.length]!;
        room.peers.get(announcer)!.requestJoin(joiner);
      }
    }

    room.antiEntropy();
    room.advance(50);

    const tables = room.tables();
    const reference = tables[0]!;

    for (const table of tables) {
      expect(table.version).toBe(reference.version);
      expect(table.members).toEqual(reference.members);
    }

    const ids = reference.members.map((m) => m.clientId);
    for (const id of founders) expect(ids).toContain(id);
    for (const id of joiners) expect(ids).toContain(id);
    expect(reference.members.map((m) => m.shortId)).toEqual(
      reference.members.map((_, i) => i),
    );
    expect([...ids].sort()).toEqual(ids);

    expect(room.stats.dropped).toBeGreaterThan(0);
    expect(room.stats.duplicated).toBeGreaterThan(0);
    expect(room.stats.delivered).toBeGreaterThan(0);
  });

  test("partition then heal — both sides converge to the same shortId table", () => {
    const left = [clientId(1), clientId(2), clientId(3)];
    const right = [clientId(4), clientId(5)];
    const all = [...left, ...right];

    const rng = mulberry32(0xbad);
    const peers = new Map<ClientId, MembershipHandle>();
    let partitioned = true;
    const pending: Pending[] = [];
    let now = 0;
    const dropRate = 0.1;

    const flush = () => {
      pending.sort((a, b) => a.due - b.due);
      while (pending[0] && pending[0].due <= now) {
        const next = pending.shift()!;
        peers.get(next.to)?.onMessage(next.msg);
      }
    };

    const advance = (ms: number) => {
      const step = 5;
      for (let t = 0; t < ms; t += step) {
        const dt = Math.min(step, ms - t);
        now += dt;
        jest.advanceTimersByTime(dt);
        flush();
      }
    };

    const sideOf = (id: ClientId) => (left.includes(id) ? "L" : "R");

    const broadcast = (from: ClientId, msg: MembershipMessage) => {
      for (const to of peers.keys()) {
        if (partitioned && sideOf(from) !== sideOf(to)) continue;
        if (rng() < dropRate) continue;
        pending.push({
          due: now + Math.floor(rng() * 40),
          to,
          msg,
        });
      }
    };

    for (const id of all) {
      peers.set(
        id,
        createMembership((msg) => broadcast(id, msg), {
          clientId: id,
          initialMembers: all,
        }),
      );
    }

    peers.get(left[0]!)!.requestJoin(clientId(200));
    peers.get(right[0]!)!.requestJoin(clientId(201));

    advance(4000);

    partitioned = false;

    let best: Membership | null = null;
    for (const p of peers.values()) {
      const cur = p.getCurrent();
      if (cur && (!best || cur.version > best.version)) best = cur;
    }
    if (best) {
      for (const p of peers.values()) {
        if (!p.getVersion(best.version)) {
          p.onMessage({
            type: "MEMBERSHIP_RESPONSE",
            version: best.version,
            membership: best,
          });
        }
      }
    }

    for (const id of all) peers.get(id)!.cancel();
    peers.get(left[0]!)!.requestJoin(clientId(202));
    advance(5000);

    best = null;
    for (const p of peers.values()) {
      const cur = p.getCurrent();
      if (cur && (!best || cur.version > best.version)) best = cur;
    }
    expect(best).not.toBeNull();
    for (const p of peers.values()) {
      p.onMessage({
        type: "MEMBERSHIP_RESPONSE",
        version: best!.version,
        membership: best!,
      });
    }

    const tables = [...peers.values()].map((p) => p.getCurrent()!);
    const reference = tables[0]!;
    for (const table of tables) {
      expect(table).toEqual(reference);
    }
  });

  test("duplicate storm of the same JOIN still yields one stable shortId map", () => {
    const founders = [clientId(1), clientId(2), clientId(3)];
    const room = new HostileRoom(42, {
      dropRate: 0.2,
      duplicateRate: 0.8,
      maxDelayMs: 100,
      commitDropRate: 0.2,
    });
    for (const id of founders) room.addPeer(id, founders);

    const newbie = clientId(999);
    for (let i = 0; i < 40; i++) {
      room.peers.get(founders[i % 3]!)!.requestJoin(newbie);
    }

    room.advance(8000);
    room.antiEntropy();

    const tables = room.tables();
    const reference = tables[0]!;
    for (const table of tables) expect(table).toEqual(reference);

    const hits = reference.members.filter((m) => m.clientId === newbie);
    expect(hits).toHaveLength(1);
    expect(reference.members.map((m) => m.shortId)).toEqual([0, 1, 2, 3]);
  });
});
