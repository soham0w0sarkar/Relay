import type { ClientId } from "@weavo/core";
import { createAcceptor, createProposer } from "./consesous";
import {
  buildMembership,
  commit,
  createMembershipStore,
  get,
  getShortId,
} from "./membershipStore";
import type {
  CreateMembershipOptions,
  MembershipHandle,
  MembershipMessage,
} from "./types";

export const createMembership = (
  broadcast: (message: MembershipMessage) => void,
  options: CreateMembershipOptions,
): MembershipHandle => {
  const { clientId } = options;
  const store = createMembershipStore(
    buildMembership(
      options.initialVersion ?? 0,
      options.initialMembers ?? [clientId],
    ),
  );

  const proposer = createProposer(store, broadcast, clientId);
  const acceptor = createAcceptor(store, broadcast, clientId);

  const onMessage = (message: MembershipMessage) => {
    switch (message.type) {
      case "JOIN_REQUEST":
        proposer.onJoinRequest(message);
        break;
      case "PREPARE":
        acceptor.onPrepare(message);
        break;
      case "PROMISE":
        proposer.onPromise(message);
        break;
      case "ACCEPT":
        acceptor.onAccept(message);
        break;
      case "ACCEPTED":
        proposer.onAccepted(message);
        break;
      case "COMMIT":
        acceptor.onCommit(message);
        break;
      case "MEMBERSHIP_REQUEST":
        acceptor.onMembershipRequest(message);
        break;
      case "MEMBERSHIP_RESPONSE":
        commit(store, message.membership);
        break;
      default:
        break;
    }
  };

  const requestJoin = (joiningId: ClientId = clientId) => {
    const msg = { type: "JOIN_REQUEST" as const, clientId: joiningId };
    broadcast(msg);
    proposer.onJoinRequest(msg);
  };

  const requestMembership = (version: number) => {
    broadcast({
      type: "MEMBERSHIP_REQUEST",
      version,
      requesterId: clientId,
    });
  };

  return {
    clientId,
    store,
    onMessage,
    requestJoin,
    requestMembership,
    cancel: proposer.cancel,
    getCurrent: () => get(store, store.currentVersion),
    getVersion: (version) => get(store, version),
    shortIdOf: (id) => {
      const current = get(store, store.currentVersion);
      return current ? getShortId(current, id) : null;
    },
  };
};
