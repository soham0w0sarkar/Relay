import type { ClientId } from "@weavo/core";
import { createAcceptor, createProposer } from "./consesous";
import {
  buildMembership,
  commit,
  createMembershipStore,
  get,
  getClientId,
  getShortId,
} from "./membershipStore";
import type {
  CreateMembershipOptions,
  MembershipHandle,
  MembershipMessage,
} from "./types";
import type { Membership } from "./membershipStore/types";

const DEFAULT_FOUNDING_GRACE_MS = 750;

export const createMembership = (
  broadcast: (message: MembershipMessage) => void,
  options: CreateMembershipOptions,
): MembershipHandle => {
  const { clientId } = options;
  const initialMembers = options.initialMembers ?? [];
  const foundingGraceMs = options.foundingGraceMs ?? DEFAULT_FOUNDING_GRACE_MS;
  const store = createMembershipStore(
    buildMembership(options.initialVersion ?? 0, initialMembers),
  );

  const joinListeners = new Set<(membership: Membership) => void>();
  let joined = initialMembers.includes(clientId);
  let founding = false;
  let foundingTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFoundingTimer = () => {
    if (foundingTimer !== null) {
      clearTimeout(foundingTimer);
      foundingTimer = null;
    }
  };

  const notifyIfJoined = () => {
    if (joined) return;
    const current = get(store, store.currentVersion);
    if (!current?.members.some((member) => member.clientId === clientId)) {
      return;
    }
    joined = true;
    founding = false;
    clearFoundingTimer();
    for (const listener of joinListeners) listener(current);
  };

  const canRunConsensus = () => joined || founding;

  let handle: (message: MembershipMessage) => void = () => {};

  const outbound = (message: MembershipMessage) => {
    broadcast(message);
    handle(message);
  };

  const proposer = createProposer(store, outbound, clientId);
  const acceptor = createAcceptor(store, outbound, clientId);

  const beginFounding = (joiningId: ClientId) => {
    if (joined || founding) return;
    founding = true;
    proposer.onJoinRequest({ type: "JOIN_REQUEST", clientId: joiningId });
  };

  handle = (message: MembershipMessage) => {
    switch (message.type) {
      case "JOIN_REQUEST": {
        const current = get(store, store.currentVersion);
        const empty = current !== null && current.members.length === 0;

        if (joined) {
          proposer.onJoinRequest(message);
          break;
        }

        if (empty && message.clientId !== clientId) {
          beginFounding(clientId);
          proposer.onJoinRequest(message);
        }
        break;
      }
      case "PREPARE":
        if (canRunConsensus()) acceptor.onPrepare(message);
        break;
      case "PROMISE":
        if (canRunConsensus()) proposer.onPromise(message);
        break;
      case "ACCEPT":
        if (canRunConsensus()) acceptor.onAccept(message);
        break;
      case "ACCEPTED":
        if (canRunConsensus()) proposer.onAccepted(message);
        break;
      case "COMMIT":
        acceptor.onCommit(message);
        proposer.cancel();
        notifyIfJoined();
        break;
      case "JOIN_RESPONSE":
        commit(store, message.membership);
        proposer.cancel();
        notifyIfJoined();
        break;
      case "MEMBERSHIP_REQUEST":
        if (joined) acceptor.onMembershipRequest(message);
        break;
      case "MEMBERSHIP_RESPONSE":
        commit(store, message.membership);
        notifyIfJoined();
        break;
      default:
        break;
    }
  };

  const requestJoin = (joiningId: ClientId = clientId) => {
    outbound({ type: "JOIN_REQUEST", clientId: joiningId });

    if (
      !joined &&
      joiningId === clientId &&
      get(store, store.currentVersion)?.members.length === 0 &&
      foundingTimer === null
    ) {
      foundingTimer = setTimeout(() => {
        foundingTimer = null;
        if (joined) return;
        beginFounding(clientId);
      }, foundingGraceMs);
    }
  };

  const requestMembership = (version: number) => {
    outbound({
      type: "MEMBERSHIP_REQUEST",
      version,
      requesterId: clientId,
    });
  };

  return {
    clientId,
    store,
    onMessage: handle,
    requestJoin,
    requestMembership,
    cancel: () => {
      clearFoundingTimer();
      proposer.cancel();
    },
    getCurrent: () => get(store, store.currentVersion),
    getVersion: (version) => get(store, version),
    shortIdOf: (id) => {
      const current = get(store, store.currentVersion);
      return current ? getShortId(current, id) : null;
    },
    clientIdOf: (shortId) => {
      const current = get(store, store.currentVersion);
      return current ? getClientId(current, shortId) : null;
    },
    isJoined: () => joined,
    onJoined: (listener) => {
      joinListeners.add(listener);
      if (joined) {
        const current = get(store, store.currentVersion);
        if (current) listener(current);
      }
      return () => {
        joinListeners.delete(listener);
      };
    },
  };
};
