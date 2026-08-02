import type { ClientId } from "@weavo/core";
import type { Ballot } from "./types";

export const createBallot = (epoch: number, proposer: ClientId): Ballot => {
  return {
    epoch,
    proposer,
  };
};

export const nullBallot = (): Ballot => {
  return {
    epoch: -1,
    proposer: "",
  };
};

export const compareBallot = (a: Ballot, b: Ballot): number => {
  if (a.epoch !== b.epoch) return a.epoch - b.epoch;
  if (a.proposer < b.proposer) return 1;
  if (a.proposer > b.proposer) return -1;
  return 0;
};
