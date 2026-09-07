import { GRID_CONSTANTS } from "./constants";
import type { GridNodeType, RebalanceInstruction, RebalancePlanResult } from "./types";

export type NodeType = GridNodeType;
export type { RebalanceInstruction, RebalancePlanResult };

export const GridCalculator = {
  computeMetrics(windowWidth: number): { itemsPerRow: number } {
    if (windowWidth >= GRID_CONSTANTS.BREAKPOINTS.WIDE_DESKTOP) {
      return { itemsPerRow: GRID_CONSTANTS.COLUMNS.FOUR };
    }
    if (windowWidth >= GRID_CONSTANTS.BREAKPOINTS.DESKTOP) {
      return { itemsPerRow: GRID_CONSTANTS.COLUMNS.THREE };
    }
    if (windowWidth >= GRID_CONSTANTS.BREAKPOINTS.TABLET) {
      return { itemsPerRow: GRID_CONSTANTS.COLUMNS.TWO };
    }
    return { itemsPerRow: GRID_CONSTANTS.COLUMNS.ONE };
  },

  planRebalance(
    elementTypes: readonly GridNodeType[],
    itemsPerRow: number,
    initialRemainder: number = 0
  ): RebalancePlanResult {
    const validItemsPerRow = Math.max(1, itemsPerRow);
    if (validItemsPerRow <= 1 || !Array.isArray(elementTypes) || elementTypes.length === 0) {
      return {
        instructions: [],
        finalRemainder: initialRemainder % validItemsPerRow,
        hasPendingSection: false,
        neededForPending: 0,
        pendingSectionIndex: null
      };
    }

    const instructions: RebalanceInstruction[] = [];
    let videoCount = initialRemainder;
    let hasPendingSection = false;
    let neededForPending = 0;
    let pendingSectionIndex: number | null = null;
    const claimedIndices = new Set<number>();

    for (let i = 0; i < elementTypes.length; i++) {
      if (claimedIndices.has(i)) {
        continue;
      }
      const type = elementTypes[i];
      if (type === "item") {
        videoCount++;
      } else if (type === "section") {
        const remainder = videoCount % validItemsPerRow;
        if (remainder !== 0) {
          const needed = validItemsPerRow - remainder;
          const itemsToMove: number[] = [];
          for (let j = i + 1; j < elementTypes.length && itemsToMove.length < needed; j++) {
            if (elementTypes[j] === "item" && !claimedIndices.has(j)) {
              itemsToMove.push(j);
            }
          }
          if (itemsToMove.length === needed) {
            itemsToMove.forEach((idx) => claimedIndices.add(idx));
            instructions.push({
              sectionIndex: i,
              sourceIndices: itemsToMove,
              neededCount: needed
            });
            videoCount += needed;
          } else {
            hasPendingSection = true;
            neededForPending = needed;
            pendingSectionIndex = i;
          }
        }
        videoCount = 0;
      }
    }

    return {
      instructions,
      finalRemainder: videoCount % validItemsPerRow,
      hasPendingSection,
      neededForPending,
      pendingSectionIndex
    };
  }
};
