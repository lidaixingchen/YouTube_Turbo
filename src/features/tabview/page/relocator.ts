import { PAGE_CONSTANTS } from "./constants";
import { TabsView } from "./tabs-view";
import type { TabKey, RelocationSlot, TabsViewOptions, RouteGeneration, RelocatorRouteOptions } from "./types";

interface ActiveSlotState {
  slot: RelocationSlot;
  element: HTMLElement | null;
  anchor: HTMLElement | null;
}

export class DOMRelocator {
  private static instance: DOMRelocator | null = null;
  private tabsView: TabsView = new TabsView();
  private slots: Map<TabKey, ActiveSlotState> = new Map();
  private currentGeneration: RouteGeneration | null = null;
  private secondaryInnerObserver: MutationObserver | null = null;
  private isSilent: boolean = false;

  public static getInstance(): DOMRelocator {
    if (!DOMRelocator.instance) {
      DOMRelocator.instance = new DOMRelocator();
    }
    return DOMRelocator.instance;
  }

  private runWithSilenceLock<T>(action: () => T): T {
    this.isSilent = true;
    try {
      return action();
    } finally {
      this.isSilent = false;
    }
  }

  public mountRoute(options: RelocatorRouteOptions): HTMLElement {
    if (this.currentGeneration !== null && this.currentGeneration !== options.generation) {
      this.unmountRoute(this.currentGeneration);
    }
    this.currentGeneration = options.generation;

    const rightTabs = this.mountTabsContainer(options.secondaryInner, options.tabsOptions);
    this.registerDefaultSlots();

    if (this.secondaryInnerObserver) {
      this.secondaryInnerObserver.disconnect();
      this.secondaryInnerObserver = null;
    }

    const generation = options.generation;
    this.secondaryInnerObserver = new MutationObserver((mutations: MutationRecord[]): void => {
      if (this.isSilent || this.currentGeneration === null || this.currentGeneration !== generation) {
        return;
      }
      let shouldSweep = false;
      for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        for (let j = 0; j < mutation.addedNodes.length; j++) {
          const node = mutation.addedNodes[j];
          if (node instanceof HTMLElement) {
            if (!node.matches(PAGE_CONSTANTS.SELECTORS.SECONDARY_SWEEP_IGNORE)) {
              shouldSweep = true;
              break;
            }
          }
        }
        if (shouldSweep) {
          break;
        }
      }
      if (shouldSweep) {
        this.sweepSecondary();
      }
    });

    this.secondaryInnerObserver.observe(options.secondaryInner, {
      childList: true,
      subtree: false
    });

    return rightTabs;
  }

  public mountTabsContainer(secondaryInner: HTMLElement, tabsOptions: TabsViewOptions): HTMLElement {
    let rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    let wrapper = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);

    if (!wrapper || !wrapper.isConnected) {
      wrapper = document.createElement(PAGE_CONSTANTS.TAGS.SECONDARY_WRAPPER);
      wrapper.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER_WRAPPER;
      wrapper.className = PAGE_CONSTANTS.CLASSES.SECONDARY_WRAPPER;

      const children = Array.from(secondaryInner.childNodes);
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child !== wrapper) {
          wrapper.appendChild(child);
        }
      }
      secondaryInner.insertBefore(wrapper, secondaryInner.firstChild);
    }
    if (!rightTabs || !rightTabs.isConnected) {
      rightTabs = document.createElement(PAGE_CONSTANTS.TAGS.RIGHT_TABS_CONTAINER);
      rightTabs.id = PAGE_CONSTANTS.IDS.RIGHT_TABS;
      wrapper.insertBefore(rightTabs, wrapper.firstChild);
      this.tabsView.render(rightTabs, tabsOptions);
    }

    return rightTabs;
  }

  public registerDefaultSlots(): void {
    this.bindSlot({
      tabKey: "videos",
      sourceSelector: PAGE_CONSTANTS.SELECTORS.RELATED_SECTION,
      targetContainerSelector: PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER,
      placeholderClass: `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}-videos`
    });

    this.bindSlot({
      tabKey: "comments",
      sourceSelector: PAGE_CONSTANTS.SELECTORS.COMMENTS_SECTION,
      targetContainerSelector: PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER,
      placeholderClass: `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}-comments`
    });

    this.bindSlot({
      tabKey: "playlist",
      sourceSelector: PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL,
      targetContainerSelector: PAGE_CONSTANTS.SELECTORS.TAB_PLAYLIST_CONTAINER,
      placeholderClass: `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}-playlist`
    });
  }

  public bindSlot(slot: RelocationSlot): void {
    if (!this.slots.has(slot.tabKey)) {
      this.slots.set(slot.tabKey, {
        slot,
        element: null,
        anchor: null
      });
    }

    this.tryRelocateSlot(slot.tabKey);
  }

  public tryRelocateSlot(tabKey: TabKey): boolean {
    return this.runWithSilenceLock((): boolean => {
      const slotState = this.slots.get(tabKey);
      if (!slotState) {
        return false;
      }

      const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
      if (!rightTabs) {
        return false;
      }

      const { slot } = slotState;
      const targetContainer = rightTabs.querySelector<HTMLElement>(slot.targetContainerSelector);
      if (!targetContainer) {
        return false;
      }

      if (
        slotState.element &&
        slotState.element.isConnected &&
        slotState.element.parentElement === targetContainer
      ) {
        return true;
      }

      const candidates = document.querySelectorAll<HTMLElement>(slot.sourceSelector);
      let sourceElement: HTMLElement | null = null;
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (el.closest(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS)) {
          continue;
        }
        if (el.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)) {
          continue;
        }
        const parentCandidate = el.parentElement?.closest<HTMLElement>(slot.sourceSelector);
        if (parentCandidate && !parentCandidate.closest(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS)) {
          continue;
        }
        sourceElement = el;
        break;
      }

      if (!sourceElement) {
        return Boolean(slotState.element && targetContainer.contains(slotState.element));
      }

      const parent = sourceElement.parentNode;
      if (!parent) {
        return false;
      }

      let anchor = slotState.anchor;
      if (!anchor || !anchor.isConnected) {
        anchor = document.createElement(PAGE_CONSTANTS.TAGS.PLACEHOLDER_ANCHOR);
        anchor.className = `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR} ${slot.placeholderClass}`;
        anchor.style.display = "none";
        parent.insertBefore(anchor, sourceElement);
        slotState.anchor = anchor;
      }

      targetContainer.replaceChildren(sourceElement);
      slotState.element = sourceElement;
      return true;
    });
  }

  public sweepSecondary(): void {
    this.runWithSilenceLock((): void => {
      const tabVideos = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
      const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
      if (!tabVideos || !rightTabs) {
        return;
      }

      const existingRelated = tabVideos.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RELATED_SECTION);
      if (existingRelated && !existingRelated.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)) {
        return;
      }

      const secondaryInner = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_EXACT);
      const wrapper = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);

      const containersToScan = [secondaryInner, wrapper].filter(Boolean) as HTMLElement[];
      for (let cIdx = 0; cIdx < containersToScan.length; cIdx++) {
        const container = containersToScan[cIdx];
        const candidates = container.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RELATED_SECTION);
        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i];
          if (rightTabs.contains(candidate)) {
            continue;
          }
          if (candidate.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)) {
            continue;
          }

          let directChild: HTMLElement = candidate;
          while (directChild.parentElement && directChild.parentElement !== container) {
            directChild = directChild.parentElement;
          }

          if (
            directChild === rightTabs ||
            directChild.matches(PAGE_CONSTANTS.SELECTORS.SECONDARY_SWEEP_IGNORE) ||
            directChild.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)
          ) {
            continue;
          }

          tabVideos.replaceChildren(directChild);
          const videosSlot = this.slots.get("videos");
          if (videosSlot) {
            videosSlot.element = directChild;
          }
          break;
        }
      }
    });
  }

  public refreshAllSlots(): void {
    for (const tabKey of this.slots.keys()) {
      this.tryRelocateSlot(tabKey);
    }
    this.sweepSecondary();
  }

  public restoreAll(): void {
    for (const tabKey of this.slots.keys()) {
      this.restoreSlot(tabKey);
    }
  }

  public restoreSlot(tabKey: TabKey): void {
    this.runWithSilenceLock((): void => {
      const slotState = this.slots.get(tabKey);
      if (!slotState) {
        return;
      }

      const { element, anchor } = slotState;
      if (element && anchor && anchor.isConnected && anchor.parentNode) {
        anchor.parentNode.insertBefore(element, anchor);
        anchor.remove();
      }

      slotState.element = null;
      slotState.anchor = null;
    });
  }

  public unmountRoute(generation: RouteGeneration): void {
    if (this.currentGeneration === generation) {
      if (this.secondaryInnerObserver) {
        this.secondaryInnerObserver.disconnect();
        this.secondaryInnerObserver = null;
      }
      this.restoreAll();
      const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
      if (rightTabs) {
        rightTabs.remove();
      }
      this.currentGeneration = null;
    }
  }

  public getTabsView(): TabsView {
    return this.tabsView;
  }

  public isContainerMounted(): boolean {
    const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    return Boolean(rightTabs && rightTabs.isConnected);
  }

  public destroy(): void {
    if (this.secondaryInnerObserver) {
      this.secondaryInnerObserver.disconnect();
      this.secondaryInnerObserver = null;
    }
    this.currentGeneration = null;
    this.restoreAll();
    this.slots.clear();
    this.tabsView.destroy();

    const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    if (rightTabs) {
      rightTabs.remove();
    }

    const wrapper = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);
    if (wrapper) {
      const parent = wrapper.parentNode;
      if (parent) {
        while (wrapper.firstChild) {
          parent.insertBefore(wrapper.firstChild, wrapper);
        }
      }
      wrapper.remove();
    }
  }
}
