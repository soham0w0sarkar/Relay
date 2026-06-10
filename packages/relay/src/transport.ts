import {
  createDeleteOperation,
  createInsertOperation,
  toKey,
  type ClientId,
  type DeleteOperation,
  type Document,
  type InsertOperation,
  type NodeStore,
  type OperationId,
} from "@repo/core";
import { missingOps, type StateVector } from "@repo/sync";
import type { Message, Transport } from "@repo/transport";
import type { PeersReq, TimerId } from "./types";

export const manageTransport = (
  transport: Transport,
  doc: Document,
  sv: StateVector,
) => {
  let timerId: TimerId;
  const requestQueue: PeersReq = [];

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
        handleIncomingOp(doc, message.op, sv);
        break;
      case "sync-request":
        handleSyncReq(sv, message.vector, transport, timerId, requestQueue);
        break;
      case "sync-response":
        handleSyncRes(
          doc,
          requestQueue,
          doc.clientId,
          message.ops,
          sv,
          timerId,
        );
    }
  });
};

const nodesToOp = (
  nd: NodeStore,
  ops: OperationId[],
): (InsertOperation | DeleteOperation)[] => {
  const operations: (InsertOperation | DeleteOperation)[] = [];

  ops.map((op) => {
    const node = nd.nodes.get(toKey(op));

    if (!node) throw new Error(`${op} isn't present`);

    const insertOp = createInsertOperation(
      op,
      node.value,
      node.leftOrigin!,
      node.rightOrigin,
    );

    if (node?.tombstone) operations.push(insertOp, createDeleteOperation(op));

    return operations.push(insertOp);
  });

  return operations;
};

const handleIncomingOp = (
  doc: Document,
  op: InsertOperation | DeleteOperation,
  sv: StateVector,
) => {};

const handleSyncReq = (
  mineSv: StateVector,
  theirSv: StateVector,
  transport: Transport,
  timerId: TimerId,
  requestQueue: PeersReq,
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
  doc: Document,
  clientIds: PeersReq,
  opClientId: ClientId,
  ops: (InsertOperation | DeleteOperation)[],
  sv: StateVector,
  timerId: TimerId,
) => {
  const isMinePresent = clientIds.includes(opClientId);

  if (isMinePresent) {
    ops.map((op) => {
      handleIncomingOp(doc, op, sv);
    });
    return;
  }

  clearTimeout(timerId);
};
