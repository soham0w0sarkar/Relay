import type { ClientId } from "@weavo/core";
import type { MembershipMessage, PresencePayload } from "./consesous/types";
import type { Membership, MembershipStore } from "./membershipStore/types";
import type { PeerPresence, GCFrontier } from "./presence";

export type { Member, Membership, MembershipStore } from "./membershipStore/types";

export type {
  AcceptMessage,
  AcceptedMessage,
  Ballot,
  CommitMessage,
  HeartbeatMessage,
  JoinRequestMessage,
  JoinResponseMessage,
  LeaveMessage,
  MembershipMessage,
  MembershipRequestMessage,
  MembershipResponseMessage,
  PrepareMessage,
  PresencePayload,
  PromiseMessage,
} from "./consesous/types";

export type {
  GCFrontier,
  LivenessEntry,
  LivenessStatus,
  LivenessSweep,
  LivenessTracker,
  LivenessTrackerOptions,
  PeerPresence,
  PresenceCRDT,
  PresenceEntry,
  PresenceTracker,
  PresenceTrackerOptions,
} from "./presence";

export type CreateMembershipOptions = {
  clientId: ClientId;
  initialMembers?: ClientId[];
  initialVersion?: number;
  foundingGraceMs?: number;
  heartbeatIntervalMs?: number;
  presenceTimeoutMs?: number;
  removalTimeoutMs?: number;
  getPresence?: () => PresencePayload;
  getStateVector?: () => Record<string, number>;
};

export type MembershipHandle = {
  clientId: ClientId;
  store: MembershipStore;
  onMessage: (message: MembershipMessage) => void;
  requestJoin: (joiningId?: ClientId) => void;
  requestMembership: (version: number) => void;
  leave: () => void;
  cancel: () => void;
  getCurrent: () => Membership | null;
  getVersion: (version: number) => Membership | null;
  shortIdOf: (clientId: ClientId) => number | null;
  clientIdOf: (shortId: number) => ClientId | null;
  isJoined: () => boolean;
  onJoined: (listener: (membership: Membership) => void) => () => void;
  getPresence: () => Map<ClientId, PeerPresence>;
  setCursor: (clientId: ClientId, cursor: number) => void;
  computeGCFrontier: () => GCFrontier;
  onPresence: (
    listener: (presence: Map<ClientId, PeerPresence>) => void,
  ) => () => void;
  setPresenceSource: (source: {
    getPresence?: () => PresencePayload;
    getStateVector?: () => Record<string, number>;
  }) => void;
};
