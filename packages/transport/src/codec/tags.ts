export const WIRE_VERSION = 3;

export const MSG_OP = 0x01;
export const MSG_SYNC_REQUEST = 0x02;
export const MSG_SYNC_RESPONSE = 0x03;
export const MSG_MEMBERSHIP = 0x04;

export const OP_INSERT = 0x11;
export const OP_INSERT_NO_RIGHT = 0x12;
export const OP_DELETE = 0x13;

export const OP_ID_ROOT = 0x00;
export const OP_ID_UUID = 0x01;
export const OP_ID_SHORT = 0x02;

export const MEM_JOIN_REQUEST = 0x01;
export const MEM_JOIN_RESPONSE = 0x02;
export const MEM_LEAVE = 0x03;
export const MEM_PREPARE = 0x04;
export const MEM_PROMISE = 0x05;
export const MEM_ACCEPT = 0x06;
export const MEM_ACCEPTED = 0x07;
export const MEM_COMMIT = 0x08;
export const MEM_MEMBERSHIP_REQUEST = 0x09;
export const MEM_MEMBERSHIP_RESPONSE = 0x0a;
export const MEM_HEARTBEAT = 0x0b;
