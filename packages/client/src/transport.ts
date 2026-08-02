import {
  apply,
  createDeleteOperation,
  createInsertOperation,
  toKey,
  type ClientId,
  type Document,
  type NodeStore,
  type Operation,
  type OperationId,
} from "@weavo/core";
import {
  addToBuffer,
  canApply,
  createBuffer,
  flush,
  missingOps,
  update,
  type OperationBuffer,
  type StateVector,
} from "@weavo/sync";
import type { Message, Transport } from "@weavo/transport";
import type { OnApplied, PeersReq, TimerRef } from "./types";

const nodesToOp = (nd: NodeStore, ops: OperationId[]): Operation[] => {
  const operations: Operation[] = [];

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

const isOpPresent = (store: NodeStore, op: Operation): boolean => {
  const node = store.nodes.get(toKey(op.type === "insert" ? op.id : op.target));
  if (!node) return false;
  if (op.type === "delete") return node.tombstone;
  return true;
};

const handleIncomingOp = (
  buffer: OperationBuffer,
  doc: Document,
  op: Operation,
  sv: StateVector,
  onApplied: OnApplied,
  transport: Transport,
  syncReqTimerRef: TimerRef,
) => {
  if (isOpPresent(doc.store, op)) return;

  if (canApply(doc, op)) {
    const index = apply(doc, op);
    onApplied(op, index);
    const appliedOps = flush(buffer, doc, op);

    appliedOps.forEach(({ op, index }) => onApplied(op, index));

    if (op.type === "insert") {
      update(sv, op.id);
    }
  } else {
    addToBuffer(buffer, doc, op);
    scheduleSyncRequest(transport, sv, doc.clientId, syncReqTimerRef);
  }
};

const scheduleSyncRequest = (
  transport: Transport,
  sv: StateVector,
  clientId: ClientId,
  syncReqTimerRef: TimerRef,
) => {
  if (syncReqTimerRef.current) clearTimeout(syncReqTimerRef.current);

  syncReqTimerRef.current = setTimeout(() => {
    syncReqTimerRef.current = undefined;
    transport.send({ type: "sync-request", vector: sv, clientId });
  }, 50);
};

const handleSyncReq = (
  mineSv: StateVector,
  theirSv: StateVector,
  transport: Transport,
  timerRef: TimerRef,
  requestQueue: PeersReq,
  doc: Document,
) => {
  if (timerRef.current) return;

  const misingOps = missingOps(mineSv, theirSv);

  const backOffDelay =
    misingOps.length === 0
      ? 2147483647
      : -Math.log(Math.random()) / misingOps.length;

  const ops = nodesToOp(doc.store, misingOps);

  timerRef.current = setTimeout(() => {
    transport.send({ type: "sync-response", ops, clientIds: requestQueue });
    requestQueue.length = 0;
    timerRef.current = undefined;
  }, backOffDelay);
};

const handleSyncRes = (
  buffer: OperationBuffer,
  doc: Document,
  clientIds: PeersReq,
  opClientId: ClientId,
  ops: Operation[],
  sv: StateVector,
  timerRef: TimerRef,
  onApplied: OnApplied,
  transport: Transport,
  syncReqTimerRef: TimerRef,
) => {
  const isMinePresent = clientIds.includes(opClientId);

  if (isMinePresent) {
    ops.map((op) => {
      handleIncomingOp(
        buffer,
        doc,
        op,
        sv,
        onApplied,
        transport,
        syncReqTimerRef,
      );
    });
    return;
  }

  clearTimeout(timerRef.current);
};

export const manageTransport = (
  transport: Transport,
  doc: Document,
  sv: StateVector,
  buffer: OperationBuffer,
  onApplied: OnApplied,
) => {
  const timerRef: TimerRef = { current: undefined };
  const syncReqTimerRef: TimerRef = { current: undefined };
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
        handleIncomingOp(
          buffer,
          doc,
          message.op,
          sv,
          onApplied,
          transport,
          syncReqTimerRef,
        );
        break;
      case "sync-request":
        requestQueue.push(message.clientId);
        handleSyncReq(
          sv,
          message.vector,
          transport,
          timerRef,
          requestQueue,
          doc,
        );
        break;
      case "sync-response":
        handleSyncRes(
          buffer,
          doc,
          message.clientIds,
          doc.clientId,
          message.ops,
          sv,
          timerRef,
          onApplied,
          transport,
          syncReqTimerRef,
        );
    }
  });
};
