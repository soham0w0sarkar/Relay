import type { ClientId } from "@weavo/core";
import type { Membership, MembershipStore } from "../membershipStore/types";
import { commit, get } from "../membershipStore";
import { compareBallot, nullBallot } from "./Ballot";
import type {
  AcceptMessage,
  Ballot,
  CommitMessage,
  MembershipMessage,
  MembershipRequestMessage,
  PrepareMessage,
} from "./types";

export const createAcceptor = (
  store: MembershipStore,
  broadcast: (message: MembershipMessage) => void,
  clientId: ClientId,
) => {
  const acceptorState = {
    promisedBallots: new Map<number, Ballot>(),
    acceptedBallots: new Map<number, Ballot>(),
    acceptedMemberships: new Map<number, Membership>(),
  };

  const clearState = () => {
    acceptorState.promisedBallots.clear();
    acceptorState.acceptedBallots.clear();
    acceptorState.acceptedMemberships.clear();
  };

  const onPrepare = (msg: PrepareMessage) => {
    const promised =
      acceptorState.promisedBallots.get(msg.version) ?? nullBallot();
    if (compareBallot(msg.ballot, promised) < 0) return;

    acceptorState.promisedBallots.set(msg.version, msg.ballot);

    broadcast({
      type: "PROMISE",
      ballot: msg.ballot,
      version: msg.version,
      senderId: clientId,
      lastAcceptedBallot: acceptorState.acceptedBallots.get(msg.version) ?? null,
      lastAcceptedMembership:
        acceptorState.acceptedMemberships.get(msg.version) ?? null,
    });
  };

  const onAccept = (msg: AcceptMessage) => {
    const promised =
      acceptorState.promisedBallots.get(msg.version) ?? nullBallot();
    if (compareBallot(msg.ballot, promised) < 0) return;

    acceptorState.acceptedBallots.set(msg.version, msg.ballot);
    acceptorState.acceptedMemberships.set(msg.version, msg.membership);

    broadcast({
      type: "ACCEPTED",
      ballot: msg.ballot,
      version: msg.version,
      peerId: clientId,
    });
  };

  const onCommit = (msg: CommitMessage) => {
    commit(store, msg.membership);
    clearState();
  };

  const onMembershipRequest = (msg: MembershipRequestMessage) => {
    const membership = get(store, msg.version);
    if (membership) {
      broadcast({
        type: "MEMBERSHIP_RESPONSE",
        version: msg.version,
        membership,
      });
    }
  };

  return {
    onPrepare,
    onAccept,
    onCommit,
    onMembershipRequest,
  };
};
