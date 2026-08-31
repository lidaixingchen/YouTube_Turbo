import { GRID_CONSTANTS } from "./constants";
import { GridCalculator, type NodeType } from "./calculator";

export const GridDOMAdapter = (() => {
  let observer: MutationObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let boundDebounce: (() => void) | null = null;
  let boundNavigate: (() => void) | null = null;
  let isInitialized = false;

  const getNodeType = (node: Node): NodeType => {
    if (!node || !(node instanceof HTMLElement)) return "other";
    const tag = node.tagName.toUpperCase();
    if (tag === "YTD-RICH-ITEM-RENDERER") return "item";
    if (tag === "YTD-RICH-SECTION-RENDERER") return "section";
    return "other";
  };

  const rebalance = (): void => {
    const contentsList = document.querySelectorAll<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR);
    if (!contentsList.length) return;
    const { itemsPerRow } = GridCalculator.computeMetrics(window.innerWidth);
    if (itemsPerRow <= 1) return;

    document.documentElement.style.setProperty("--ytd-rich-grid-items-per-row", String(itemsPerRow));

    contentsList.forEach((contents) => {
      const children = Array.from(contents.children);
      const types = children.map(getNodeType);
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
  };

  const debouncedRebalance = (): void => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      rebalance();
    }, GRID_CONSTANTS.DEBOUNCE_DELAY_MS);
  };

  const setupObserver = (): void => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observer = new MutationObserver((mutations: MutationRecord[]) => {
      let hasStructureChange = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasStructureChange = true;
          break;
        }
      }
      if (hasStructureChange) {
        debouncedRebalance();
      }
    });

    const container = document.querySelector<HTMLElement>("ytd-rich-grid-renderer") || document.body || document.documentElement;
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }
  };

  const init = (): void => {
    if (isInitialized) return;
    isInitialized = true;
    boundDebounce = debouncedRebalance;
    boundNavigate = () => {
      setupObserver();
      debouncedRebalance();
    };

    setupObserver();
    window.addEventListener("resize", boundDebounce, { passive: true });
    window.addEventListener("yt-navigate-finish", boundNavigate, { passive: true });
    debouncedRebalance();
  };

  const destroy = (): void => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
    if (boundDebounce) {
      window.removeEventListener("resize", boundDebounce);
      boundDebounce = null;
    }
    if (boundNavigate) {
      window.removeEventListener("yt-navigate-finish", boundNavigate);
      boundNavigate = null;
    }
    document.documentElement.style.removeProperty("--ytd-rich-grid-items-per-row");
    isInitialized = false;
  };

  return {
    init,
    rebalance,
    destroy
  };
})();
