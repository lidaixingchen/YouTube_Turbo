import { PAGE_CONSTANTS } from "./constants";
import { TabsView } from "./tabs-view";
import type { TabKey, RelocationSlot, TabsViewOptions } from "./types";

interface ActiveSlotState {
  slot: RelocationSlot;
  element: HTMLElement | null;
  anchor: HTMLElement | null;
}

export class DOMRelocator {
  private static instance: DOMRelocator | null = null;
  private tabsView: TabsView = new TabsView();
  private slots: Map<TabKey, ActiveSlotState> = new Map();

  public static getInstance(): DOMRelocator {
    if (!DOMRelocator.instance) {
      DOMRelocator.instance = new DOMRelocator();
    }
    return DOMRelocator.instance;
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

  public resetSlotState(): void {
    for (const slotState of this.slots.values()) {
      slotState.element = null;
    }
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
  }

  public sweepSecondary(): void {
    const tabVideos = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
    const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    if (!tabVideos || !rightTabs) {
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

        let directChild: HTMLElement = candidate;
        while (directChild.parentElement && directChild.parentElement !== container) {
          directChild = directChild.parentElement;
        }

        if (
          directChild === rightTabs ||
          directChild.matches(PAGE_CONSTANTS.SELECTORS.SECONDARY_SWEEP_IGNORE)
        ) {
          continue;
        }

        tabVideos.replaceChildren(directChild);
        break;
      }
    }
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
  }

  public getTabsView(): TabsView {
    return this.tabsView;
  }

  public isContainerMounted(): boolean {
    const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    return Boolean(rightTabs && rightTabs.isConnected);
  }

  public destroy(): void {
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

