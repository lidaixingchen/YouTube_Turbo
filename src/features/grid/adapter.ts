import { GridCoordinator } from "./coordinator";

export const GridDOMAdapter = {
  init(): void {
    GridCoordinator.getInstance().init();
  },
  rebalance(): void {
    GridCoordinator.getInstance().rebalance();
  },
  destroy(): void {
    GridCoordinator.getInstance().destroy();
  }
};
