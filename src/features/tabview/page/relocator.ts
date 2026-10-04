import { PAGE_CONSTANTS } from "./constants";
import { TabsView } from "./tabs-view";
import type { TabKey, RelocationSlot, TabsViewOptions, RouteGeneration, RelocatorRouteOptions } from "./types";

interface ActiveSlotState {
  slot: RelocationSlot;
  element: HTMLElement | null;
  anchor: HTMLElement | null;
  sourceParent: Node | null;
  sourceNextSibling: Node | null;
  fallbackParent: Node | null;
  fallbackNextSibling: Node | null;
  recoveryRoot: HTMLElement | null;
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
    return this.runWithSilenceLock((): HTMLElement => {
      let rightTabs: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
      let wrapper: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);

      if (!wrapper || !wrapper.isConnected) {
        wrapper = document.createElement(PAGE_CONSTANTS.TAGS.SECONDARY_WRAPPER);
        wrapper.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER_WRAPPER;
        wrapper.className = PAGE_CONSTANTS.CLASSES.SECONDARY_WRAPPER;

        const children: Node[] = Array.from(secondaryInner.childNodes);
        for (let i = 0; i < children.length; i++) {
          const child: Node = children[i];
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
    });
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
        anchor: null,
        sourceParent: null,
        sourceNextSibling: null,
        fallbackParent: null,
        fallbackNextSibling: null,
        recoveryRoot: null
      });
    }

    this.tryRelocateSlot(slot.tabKey);
  }

  public tryRelocateSlot(tabKey: TabKey): boolean {
    return this.runWithSilenceLock((): boolean => {
      const slotState: ActiveSlotState | undefined = this.slots.get(tabKey);
      if (!slotState) {
        return false;
      }

      const rightTabs: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
      if (!rightTabs) {
        return false;
      }

      const slot: RelocationSlot = slotState.slot;
      const targetContainer: HTMLElement | null = rightTabs.querySelector<HTMLElement>(slot.targetContainerSelector);
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

      const candidates: NodeListOf<HTMLElement> = document.querySelectorAll<HTMLElement>(slot.sourceSelector);
      let sourceElement: HTMLElement | null = null;
      for (let i: number = 0; i < candidates.length; i++) {
        const el: HTMLElement = candidates[i];
        if (el.closest(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS)) {
          continue;
        }
        if (slot.tabKey === "videos" && el.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)) {
          continue;
        }
        const parentCandidate: HTMLElement | null = el.parentElement?.closest<HTMLElement>(slot.sourceSelector) ?? null;
        if (parentCandidate && !parentCandidate.closest(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS)) {
          continue;
        }
        sourceElement = el;
        break;
      }

      if (!sourceElement) {
        return Boolean(slotState.element && targetContainer.contains(slotState.element));
      }

      const parent: Node | null = sourceElement.parentNode;
      if (!parent) {
        return false;
      }

      if (slotState.element && slotState.element !== sourceElement) {
        const restored: boolean = this.restoreSlotState(slotState);
        if (!restored) {
          return false;
        }
      }

      if (!this.recordOriginalPosition(slotState, sourceElement)) {
        return false;
      }

      targetContainer.replaceChildren(sourceElement);
      slotState.element = sourceElement;
      return true;
    });
  }

  private recordOriginalPosition(slotState: ActiveSlotState, element: HTMLElement): boolean {
    if (slotState.element === element && slotState.sourceParent) {
      return true;
    }

    const sourceParent: Node | null = element.parentNode;
    if (!sourceParent) {
      return false;
    }

    const sourceNextSibling: Node | null = element.nextSibling;
    const fallbackParent: Node | null = sourceParent.parentNode;
    const fallbackNextSibling: Node | null = fallbackParent ? sourceParent.nextSibling : null;
    const anchor: HTMLElement = document.createElement(PAGE_CONSTANTS.TAGS.PLACEHOLDER_ANCHOR);
    anchor.className = `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR} ${slotState.slot.placeholderClass}`;
    anchor.style.display = "none";
    sourceParent.insertBefore(anchor, element);

    slotState.element = element;
    slotState.anchor = anchor;
    slotState.sourceParent = sourceParent;
    slotState.sourceNextSibling = sourceNextSibling;
    slotState.fallbackParent = fallbackParent;
    slotState.fallbackNextSibling = fallbackNextSibling;
    slotState.recoveryRoot = this.findRecoveryRoot(sourceParent);
    return true;
  }

  private findRecoveryRoot(sourceParent: Node): HTMLElement | null {
    let current: Node | null = sourceParent;
    let secondaryInner: HTMLElement | null = null;
    while (current) {
      if (current instanceof HTMLElement) {
        if (current.matches(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER)) {
          return current;
        }
        if (current.matches(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_EXACT)) {
          secondaryInner = current;
        }
      }
      current = current.parentNode;
    }
    return secondaryInner;
  }

  private insertAtOriginalPosition(parent: Node, nextSibling: Node | null, element: HTMLElement): void {
    const insertionPoint: Node | null = nextSibling && nextSibling.parentNode === parent ? nextSibling : null;
    parent.insertBefore(element, insertionPoint);
  }

  private clearSlotState(slotState: ActiveSlotState): void {
    const anchor: HTMLElement | null = slotState.anchor;
    if (anchor?.parentNode) {
      anchor.remove();
    }
    slotState.element = null;
    slotState.anchor = null;
    slotState.sourceParent = null;
    slotState.sourceNextSibling = null;
    slotState.fallbackParent = null;
    slotState.fallbackNextSibling = null;
    slotState.recoveryRoot = null;
  }

  private restoreSlotState(slotState: ActiveSlotState): boolean {
    const element: HTMLElement | null = slotState.element;
    if (!element) {
      this.clearSlotState(slotState);
      return true;
    }

    const anchor: HTMLElement | null = slotState.anchor;
    if (anchor && anchor.isConnected && anchor.parentNode) {
      anchor.parentNode.insertBefore(element, anchor);
      this.clearSlotState(slotState);
      return true;
    }

    const sourceParent: Node | null = slotState.sourceParent;
    if (sourceParent && sourceParent.isConnected) {
      this.insertAtOriginalPosition(sourceParent, slotState.sourceNextSibling, element);
      this.clearSlotState(slotState);
      return true;
    }

    const fallbackParent: Node | null = slotState.fallbackParent;
    if (fallbackParent && fallbackParent.isConnected) {
      this.insertAtOriginalPosition(fallbackParent, slotState.fallbackNextSibling, element);
      this.clearSlotState(slotState);
      return true;
    }

    const recoveryRoot: HTMLElement | null = slotState.recoveryRoot;
    if (recoveryRoot && recoveryRoot.isConnected) {
      recoveryRoot.appendChild(element);
      this.clearSlotState(slotState);
      return true;
    }

    if (element.closest(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS)) {
      return false;
    }

    this.clearSlotState(slotState);
    return true;
  }

  private preserveOwnedContentsOutsideTabs(): void {
    this.runWithSilenceLock((): void => {
      const insertionPoints: Map<HTMLElement, Node | null> = new Map<HTMLElement, Node | null>();
      for (const slotState of this.slots.values()) {
        const element: HTMLElement | null = slotState.element;
        const rightTabs: HTMLElement | null = element?.closest<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS) ?? null;
        const ownerParent: Node | null = rightTabs?.parentNode ?? null;
        if (!element || !rightTabs || !ownerParent) {
          continue;
        }
        const insertionPoint: Node | null = insertionPoints.has(rightTabs)
          ? insertionPoints.get(rightTabs) ?? null
          : rightTabs.nextSibling;
        ownerParent.insertBefore(element, insertionPoint);
        insertionPoints.set(rightTabs, element.nextSibling);
        this.clearSlotState(slotState);
      }
    });
  }

  private hasOwnedContentsInTabs(): boolean {
    for (const slotState of this.slots.values()) {
      if (slotState.element?.closest(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS)) {
        return true;
      }
    }
    return false;
  }

  public sweepSecondary(): void {
    this.runWithSilenceLock((): void => {
      const tabVideos: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
      const rightTabs: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
      if (!tabVideos || !rightTabs) {
        return;
      }

      const existingRelated: HTMLElement | null = tabVideos.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RELATED_SECTION);
      if (existingRelated && !existingRelated.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)) {
        return;
      }

      const secondaryInner: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_EXACT);
      const wrapper: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);

      const containersToScan: HTMLElement[] = [secondaryInner, wrapper].filter(
        (container: HTMLElement | null): container is HTMLElement => container !== null
      );
      for (let cIdx: number = 0; cIdx < containersToScan.length; cIdx++) {
        const container: HTMLElement = containersToScan[cIdx];
        const candidates: NodeListOf<HTMLElement> = container.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RELATED_SECTION);
        for (let i: number = 0; i < candidates.length; i++) {
          const candidate: HTMLElement = candidates[i];
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

          const videosSlot: ActiveSlotState | undefined = this.slots.get("videos");
          if (!videosSlot) {
            continue;
          }
          if (videosSlot.element && videosSlot.element !== directChild) {
            const restored: boolean = this.restoreSlotState(videosSlot);
            if (!restored) {
              continue;
            }
          }
          if (!this.recordOriginalPosition(videosSlot, directChild)) {
            continue;
          }
          tabVideos.replaceChildren(directChild);
          videosSlot.element = directChild;
          return;
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
      const slotState: ActiveSlotState | undefined = this.slots.get(tabKey);
      if (!slotState) {
        return;
      }
      this.restoreSlotState(slotState);
    });
  }

  public unmountRoute(generation: RouteGeneration): void {
    if (this.currentGeneration === generation) {
      if (this.secondaryInnerObserver) {
        this.secondaryInnerObserver.disconnect();
        this.secondaryInnerObserver = null;
      }
      this.restoreAll();
      this.preserveOwnedContentsOutsideTabs();
      const rightTabs: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
      if (!this.hasOwnedContentsInTabs()) {
        this.runWithSilenceLock((): void => this.tabsView.destroy());
      }
      if (rightTabs && !this.hasOwnedContentsInTabs()) {
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

  public isSlotRelocated(tabKey: TabKey): boolean {
    const slotState = this.slots.get(tabKey);
    if (!slotState || !slotState.element || !slotState.element.isConnected) {
      return false;
    }
    const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    if (!rightTabs) {
      return false;
    }
    const targetContainer = rightTabs.querySelector<HTMLElement>(slotState.slot.targetContainerSelector);
    return Boolean(targetContainer && slotState.element.parentElement === targetContainer);
  }

  public destroy(): void {
    if (this.secondaryInnerObserver) {
      this.secondaryInnerObserver.disconnect();
      this.secondaryInnerObserver = null;
    }
    this.currentGeneration = null;
    this.restoreAll();
    this.preserveOwnedContentsOutsideTabs();

    if (this.hasOwnedContentsInTabs()) {
      return;
    }

    this.runWithSilenceLock((): void => {
      this.slots.clear();
      this.tabsView.destroy();

      const rightTabs: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
      if (rightTabs) {
        rightTabs.remove();
      }

      const wrapper: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);
      if (wrapper) {
        const parent: Node | null = wrapper.parentNode;
        if (parent) {
          while (wrapper.firstChild) {
            parent.insertBefore(wrapper.firstChild, wrapper);
          }
        }
        wrapper.remove();
      }
    });
  }
}
