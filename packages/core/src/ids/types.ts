export type ClientId = string;

export type OperationId = [ClientId, number];
export type OperationKey = string & { readonly __brand: "OperationKey" };
