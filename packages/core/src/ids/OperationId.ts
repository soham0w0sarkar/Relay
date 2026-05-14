import type { ClientId, OperationId, OperationKey } from "./types";

export type { OperationId } from "./types";

export const toKey = (id: OperationId): OperationKey => `${id[0]}:${id[1]}` as OperationKey

export const generateOperationId = (
  clientId: ClientId,
  counter: number,
): OperationId => {
  return [clientId, counter];
};
