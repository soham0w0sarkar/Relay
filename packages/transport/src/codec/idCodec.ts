import type { ClientId } from "@weavo/core";

export type IdCodec = {
  encodeVersion: () => number;
  shortIdOf: (clientId: ClientId) => number | null;
  clientIdOf: (version: number, shortId: number) => ClientId | null;
  hasVersion?: (version: number) => boolean;
  onMissingVersion?: (version: number) => void;
};

export const uuidOnlyCodec: IdCodec = {
  encodeVersion: () => 0,
  shortIdOf: () => null,
  clientIdOf: () => null,
  hasVersion: () => true,
};
