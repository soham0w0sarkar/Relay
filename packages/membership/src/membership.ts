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
import { createPresenceTracker, type PeerPresence } from "./presence";
import type {
  CreateMembershipOptions,
  MembershipHandle,
  MembershipMessage,
  PresencePayload,
} from "./types";
import type { Membership } from "./membershipStore/types";

const DEFAULT_FOUNDING_GRACE_MS = 750;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 2_000;

const defaultPresence = (): PresencePayload => ({
  cursor: 0,
  name: "",
  color: "",
});

const stateVectorToRecord = (
  getStateVector?: () => Record<string, number>,
): Record<string, number> => getStateVector?.() ?? {};

export const createMembership = (
  broadcast: (message: MembershipMessage) => void,
  options: CreateMembershipOptions,
): MembershipHandle => {
  const { clientId } = options;
  const initialMembers = options.initialMembers ?? [];
  const foundingGraceMs = options.foundingGraceMs ?? DEFAULT_FOUNDING_GRACE_MS;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const store = createMembershipStore(
    buildMembership(options.initialVersion ?? 0, initialMembers),
  );

  let getPresence = options.getPresence ?? defaultPresence;
  let getStateVector = options.getStateVector;

  const presence = createPresenceTracker({
    clientId,
    ...(options.presenceTimeoutMs !== undefined
      ? { timeoutMs: options.presenceTimeoutMs }
      : {}),
  });

  const joinListeners = new Set<(membership: Membership) => void>();
  const presenceListeners = new Set<
    (peers: Map<ClientId, PeerPresence>) => void
  >();

  let joined = initialMembers.includes(clientId);
  let founding = false;
  let foundingTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const clearFoundingTimer = () => {
    if (foundingTimer !== null) {
      clearTimeout(foundingTimer);
      foundingTimer = null;
    }
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const notifyPresence = () => {
    const snapshot = presence.snapshot();
    for (const listener of presenceListeners) listener(snapshot);
  };

  const touchPresence = (changed: boolean) => {
    const evicted = presence.evictStale();
    if (changed || evicted.length > 0) notifyPresence();
  };

  const sendHeartbeat = () => {
    if (!joined) return;
    outbound({
      type: "HEARTBEAT",
      clientId,
      membershipVersion: store.currentVersion,
      timestamp: Date.now(),
      presence: getPresence(),
      sv: stateVectorToRecord(getStateVector),
    });
  };

  const startHeartbeat = () => {
    if (heartbeatTimer !== null || !joined || heartbeatIntervalMs <= 0) return;
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, heartbeatIntervalMs);
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
    startHeartbeat();
  };

  const canRunConsensus = () => joined || founding;

  let handle: (message: MembershipMessage) => void = () => {};

  const outbound = (message: MembershipMessage) => {
    handle(message);
    broadcast(message);
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
      case "HEARTBEAT":
        if (!joined) break;
        touchPresence(presence.fromHeartbeat(message));
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

  if (joined) startHeartbeat();

  return {
    clientId,
    store,
    onMessage: handle,
    requestJoin,
    requestMembership,
    cancel: () => {
      clearFoundingTimer();
      stopHeartbeat();
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
    getPresence: () => presence.snapshot(),
    onPresence: (listener) => {
      presenceListeners.add(listener);
      listener(presence.snapshot());
      return () => {
        presenceListeners.delete(listener);
      };
    },
    setPresenceSource: (source) => {
      if (source.getPresence) getPresence = source.getPresence;
      if (source.getStateVector) getStateVector = source.getStateVector;
    },
  };
};
