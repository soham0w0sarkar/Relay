import type { ClientId } from "@weavo/core";
import type { Membership, MembershipStore } from "../membershipStore/types";
import { buildMembership, get } from "../membershipStore";
import { compareBallot, createBallot } from "./Ballot";
import type {
  Ballot,
  JoinRequestMessage,
  MembershipMessage,
  PromiseMessage,
} from "./types";

const INITIAL_JITTER = () => Math.random() * 100;
const RETRY_JITTER = () => Math.random() * 500;
const PREPARE_TIMEOUT = 2000;
const BATCH_WINDOW = 200;

export const createProposer = (
  store: MembershipStore,
  broadcast: (message: MembershipMessage) => void,
  clientId: ClientId,
) => {
  const proposerState = {
    promises: new Map<ClientId, PromiseMessage>(),
    acceptances: [] as ClientId[],
    retryTimer: null as ReturnType<typeof setTimeout> | null,
    epoch: -1,
    joinReqBatch: [] as ClientId[],
    proposalTimer: null as ReturnType<typeof setTimeout> | null,
    proposedMembership: null as Membership | null,
    acceptSent: false,
  };

  const clearRetry = () => {
    if (proposerState.retryTimer !== null) {
      clearTimeout(proposerState.retryTimer);
      proposerState.retryTimer = null;
    }
  };

  const clearProposalTimer = () => {
    if (proposerState.proposalTimer !== null) {
      clearTimeout(proposerState.proposalTimer);
      proposerState.proposalTimer = null;
    }
  };

  const quorum = () => {
    const current = get(store, store.currentVersion);
    if (!current || current.members.length === 0) return 1;
    return Math.floor(current.members.length / 2) + 1;
  };

  const startProposal = (proposedMembership: Membership, isRetry = false) => {
    proposerState.epoch++;
    const ballot = createBallot(proposerState.epoch, clientId);

    proposerState.promises.clear();
    proposerState.acceptances = [];
    proposerState.acceptSent = false;
    proposerState.proposedMembership = proposedMembership;

    broadcast({
      type: "PREPARE",
      ballot,
      version: proposedMembership.version,
    });

    if (isRetry) return;

    clearRetry();
    proposerState.retryTimer = setTimeout(() => {
      proposerState.retryTimer = null;
      if (proposerState.proposedMembership === proposedMembership) {
        startProposal(proposedMembership, true);
      }
    }, PREPARE_TIMEOUT + RETRY_JITTER());
  };

  const onJoinRequest = (msg: JoinRequestMessage) => {
    const currentMembership = get(store, store.currentVersion);
    if (!currentMembership) return;

    if (!proposerState.joinReqBatch.includes(msg.clientId)) {
      proposerState.joinReqBatch.push(msg.clientId);
    }

    if (proposerState.proposalTimer) return;

    const rank = currentMembership.members.findIndex(
      (m) => m.clientId === clientId,
    );

    proposerState.proposalTimer = setTimeout(() => {
      proposerState.proposalTimer = null;

      const latest = get(store, store.currentVersion);
      if (!latest) {
        proposerState.joinReqBatch = [];
        return;
      }

      const clientIds = [
        ...latest.members.map((member) => member.clientId),
        ...proposerState.joinReqBatch,
      ];
      proposerState.joinReqBatch = [];

      const proposed = buildMembership(latest.version + 1, clientIds);
      startProposal(proposed);
    }, Math.max(0, rank) * 500 + INITIAL_JITTER() + BATCH_WINDOW);
  };

  const onPromise = (msg: PromiseMessage) => {
    const proposed = proposerState.proposedMembership;
    if (!proposed) return;
    if (msg.version !== proposed.version) return;
    if (
      msg.ballot.epoch !== proposerState.epoch ||
      msg.ballot.proposer !== clientId
    ) {
      return;
    }

    proposerState.promises.set(msg.senderId, msg);
    if (proposerState.promises.size < quorum()) return;
    if (proposerState.acceptSent) return;

    clearRetry();
    clearProposalTimer();

    let highestAcceptedBallot: Ballot | null = null;
    let carriedMembership: Membership | null = null;

    for (const promise of proposerState.promises.values()) {
      if (!promise.lastAcceptedBallot || !promise.lastAcceptedMembership) {
        continue;
      }
      if (
        highestAcceptedBallot === null ||
        compareBallot(promise.lastAcceptedBallot, highestAcceptedBallot) > 0
      ) {
        highestAcceptedBallot = promise.lastAcceptedBallot;
        carriedMembership = promise.lastAcceptedMembership;
      }
    }

    const membership = carriedMembership ?? proposed;
    proposerState.proposedMembership = membership;
    proposerState.acceptSent = true;

    broadcast({
      type: "ACCEPT",
      ballot: createBallot(proposerState.epoch, clientId),
      version: membership.version,
      membership,
    });
  };

  return { onJoinRequest, onPromise };
};
