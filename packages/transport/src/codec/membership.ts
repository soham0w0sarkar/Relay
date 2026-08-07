import type { ClientId } from "@weavo/core";
import {
  buildMembership,
  type Ballot,
  type Membership,
  type MembershipMessage,
} from "@weavo/membership";
import type { Reader, Writer } from "./buffer";
import { readU8, writeU8 } from "./buffer";
import {
  MEM_ACCEPT,
  MEM_ACCEPTED,
  MEM_COMMIT,
  MEM_HEARTBEAT,
  MEM_JOIN_REQUEST,
  MEM_JOIN_RESPONSE,
  MEM_LEAVE,
  MEM_MEMBERSHIP_REQUEST,
  MEM_MEMBERSHIP_RESPONSE,
  MEM_PREPARE,
  MEM_PROMISE,
} from "./tags";
import { readUtf8, writeUtf8 } from "./utf8";
import { readUuid, writeUuid } from "./uuid";
import { readUint53, readVarint, writeUint53, writeVarint } from "./varint";

const writeBallot = (writer: Writer, ballot: Ballot) => {
  writeVarint(writer, ballot.epoch);
  writeUuid(writer, ballot.proposer);
};

const readBallot = (reader: Reader): Ballot => ({
  epoch: readVarint(reader),
  proposer: readUuid(reader),
});

const writeOptionalBallot = (writer: Writer, ballot: Ballot | null) => {
  if (ballot === null) {
    writeU8(writer, 0);
    return;
  }
  writeU8(writer, 1);
  writeBallot(writer, ballot);
};

const readOptionalBallot = (reader: Reader): Ballot | null => {
  const flag = readU8(reader);
  if (flag === 0) return null;
  if (flag === 1) return readBallot(reader);
  throw new Error(`Invalid optional ballot flag: ${flag}`);
};

const writeMembership = (writer: Writer, membership: Membership) => {
  writeVarint(writer, membership.version);
  writeVarint(writer, membership.members.length);
  for (const member of membership.members) {
    writeUuid(writer, member.clientId);
  }
};

const readMembership = (reader: Reader): Membership => {
  const version = readVarint(reader);
  const count = readVarint(reader);
  const clientIds: ClientId[] = [];
  for (let index = 0; index < count; index++) {
    clientIds.push(readUuid(reader));
  }
  return buildMembership(version, clientIds);
};

const writeOptionalMembership = (
  writer: Writer,
  membership: Membership | null,
) => {
  if (membership === null) {
    writeU8(writer, 0);
    return;
  }
  writeU8(writer, 1);
  writeMembership(writer, membership);
};

const readOptionalMembership = (reader: Reader): Membership | null => {
  const flag = readU8(reader);
  if (flag === 0) return null;
  if (flag === 1) return readMembership(reader);
  throw new Error(`Invalid optional membership flag: ${flag}`);
};

export const encodeMembershipMessage = (
  writer: Writer,
  message: MembershipMessage,
) => {
  switch (message.type) {
    case "JOIN_REQUEST":
      writeU8(writer, MEM_JOIN_REQUEST);
      writeUuid(writer, message.clientId);
      break;
    case "JOIN_RESPONSE":
      writeU8(writer, MEM_JOIN_RESPONSE);
      writeMembership(writer, message.membership);
      break;
    case "LEAVE":
      writeU8(writer, MEM_LEAVE);
      writeUuid(writer, message.clientId);
      break;
    case "PREPARE":
      writeU8(writer, MEM_PREPARE);
      writeBallot(writer, message.ballot);
      writeVarint(writer, message.version);
      break;
    case "PROMISE":
      writeU8(writer, MEM_PROMISE);
      writeBallot(writer, message.ballot);
      writeVarint(writer, message.version);
      writeUuid(writer, message.senderId);
      writeOptionalBallot(writer, message.lastAcceptedBallot);
      writeOptionalMembership(writer, message.lastAcceptedMembership);
      break;
    case "ACCEPT":
      writeU8(writer, MEM_ACCEPT);
      writeBallot(writer, message.ballot);
      writeVarint(writer, message.version);
      writeMembership(writer, message.membership);
      break;
    case "ACCEPTED":
      writeU8(writer, MEM_ACCEPTED);
      writeBallot(writer, message.ballot);
      writeVarint(writer, message.version);
      writeUuid(writer, message.peerId);
      break;
    case "COMMIT":
      writeU8(writer, MEM_COMMIT);
      writeVarint(writer, message.version);
      writeMembership(writer, message.membership);
      break;
    case "MEMBERSHIP_REQUEST":
      writeU8(writer, MEM_MEMBERSHIP_REQUEST);
      writeVarint(writer, message.version);
      writeUuid(writer, message.requesterId);
      break;
    case "MEMBERSHIP_RESPONSE":
      writeU8(writer, MEM_MEMBERSHIP_RESPONSE);
      writeVarint(writer, message.version);
      writeMembership(writer, message.membership);
      break;
    case "HEARTBEAT": {
      writeU8(writer, MEM_HEARTBEAT);
      writeUuid(writer, message.clientId);
      writeVarint(writer, message.membershipVersion);
      writeUint53(writer, message.timestamp);
      writeVarint(writer, message.presence.cursor);
      writeUtf8(writer, message.presence.name);
      writeUtf8(writer, message.presence.color);
      const entries = Object.entries(message.sv);
      writeVarint(writer, entries.length);
      for (const [clientId, clock] of entries) {
        writeUuid(writer, clientId as ClientId);
        writeVarint(writer, clock);
      }
      break;
    }
    default: {
      const _exhaustive: never = message;
      throw new Error(`Unknown membership message: ${(_exhaustive as MembershipMessage).type}`);
    }
  }
};

export const decodeMembershipMessage = (reader: Reader): MembershipMessage => {
  const tag = readU8(reader);

  switch (tag) {
    case MEM_JOIN_REQUEST:
      return { type: "JOIN_REQUEST", clientId: readUuid(reader) };
    case MEM_JOIN_RESPONSE:
      return { type: "JOIN_RESPONSE", membership: readMembership(reader) };
    case MEM_LEAVE:
      return { type: "LEAVE", clientId: readUuid(reader) };
    case MEM_PREPARE:
      return {
        type: "PREPARE",
        ballot: readBallot(reader),
        version: readVarint(reader),
      };
    case MEM_PROMISE:
      return {
        type: "PROMISE",
        ballot: readBallot(reader),
        version: readVarint(reader),
        senderId: readUuid(reader),
        lastAcceptedBallot: readOptionalBallot(reader),
        lastAcceptedMembership: readOptionalMembership(reader),
      };
    case MEM_ACCEPT:
      return {
        type: "ACCEPT",
        ballot: readBallot(reader),
        version: readVarint(reader),
        membership: readMembership(reader),
      };
    case MEM_ACCEPTED:
      return {
        type: "ACCEPTED",
        ballot: readBallot(reader),
        version: readVarint(reader),
        peerId: readUuid(reader),
      };
    case MEM_COMMIT:
      return {
        type: "COMMIT",
        version: readVarint(reader),
        membership: readMembership(reader),
      };
    case MEM_MEMBERSHIP_REQUEST:
      return {
        type: "MEMBERSHIP_REQUEST",
        version: readVarint(reader),
        requesterId: readUuid(reader),
      };
    case MEM_MEMBERSHIP_RESPONSE:
      return {
        type: "MEMBERSHIP_RESPONSE",
        version: readVarint(reader),
        membership: readMembership(reader),
      };
    case MEM_HEARTBEAT: {
      const clientId = readUuid(reader);
      const membershipVersion = readVarint(reader);
      const timestamp = readUint53(reader);
      const presence = {
        cursor: readVarint(reader),
        name: readUtf8(reader),
        color: readUtf8(reader),
      };
      const count = readVarint(reader);
      const sv: Record<string, number> = {};
      for (let index = 0; index < count; index++) {
        sv[readUuid(reader)] = readVarint(reader);
      }
      return {
        type: "HEARTBEAT",
        clientId,
        membershipVersion,
        timestamp,
        presence,
        sv,
      };
    }
    default:
      throw new Error(`Unknown membership message tag: ${tag}`);
  }
};
