import { GRID_CONSTANTS } from "./constants";

export type NodeType = "item" | "section" | "other";

export interface RebalanceInstruction {
  sectionIndex: number;
  sourceIndices: number[];
  neededCount: number;
}

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

  planRebalance(elementTypes: NodeType[], itemsPerRow: number): RebalanceInstruction[] {
    if (itemsPerRow <= 1 || !Array.isArray(elementTypes) || elementTypes.length === 0) {
      return [];
    }
    const instructions: RebalanceInstruction[] = [];
    let videoCount = 0;

    for (let i = 0; i < elementTypes.length; i++) {
      const type = elementTypes[i];
      if (type === "item") {
        videoCount++;
      } else if (type === "section") {
        const remainder = videoCount % itemsPerRow;
        if (remainder !== 0) {
          const needed = itemsPerRow - remainder;
          const itemsToMove: number[] = [];
          for (let j = i + 1; j < elementTypes.length && itemsToMove.length < needed; j++) {
            if (elementTypes[j] === "item") {
              itemsToMove.push(j);
            }
          }
          if (itemsToMove.length === needed) {
            instructions.push({
              sectionIndex: i,
              sourceIndices: itemsToMove,
              neededCount: needed
            });
            videoCount += needed;
          }
        }
      }
    }

    return instructions;
  }
};
