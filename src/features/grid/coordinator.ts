import { GRID_CONSTANTS } from "./constants";
import { GridCalculator } from "./calculator";
import { ScopedGridObserver, type MutationBatchSummary } from "./scoped-observer";
import { StyleEngine } from "../../core/style-engine";
import type { GridNodeType, TailBalanceState } from "./types";

export class GridCoordinator {
  private static instance: GridCoordinator | null = null;
  private static readonly STYLE_ID = "four-column-grid";

  private scopedObserver: ScopedGridObserver = new ScopedGridObserver();
  private tempMountObserver: MutationObserver | null = null;
  private mediaQueryCleanups: Array<() => void> = [];
  private navigateHandler: (() => void) | null = null;
  private targetContents: HTMLElement | null = null;
  private isInitialized: boolean = false;
  private isRebalanceScheduled: boolean = false;
  private pendingForceFull: boolean = false;
  private pendingAddedNodes: Node[] = [];

  private tailState: TailBalanceState = {
    tailRemainder: 0,
    pendingSection: null,
    neededForPending: 0
  };
  private isBalanced: boolean = false;
  private anchorMap: Map<HTMLElement, Comment> = new Map();

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
        this.resetState();
        this.mountTargetObserver();
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler, { passive: true });
    }
  }

  public getNodeType(node: Node | null): GridNodeType {
    if (!node || !(node instanceof HTMLElement)) {
      return "other";
    }
    const tag = node.nodeName;
    if (tag === GRID_CONSTANTS.NODE_NAMES.ITEM) {
      return "item";
    }
    if (tag === GRID_CONSTANTS.NODE_NAMES.SECTION) {
      return "section";
    }
    return "other";
  }

  public getItemsPerRow(): number {
    return GridCalculator.computeMetrics(window.innerWidth).itemsPerRow;
  }

  public getTailState(): Readonly<TailBalanceState> {
    return this.tailState;
  }

  public getAnchorCount(): number {
    return this.anchorMap.size;
  }

  public scheduleRebalance(forceFull: boolean = false, addedNodes: Node[] = []): void {
    this.pendingForceFull = this.pendingForceFull || forceFull;
    if (addedNodes.length > 0) {
      this.pendingAddedNodes.push(...addedNodes);
    }

    if (this.isRebalanceScheduled) {
      return;
    }
    this.isRebalanceScheduled = true;

    queueMicrotask(() => {
      this.isRebalanceScheduled = false;
      const full = this.pendingForceFull;
      const added = [...this.pendingAddedNodes];
      this.pendingForceFull = false;
      this.pendingAddedNodes = [];

      if (full || !this.isBalanced) {
        this.rebalanceFull();
      } else {
        this.rebalanceIncremental(added);
      }
    });
  }

  public rebalance(): void {
    this.rebalanceFull();
  }

  public revertToNative(): void {
    const contents = this.targetContents || document.querySelector<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR);
    if (!contents) {
      return;
    }
    this.revertAllRelocations(contents);
  }

  private revertAllRelocations(contents: HTMLElement): void {
    if (this.anchorMap.size === 0) {
      return;
    }
    this.scopedObserver.runWithSilence(() => {
      this.anchorMap.forEach((anchor, itemEl) => {
        if (anchor.parentNode === contents) {
          if (itemEl.isConnected && itemEl.parentNode === contents) {
            contents.insertBefore(itemEl, anchor);
          }
          anchor.remove();
        }
        itemEl.removeAttribute(GRID_CONSTANTS.DATA_ATTRS.REBALANCED);
      });
      this.anchorMap.clear();
    });
  }

  private rebalanceFull(): void {
    const contents = this.targetContents || document.querySelector<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR);
    if (!contents) {
      return;
    }

    const itemsPerRow = this.getItemsPerRow();
    if (itemsPerRow <= 1) {
      this.revertAllRelocations(contents);
      this.tailState = { tailRemainder: 0, pendingSection: null, neededForPending: 0 };
      this.isBalanced = true;
      return;
    }

    this.revertAllRelocations(contents);

    const children = Array.from(contents.children);
    const types: GridNodeType[] = children.map((child) => this.getNodeType(child));
    const plan = GridCalculator.planRebalance(types, itemsPerRow, 0);

    this.scopedObserver.runWithSilence(() => {
      plan.instructions.forEach((instruction) => {
        const sectionEl = children[instruction.sectionIndex] as HTMLElement;
        if (!sectionEl) {
          return;
        }
        instruction.sourceIndices.forEach((sourceIdx) => {
          const itemEl = children[sourceIdx] as HTMLElement;
          if (itemEl && itemEl.parentNode === contents) {
            const anchor = document.createComment(GRID_CONSTANTS.ANCHOR_TEXT);
            contents.insertBefore(anchor, itemEl);
            this.anchorMap.set(itemEl, anchor);
            itemEl.setAttribute(GRID_CONSTANTS.DATA_ATTRS.REBALANCED, "true");

            if (itemEl.nextElementSibling !== sectionEl) {
              contents.insertBefore(itemEl, sectionEl);
            }
          }
        });
      });
    });

    const pendingSectionEl: HTMLElement | null =
      plan.pendingSectionIndex !== null ? (children[plan.pendingSectionIndex] as HTMLElement) : null;

    this.tailState = {
      tailRemainder: plan.finalRemainder,
      pendingSection: pendingSectionEl,
      neededForPending: plan.neededForPending
    };
    this.isBalanced = true;
  }

  private rebalanceIncremental(addedNodes: Node[]): void {
    const contents = this.targetContents || document.querySelector<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR);
    if (!contents) {
      return;
    }

    const itemsPerRow = this.getItemsPerRow();
    if (itemsPerRow <= 1) {
      return;
    }

    const validNewElements: HTMLElement[] = [];
    const validNewTypes: GridNodeType[] = [];

    for (let i = 0; i < addedNodes.length; i++) {
      const node = addedNodes[i];
      if (node instanceof HTMLElement && node.parentNode === contents) {
        const type = this.getNodeType(node);
        if (type === "item" || type === "section") {
          validNewElements.push(node);
          validNewTypes.push(type);
        }
      }
    }

    if (validNewElements.length === 0) {
      return;
    }

    const hasNewSection = validNewTypes.includes("section");
    const hasPendingSection = Boolean(this.tailState.pendingSection && this.tailState.pendingSection.parentNode === contents);

    if (hasPendingSection && this.tailState.pendingSection) {
      const sectionEl = this.tailState.pendingSection;
      const needed = this.tailState.neededForPending;
      const itemsToMove: HTMLElement[] = [];
      let cur: Element | null = sectionEl.nextElementSibling;

      while (cur && itemsToMove.length < needed) {
        if (this.getNodeType(cur) === "item") {
          itemsToMove.push(cur as HTMLElement);
        } else if (this.getNodeType(cur) === "section") {
          break;
        }
        cur = cur.nextElementSibling;
      }

      if (itemsToMove.length === needed) {
        this.scopedObserver.runWithSilence(() => {
          itemsToMove.forEach((itemEl) => {
            const anchor = document.createComment(GRID_CONSTANTS.ANCHOR_TEXT);
            contents.insertBefore(anchor, itemEl);
            this.anchorMap.set(itemEl, anchor);
            itemEl.setAttribute(GRID_CONSTANTS.DATA_ATTRS.REBALANCED, "true");
            contents.insertBefore(itemEl, sectionEl);
          });
        });
        this.tailState.pendingSection = null;
        this.tailState.neededForPending = 0;

        let remainingCount = 0;
        let foundNextSection: HTMLElement | null = null;
        while (cur) {
          const type = this.getNodeType(cur);
          if (type === "item") {
            remainingCount++;
          } else if (type === "section") {
            foundNextSection = cur as HTMLElement;
            break;
          }
          cur = cur.nextElementSibling;
        }

        if (foundNextSection) {
          this.rebalanceFull();
        } else {
          this.tailState.tailRemainder = remainingCount % itemsPerRow;
        }
        return;
      } else if (hasNewSection) {
        this.rebalanceFull();
        return;
      }
    }

    if (!hasNewSection && !hasPendingSection) {
      this.tailState.tailRemainder = (this.tailState.tailRemainder + validNewElements.length) % itemsPerRow;
      return;
    }

    if (hasNewSection) {
      const plan = GridCalculator.planRebalance(validNewTypes, itemsPerRow, this.tailState.tailRemainder);

      if (plan.instructions.length > 0) {
        this.scopedObserver.runWithSilence(() => {
          plan.instructions.forEach((instruction) => {
            const sectionEl = validNewElements[instruction.sectionIndex];
            if (!sectionEl) return;
            instruction.sourceIndices.forEach((sourceIdx) => {
              const itemEl = validNewElements[sourceIdx];
              if (itemEl && itemEl.parentNode === contents) {
                const anchor = document.createComment(GRID_CONSTANTS.ANCHOR_TEXT);
                contents.insertBefore(anchor, itemEl);
                this.anchorMap.set(itemEl, anchor);
                itemEl.setAttribute(GRID_CONSTANTS.DATA_ATTRS.REBALANCED, "true");
                contents.insertBefore(itemEl, sectionEl);
              }
            });
          });
        });
      }

      const pendingSectionEl: HTMLElement | null =
        plan.pendingSectionIndex !== null ? validNewElements[plan.pendingSectionIndex] : null;

      this.tailState = {
        tailRemainder: plan.finalRemainder,
        pendingSection: pendingSectionEl,
        neededForPending: plan.neededForPending
      };
    }
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
          this.scheduleRebalance(true);
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
      this.scheduleRebalance(true);
      return;
    }

    if (this.tempMountObserver) {
      this.tempMountObserver.disconnect();
      this.tempMountObserver = null;
    }

    const hostContainer = document.querySelector<HTMLElement>(GRID_CONSTANTS.HOST_CONTAINER_SELECTOR);
    if (!hostContainer) return;

    this.tempMountObserver = new MutationObserver(() => {
      const contents = document.querySelector<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR);
      if (contents) {
        if (this.tempMountObserver) {
          this.tempMountObserver.disconnect();
          this.tempMountObserver = null;
        }
        this.bindScopedObserver(contents);
        this.scheduleRebalance(true);
      }
    });

    this.tempMountObserver.observe(hostContainer, {
      childList: true,
      subtree: true
    });
  }

  private bindScopedObserver(contents: HTMLElement): void {
    this.targetContents = contents;
    this.scopedObserver.observe(contents, (summary: MutationBatchSummary) => {
      if (summary.hasRemoved) {
        this.scheduleRebalance(true);
      } else if (summary.hasAdded) {
        this.scheduleRebalance(false, summary.addedNodes);
      }
    });
  }

  private resetState(): void {
    if (this.targetContents) {
      this.revertAllRelocations(this.targetContents);
    }
    this.anchorMap.clear();
    this.tailState = { tailRemainder: 0, pendingSection: null, neededForPending: 0 };
    this.isBalanced = false;
    this.targetContents = null;
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
    this.resetState();
    this.isRebalanceScheduled = false;
    this.pendingForceFull = false;
    this.pendingAddedNodes = [];
    StyleEngine.remove(GridCoordinator.STYLE_ID);
    this.isInitialized = false;
  }
}
