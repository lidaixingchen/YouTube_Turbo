export type GridNodeType = "item" | "section" | "other";

export interface TailBalanceState {
  tailRemainder: number;
  pendingSection: HTMLElement | null;
  neededForPending: number;
}

export interface RebalanceInstruction {
  sectionIndex: number;
  sourceIndices: number[];
  neededCount: number;
}

export interface RebalancePlanResult {
  instructions: RebalanceInstruction[];
  finalRemainder: number;
  hasPendingSection: boolean;
  hasMultiplePendingSections: boolean;
  neededForPending: number;
  pendingSectionIndex: number | null;
}
