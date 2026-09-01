import { GridCoordinator } from "./coordinator";

export * from "./constants";
export * from "./calculator";
export * from "./scoped-observer";
export * from "./coordinator";
export * from "./adapter";

export const FourColumnGrid = {
  css: GridCoordinator.GRID_CSS,

  getItemsPerRow(): number {
    return GridCoordinator.getInstance().getItemsPerRow();
  },

  balanceGrid(): void {
    GridCoordinator.getInstance().rebalance();
  },

  startObserver(): void {
    GridCoordinator.getInstance().init();
  },

  run(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    GridCoordinator.getInstance().init();
  },

  destroy(): void {
    GridCoordinator.getInstance().destroy();
  }
};
