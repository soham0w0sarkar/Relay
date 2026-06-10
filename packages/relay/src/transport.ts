import type {
  ClientId,
  DeleteOperation,
  Document,
  InsertOperation,
} from "@repo/core";
import { missingOps, type StateVector } from "@repo/sync";
import type { Message, Transport } from "@repo/transport";
import type { peersReq, timerId } from "./types";

let timerId: timerId;
const requestQueue: peersReq = [];

const nodesToOp = () => {
  
}

const handleIncomingOp = (
  doc: Document,
  op: InsertOperation | DeleteOperation,
) => {};

const handleSyncReq = (
  mineSv: StateVector,
  theirSv: StateVector,
  transport: Transport,
) => {
  if (timerId) return;

  const misingOps = missingOps(mineSv, theirSv);

  const backOffDelay =
    misingOps.length === 0
      ? Infinity
      : -Math.log(Math.random()) / misingOps.length;

    
  timerId = setTimeout(() => {
    transport.send({ type: "sync-response", ops: [], clientIds: requestQueue });
  }, backOffDelay);
};

const handleSyncRes = (
  clientId: ClientId,
  opClientId: ClientId,
  ops: (InsertOperation | DeleteOperation)[],
) => {
  if (clientId !== opClientId) clearTimeout(timerId);
};

export const manageTransport = (
  transport: Transport,
  doc: Document,
  sv: StateVector,
) => {
  transport.onOpen(() => {
    transport.send({
      type: "sync-request",
      vector: sv,
      clientId: doc.clientId,
    });
  });

  transport.onMessage((message: Message) => {
    switch (message.type) {
      case "op":
        handleIncomingOp(doc, message.op);
        break;
      case "sync-request":
        handleSyncReq(sv, message.vector, transport);
        break;
      case "sync-response":
    }
  });
};
