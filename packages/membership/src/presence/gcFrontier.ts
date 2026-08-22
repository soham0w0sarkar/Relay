import type { ClientId } from "@weavo/core";
import type { PresenceCRDT } from "./presence";

export type GCFrontier = Map<ClientId, number>;

const clockOf = (
  sv: Record<string, number> | Map<string, number>,
  clientId: ClientId,
): number => {
  if (sv instanceof Map) return sv.get(clientId) ?? -1;
  return sv[clientId] ?? -1;
};

export const computeGCFrontier = (
  mySv: Record<string, number> | Map<string, number>,
  presence: PresenceCRDT,
  myClientId: ClientId,
): GCFrontier => {
  const frontier: GCFrontier = new Map();
  const myEntries = mySv instanceof Map ? mySv : new Map(Object.entries(mySv));

  for (const [clientId, myClock] of myEntries) {
    let min = myClock;

    for (const entry of presence.values()) {
      if (entry.clientId === myClientId) continue;
      min = Math.min(min, clockOf(entry.sv, clientId as ClientId));
    }

    if (min >= 0) frontier.set(clientId as ClientId, min);
  }

  return frontier;
};
