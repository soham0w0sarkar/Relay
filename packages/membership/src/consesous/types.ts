import type { ClientId } from "@weavo/core"
import type { Membership } from "../membershipStore/types"


export type Ballot = {
  epoch: number
  proposer: ClientId
}

export type PrepareMessage = {
  type: "PREPARE"
  ballot: Ballot
  version: number       
}

export type PromiseMessage = {
  type: "PROMISE"
  ballot: Ballot
  version: number
  senderId: ClientId
  lastAcceptedBallot: Ballot | null
  lastAcceptedMembership: Membership | null
}

export type AcceptMessage = {
  type: "ACCEPT"
  ballot: Ballot
  version: number
  membership: Membership
}

export type AcceptedMessage = {
  type: "ACCEPTED"
  ballot: Ballot
  version: number
  peerId: ClientId
}

export type CommitMessage = {
  type: "COMMIT"
  version: number
  membership: Membership
}


export type JoinRequestMessage = {
  type: "JOIN_REQUEST"
  clientId: ClientId
}

export type LeaveMessage = {
  type: "LEAVE"
  clientId: ClientId
}


export type MembershipRequestMessage = {
  type: "MEMBERSHIP_REQUEST"
  version: number
  requesterId: ClientId   
}

export type MembershipResponseMessage = {
  type: "MEMBERSHIP_RESPONSE"
  version: number
  membership: Membership
}

export type HeartbeatMessage = {
  type: "HEARTBEAT"
  clientId: ClientId
  membershipVersion: number   
  timestamp: number           
  presence: PresencePayload   
  sv: Record<string, number>  
}

export type PresencePayload = {
  cursor: number
  name: string
  color: string
}

export type MembershipMessage =
  | JoinRequestMessage
  | LeaveMessage
  | PrepareMessage
  | PromiseMessage
  | AcceptMessage
  | AcceptedMessage
  | CommitMessage
  | MembershipRequestMessage
  | MembershipResponseMessage
  | HeartbeatMessage

export const isMembershipMessage = (msg: unknown): msg is MembershipMessage => {
  if (typeof msg !== "object" || msg === null) return false
  const type = (msg as { type?: string }).type
  return [
    "JOIN_REQUEST",
    "LEAVE",
    "PREPARE",
    "PROMISE",
    "ACCEPT",
    "ACCEPTED",
    "COMMIT",
    "MEMBERSHIP_REQUEST",
    "MEMBERSHIP_RESPONSE",
    "HEARTBEAT",
  ].includes(type ?? "")
}