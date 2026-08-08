import "./setup";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  apply,
  createInsertOperation,
  createReplica,
  generateClientId,
  generateOperationId,
  ROOT_ID,
  type ClientId,
} from "@weavo/core";
import { createMembership } from "@weavo/membership";
import { update, createBuffer, type StateVector } from "@weavo/sync";
import { createWeavo } from "../src/Document";
import { manageTransport } from "../src/transport";
import {
  createCountingRoom,
  type CountingMemoryRoom,
} from "./helpers/countingRoom";
import { createTextarea, flushMicrotasks, insertText } from "./helpers/editor";
import { createMockTransport } from "./helpers/mockTransport";

const PEER_COUNT = 500;
const NAIVE_RESPONSE_STORM = PEER_COUNT * (PEER_COUNT - 1);

const seedHubDocument = () => {
  const clientId = generateClientId();
  const doc = createReplica(clientId);
  const opId = generateOperationId(clientId, 0);
  const op = createInsertOperation(opId, "x", ROOT_ID, null);
  apply(doc, op);
  const sv: StateVector = new Map();
  update(sv, opId);
  return { doc, sv, clientId };
};

const joinedMembership = (clientId: ClientId) =>
  createMembership(() => {}, {
    clientId,
    initialMembers: [clientId],
    heartbeatIntervalMs: 0,
  });

const seededIds = () =>
  Array.from({ length: PEER_COUNT }, () => generateClientId());

const seededPeer = (
  room: CountingMemoryRoom,
  clientId: ClientId,
  members: ClientId[],
) =>
  createWeavo(room.join(), {
    clientId,
    initialMembers: members,
    heartbeatIntervalMs: 0,
  });

describe("sync-response suppression load", () => {
  let randomSpy: ReturnType<typeof spyOn<typeof Math, "random">>;

  beforeEach(() => {
    randomSpy = spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  test(`hub batches ${PEER_COUNT} sync-requests into one sync-response`, async () => {
    const { doc, sv } = seedHubDocument();
    const { transport, sent, deliver } = createMockTransport();
    const batchedClientIds: number[] = [];

    const baseSend = transport.send.bind(transport);
    transport.send = (message) => {
      if (message.type === "sync-response") {
        batchedClientIds.push(message.clientIds.length);
      }
      baseSend(message);
    };

    manageTransport(
      transport,
      doc,
      sv,
      createBuffer(),
      () => {},
      joinedMembership(doc.clientId),
    );
    transport.connect();
    sent.length = 0;

    for (let i = 0; i < PEER_COUNT; i++) {
      deliver({
        type: "sync-request",
        vector: new Map(),
        clientId: `peer-${i}` as ClientId,
      });
    }

    expect(sent.filter((m) => m.type === "sync-response")).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const responses = sent.filter((m) => m.type === "sync-response");
    expect(responses).toHaveLength(1);
    expect(batchedClientIds).toEqual([PEER_COUNT]);
    if (responses[0]?.type === "sync-response") {
      expect(responses[0].ops.length).toBeGreaterThan(0);
    }
  });

  test(`${PEER_COUNT} peers join without sync-response storm`, async () => {
    const room = createCountingRoom();

    const members = seededIds();
    const writer = seededPeer(room, members[0]!, members);
    const el = createTextarea();
    writer.bind(el);
    await flushMicrotasks();
    insertText(el, "load-test");
    await flushMicrotasks();

    room.resetStats();

    const peers: ReturnType<typeof createWeavo>[] = [writer];
    for (let i = 1; i < PEER_COUNT; i++) {
      peers.push(seededPeer(room, members[i]!, members));
    }

    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(room.stats.syncRequests).toBeGreaterThanOrEqual(PEER_COUNT - 1);
    expect(room.stats.syncResponses).toBeGreaterThan(0);
    expect(room.stats.syncResponses).toBeLessThan(PEER_COUNT * 4);
    expect(room.stats.syncResponses).toBeLessThan(NAIVE_RESPONSE_STORM / 100);

    for (const peer of peers) peer.disconnect();
    el.remove();
  }, 120_000);

  test(`${PEER_COUNT} peers converge after join storm`, async () => {
    const room = createCountingRoom();
    const members = seededIds();
    const writer = seededPeer(room, members[0]!, members);
    const writerEl = createTextarea();
    writer.bind(writerEl);

    const peers: ReturnType<typeof createWeavo>[] = [writer];
    const elements: HTMLTextAreaElement[] = [writerEl];

    for (let i = 1; i < PEER_COUNT; i++) {
      peers.push(seededPeer(room, members[i]!, members));
      const el = createTextarea();
      elements.push(el);
      peers[i]!.bind(el);
    }

    await flushMicrotasks();
    insertText(writerEl, "converge");

    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    for (const el of elements) {
      expect(el.value).toBe("converge");
    }

    for (const peer of peers) peer.disconnect();
    for (const el of elements) el.remove();
  }, 120_000);
});
