import { GRID_CONSTANTS } from "./constants";
import { GridCalculator } from "./calculator";
import { GridDOMAdapter } from "./adapter";
import { StyleEngine } from "../../core/style-engine";

export * from "./constants";
export * from "./calculator";
export * from "./adapter";

export const FourColumnGrid = {
  css: `
    ytd-rich-grid-renderer > #contents > ytd-rich-grid-row,
    ytd-rich-grid-renderer > #contents > ytd-rich-grid-row > #contents {
      display: contents !important;
    }
    ytd-rich-shelf-renderer #contents,
    ytd-rich-shelf-renderer ytd-rich-grid-row,
    ytd-rich-shelf-renderer #contents.ytd-rich-grid-row {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
      scrollbar-width: none !important;
      width: 100% !important;
    }
    ytd-rich-shelf-renderer ytd-rich-item-renderer[is-slim_],
    ytd-rich-shelf-renderer ytd-rich-item-renderer[is-slim] {
      flex: 0 0 calc(100% / var(--ytd-rich-grid-slim-items-per-row, ${GRID_CONSTANTS.SLIM_COLUMNS.SIX}) - var(--ytd-rich-grid-item-margin, ${GRID_CONSTANTS.ITEM_MARGIN_PX}px)) !important;
      width: calc(100% / var(--ytd-rich-grid-slim-items-per-row, ${GRID_CONSTANTS.SLIM_COLUMNS.SIX}) - var(--ytd-rich-grid-item-margin, ${GRID_CONSTANTS.ITEM_MARGIN_PX}px)) !important;
      max-width: calc(100% / var(--ytd-rich-grid-slim-items-per-row, ${GRID_CONSTANTS.SLIM_COLUMNS.SIX}) - var(--ytd-rich-grid-item-margin, ${GRID_CONSTANTS.ITEM_MARGIN_PX}px)) !important;
    }
    ytd-rich-section-renderer {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      display: block !important;
    }
    @media (min-width: ${GRID_CONSTANTS.BREAKPOINTS.WIDE_DESKTOP}px) {
      ytd-rich-grid-renderer,
      ytd-rich-grid-renderer #contents,
      html {
        --ytd-rich-grid-items-per-row: ${GRID_CONSTANTS.COLUMNS.FOUR} !important;
        --ytd-rich-grid-posts-per-row: ${GRID_CONSTANTS.COLUMNS.FOUR} !important;
        --ytd-rich-grid-slim-items-per-row: ${GRID_CONSTANTS.SLIM_COLUMNS.SIX} !important;
      }
    }
    @media (min-width: ${GRID_CONSTANTS.BREAKPOINTS.DESKTOP}px) and (max-width: ${GRID_CONSTANTS.BREAKPOINTS.WIDE_DESKTOP - 1}px) {
      ytd-rich-grid-renderer,
      ytd-rich-grid-renderer #contents,
      html {
        --ytd-rich-grid-items-per-row: ${GRID_CONSTANTS.COLUMNS.THREE} !important;
        --ytd-rich-grid-posts-per-row: ${GRID_CONSTANTS.COLUMNS.THREE} !important;
        --ytd-rich-grid-slim-items-per-row: ${GRID_CONSTANTS.SLIM_COLUMNS.FIVE} !important;
      }
    }
    @media (min-width: ${GRID_CONSTANTS.BREAKPOINTS.TABLET}px) and (max-width: ${GRID_CONSTANTS.BREAKPOINTS.DESKTOP - 1}px) {
      ytd-rich-grid-renderer,
      ytd-rich-grid-renderer #contents,
      html {
        --ytd-rich-grid-items-per-row: ${GRID_CONSTANTS.COLUMNS.TWO} !important;
        --ytd-rich-grid-posts-per-row: ${GRID_CONSTANTS.COLUMNS.TWO} !important;
        --ytd-rich-grid-slim-items-per-row: ${GRID_CONSTANTS.SLIM_COLUMNS.THREE} !important;
      }
    }
    @media (max-width: ${GRID_CONSTANTS.BREAKPOINTS.TABLET - 1}px) {
      ytd-rich-grid-renderer,
      ytd-rich-grid-renderer #contents,
      html {
        --ytd-rich-grid-items-per-row: ${GRID_CONSTANTS.COLUMNS.ONE} !important;
        --ytd-rich-grid-posts-per-row: ${GRID_CONSTANTS.COLUMNS.ONE} !important;
        --ytd-rich-grid-slim-items-per-row: ${GRID_CONSTANTS.SLIM_COLUMNS.TWO} !important;
      }
    }
  `,

  getItemsPerRow(): number {
    return GridCalculator.computeMetrics(window.innerWidth).itemsPerRow;
  },

  balanceGrid(): void {
    GridDOMAdapter.rebalance();
  },

  startObserver(): void {
    GridDOMAdapter.init();
  },

  run(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    StyleEngine.inject("four-column-grid", this.css);
    GridDOMAdapter.init();
  },

  destroy(): void {
    StyleEngine.remove("four-column-grid");
    GridDOMAdapter.destroy();
  }
};
