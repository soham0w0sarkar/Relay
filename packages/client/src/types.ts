import type { ClientId } from "@weavo/core";

export type TimerRef = { current: ReturnType<typeof setTimeout> | undefined };

export type PeersReq = ClientId[];

export type TextChange = {
  index: number;
  insert?: string;
  delete?: number;
};

export type CompositionState = {
  value: string;
  start: number;
  end: number;
  docStart: number;
  docEnd: number;
};

export type { OnApplied } from "@weavo/core";
