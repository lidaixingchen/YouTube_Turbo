import { GRID_CONSTANTS } from "./constants";
import { GridCalculator, type NodeType } from "./calculator";
import { ScopedGridObserver } from "./scoped-observer";
import { StyleEngine } from "../../core/style-engine";

export class GridCoordinator {
  private static instance: GridCoordinator | null = null;
  private static readonly STYLE_ID = "four-column-grid";

  private scopedObserver: ScopedGridObserver = new ScopedGridObserver();
  private tempMountObserver: MutationObserver | null = null;
  private mediaQueryCleanups: Array<() => void> = [];
  private navigateHandler: (() => void) | null = null;
  private targetContents: HTMLElement | null = null;
  private isInitialized = false;

  public static readonly GRID_CSS = `
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
  `;

  public static getInstance(): GridCoordinator {
    if (!this.instance) {
      this.instance = new GridCoordinator();
    }
    return this.instance;
  }

  public init(): void {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    StyleEngine.inject(GridCoordinator.STYLE_ID, GridCoordinator.GRID_CSS);
    this.setupBreakpointListeners();
    this.mountTargetObserver();

    if (!this.navigateHandler) {
      this.navigateHandler = () => {
        this.mountTargetObserver();
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler, { passive: true });
    }
  }

  private getNodeType(node: Node): NodeType {
    if (!node || !(node instanceof HTMLElement)) return "other";
    const tag = node.tagName.toUpperCase();
    if (tag === "YTD-RICH-ITEM-RENDERER") return "item";
    if (tag === "YTD-RICH-SECTION-RENDERER") return "section";
    return "other";
  }

  private setupBreakpointListeners(): void {
    this.clearBreakpointListeners();

    const queries = [
      `(min-width: ${GRID_CONSTANTS.BREAKPOINTS.WIDE_DESKTOP}px)`,
      `(min-width: ${GRID_CONSTANTS.BREAKPOINTS.DESKTOP}px) and (max-width: ${GRID_CONSTANTS.BREAKPOINTS.WIDE_DESKTOP - 1}px)`,
      `(min-width: ${GRID_CONSTANTS.BREAKPOINTS.TABLET}px) and (max-width: ${GRID_CONSTANTS.BREAKPOINTS.DESKTOP - 1}px)`,
      `(max-width: ${GRID_CONSTANTS.BREAKPOINTS.TABLET - 1}px)`
    ];

    queries.forEach((q) => {
      const mql = window.matchMedia(q);
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          this.rebalance();
        }
      };
      mql.addEventListener("change", handler);
      this.mediaQueryCleanups.push(() => mql.removeEventListener("change", handler));
    });
  }

  private clearBreakpointListeners(): void {
    this.mediaQueryCleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (err) {
        console.error("[GridCoordinator] Error clearing breakpoint listener:", err);
      }
    });
    this.mediaQueryCleanups = [];
  }

  private mountTargetObserver(): void {
    const directContents = document.querySelector<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR);
    if (directContents) {
      this.bindScopedObserver(directContents);
      this.rebalance();
      return;
    }

    if (this.tempMountObserver) {
      this.tempMountObserver.disconnect();
      this.tempMountObserver = null;
    }

    const hostContainer = document.querySelector<HTMLElement>("#primary, ytd-browse[page-subtype='home'], ytd-browse");
    if (!hostContainer) return;

    this.tempMountObserver = new MutationObserver(() => {
      const contents = document.querySelector<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR);
      if (contents) {
        if (this.tempMountObserver) {
          this.tempMountObserver.disconnect();
          this.tempMountObserver = null;
        }
        this.bindScopedObserver(contents);
        this.rebalance();
      }
    });

    this.tempMountObserver.observe(hostContainer, {
      childList: true,
      subtree: true
    });
  }

  private bindScopedObserver(contents: HTMLElement): void {
    this.targetContents = contents;
    this.scopedObserver.observe(contents, () => {
      this.rebalance();
    });
  }

  public getItemsPerRow(): number {
    return GridCalculator.computeMetrics(window.innerWidth).itemsPerRow;
  }

  public rebalance(): void {
    const contents = this.targetContents || document.querySelector<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR);
    if (!contents) return;

    const itemsPerRow = this.getItemsPerRow();
    if (itemsPerRow <= 1) return;

    this.scopedObserver.runWithSilence(() => {
      const children = Array.from(contents.children);
      const types = children.map((n) => this.getNodeType(n));
      const instructions = GridCalculator.planRebalance(types, itemsPerRow);

      instructions.forEach((instruction) => {
        const sectionEl = children[instruction.sectionIndex];
        if (!sectionEl) return;
        instruction.sourceIndices.forEach((sourceIdx) => {
          const itemEl = children[sourceIdx];
          if (itemEl && itemEl.parentNode === contents) {
            contents.insertBefore(itemEl, sectionEl);
          }
        });
      });
    });
  }

  public destroy(): void {
    this.clearBreakpointListeners();
    this.scopedObserver.disconnect();
    if (this.tempMountObserver) {
      this.tempMountObserver.disconnect();
      this.tempMountObserver = null;
    }
    if (this.navigateHandler) {
      window.removeEventListener("yt-navigate-finish", this.navigateHandler);
      this.navigateHandler = null;
    }
    this.targetContents = null;
    StyleEngine.remove(GridCoordinator.STYLE_ID);
    this.isInitialized = false;
  }
}
