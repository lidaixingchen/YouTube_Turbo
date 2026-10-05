import { describe, it, expect } from "vitest";
import { GridCalculator } from "../calculator";
import { GRID_CONSTANTS } from "../constants";
import type { GridNodeType } from "../types";

describe("GridCalculator", () => {
  describe("computeMetrics", () => {
    it("computes items per row correctly for various window breakpoints", () => {
      expect(GridCalculator.computeMetrics(1200).itemsPerRow).toBe(GRID_CONSTANTS.COLUMNS.FOUR);
      expect(GridCalculator.computeMetrics(1100).itemsPerRow).toBe(GRID_CONSTANTS.COLUMNS.FOUR);
      expect(GridCalculator.computeMetrics(1099).itemsPerRow).toBe(GRID_CONSTANTS.COLUMNS.THREE);
      expect(GridCalculator.computeMetrics(850).itemsPerRow).toBe(GRID_CONSTANTS.COLUMNS.THREE);
      expect(GridCalculator.computeMetrics(849).itemsPerRow).toBe(GRID_CONSTANTS.COLUMNS.TWO);
      expect(GridCalculator.computeMetrics(550).itemsPerRow).toBe(GRID_CONSTANTS.COLUMNS.TWO);
      expect(GridCalculator.computeMetrics(549).itemsPerRow).toBe(GRID_CONSTANTS.COLUMNS.ONE);
      expect(GridCalculator.computeMetrics(320).itemsPerRow).toBe(GRID_CONSTANTS.COLUMNS.ONE);
    });
  });

  describe("planRebalance", () => {
    it("returns empty instructions when itemsPerRow is 1 or less", () => {
      const types: GridNodeType[] = ["item", "item", "section", "item"];
      const result = GridCalculator.planRebalance(types, 1);
      expect(result.instructions).toEqual([]);
      expect(result.hasPendingSection).toBe(false);
      expect(result.hasMultiplePendingSections).toBe(false);
      expect(result.finalRemainder).toBe(0);
    });

    it("returns empty instructions when elementTypes is empty", () => {
      const result = GridCalculator.planRebalance([], 4);
      expect(result.instructions).toEqual([]);
      expect(result.finalRemainder).toBe(0);
      expect(result.hasPendingSection).toBe(false);
      expect(result.hasMultiplePendingSections).toBe(false);
    });

    it("produces zero instructions when items perfectly align before section", () => {
      // 4 items before section in a 4-column layout
      const types: GridNodeType[] = ["item", "item", "item", "item", "section", "item", "item"];
      const result = GridCalculator.planRebalance(types, 4);
      expect(result.instructions).toEqual([]);
      expect(result.finalRemainder).toBe(2);
      expect(result.hasPendingSection).toBe(false);
    });

    it("plans forward relocation when items before section require filling to complete row", () => {
      // 3 items before section -> needs 1 item from after section
      const types: GridNodeType[] = ["item", "item", "item", "section", "item", "item", "item"];
      const result = GridCalculator.planRebalance(types, 4);

      expect(result.instructions).toHaveLength(1);
      expect(result.instructions[0]).toEqual({
        sectionIndex: 3,
        sourceIndices: [4],
        neededCount: 1
      });
      // Section resets row; remaining items after section are 2 (since 1 was moved before section)
      expect(result.finalRemainder).toBe(2);
      expect(result.hasPendingSection).toBe(false);
    });

    it("handles multiple sections in sequence correctly with independent row resets", () => {
      // Section 1 at index 2: 2 items before -> needs 2 items (indices 3, 4)
      // Then Section 2 at index 5: 0 items before -> needs 0 items
      // Followed by 3 items
      const types: GridNodeType[] = [
        "item", "item",
        "section",
        "item", "item",
        "section",
        "item", "item", "item"
      ];
      const result = GridCalculator.planRebalance(types, 4);

      expect(result.instructions).toHaveLength(1);
      expect(result.instructions[0]).toEqual({
        sectionIndex: 2,
        sourceIndices: [3, 4],
        neededCount: 2
      });
      expect(result.finalRemainder).toBe(3);
      expect(result.hasPendingSection).toBe(false);
    });

    it("flags hasPendingSection when insufficient items follow a section to complete row", () => {
      // 2 items before section -> needs 2 items, but only 1 follows
      const types: GridNodeType[] = ["item", "item", "section", "item"];
      const result = GridCalculator.planRebalance(types, 4);

      expect(result.instructions).toHaveLength(0);
      expect(result.hasPendingSection).toBe(true);
      expect(result.hasMultiplePendingSections).toBe(false);
      expect(result.finalRemainder).toBe(1);
    });

    it("marks a plan with multiple unresolved sections for full recomputation", () => {
      const types: GridNodeType[] = ["item", "item", "section", "item", "section"];
      const result = GridCalculator.planRebalance(types, GRID_CONSTANTS.COLUMNS.FOUR);

      expect(result.hasPendingSection).toBe(true);
      expect(result.hasMultiplePendingSections).toBe(true);
      expect(result.pendingSectionIndex).toBe(types.length - 1);
    });

    it("takes initialRemainder into account for incremental batches", () => {
      // Previous batch left tailRemainder = 2; new batch starts with Section
      const types: GridNodeType[] = ["section", "item", "item", "item"];
      const result = GridCalculator.planRebalance(types, 4, 2);

      // Section needs 4 - 2 = 2 items
      expect(result.instructions).toHaveLength(1);
      expect(result.instructions[0]).toEqual({
        sectionIndex: 0,
        sourceIndices: [1, 2],
        neededCount: 2
      });
      expect(result.finalRemainder).toBe(1);
      expect(result.hasPendingSection).toBe(false);
    });
  });
});
