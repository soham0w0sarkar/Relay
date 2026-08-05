import type { ClientId } from "@weavo/core";
import type { MembershipMessage } from "./consesous/types";
import type { Membership, MembershipStore } from "./membershipStore/types";

export type { Member, Membership, MembershipStore } from "./membershipStore/types";

export type {
  AcceptMessage,
  AcceptedMessage,
  Ballot,
  CommitMessage,
  HeartbeatMessage,
  JoinRequestMessage,
  LeaveMessage,
  MembershipMessage,
  MembershipRequestMessage,
  MembershipResponseMessage,
  PrepareMessage,
  PresencePayload,
  PromiseMessage,
} from "./consesous/types";

export type CreateMembershipOptions = {
  clientId: ClientId;
  initialMembers?: ClientId[];
  initialVersion?: number;
};

export type MembershipHandle = {
  clientId: ClientId;
  store: MembershipStore;
  onMessage: (message: MembershipMessage) => void;
  requestJoin: (joiningId?: ClientId) => void;
  requestMembership: (version: number) => void;
  cancel: () => void;
  getCurrent: () => Membership | null;
  getVersion: (version: number) => Membership | null;
  shortIdOf: (clientId: ClientId) => number | null;
};
