import type { Document, OperationId } from "@repo/core";
import type { StateVector } from "./type";
import type { Operation } from "../buffer";

export const update = (sv: StateVector, id: OperationId) => {
  const [clientId, clock] = id;
  const current = sv.get(clientId) ?? -1;

  if (clock > current) sv.set(clientId, clock);
};

export const missingOps = (
  doc: Document,
  mineSv: StateVector,
  theirSv: StateVector,
): OperationId[] => {
  const missingOps: OperationId[] = [];

  mineSv.forEach((myClock, clientId) => {
    const theirClock = theirSv.get(clientId) ?? -1;
    for (let clock = theirClock + 1; clock <= myClock; clock++) {
      missingOps.push([clientId, clock]);
    }
  });

  return missingOps;
};
