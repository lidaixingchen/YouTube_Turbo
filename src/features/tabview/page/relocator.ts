import { PAGE_CONSTANTS } from "./constants";
import { PolymerPatcher } from "./polymer-patcher";
import { ObserverRegistry } from "./observer-registry";
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
  private rightTabsContainer: HTMLElement | null = null;
  private secondaryWrapper: HTMLElement | null = null;
  private slots: Map<TabKey, ActiveSlotState> = new Map();
  private observerRegistry: ObserverRegistry = ObserverRegistry.getInstance();
  private polymerPatcher: PolymerPatcher = PolymerPatcher.getInstance();

  public static getInstance(): DOMRelocator {
    if (!DOMRelocator.instance) {
      DOMRelocator.instance = new DOMRelocator();
    }
    return DOMRelocator.instance;
  }

  public mountTabsContainer(tabsOptions: TabsViewOptions): HTMLElement | null {
    if (this.rightTabsContainer && this.rightTabsContainer.isConnected) {
      return this.rightTabsContainer;
    }

    const secondaryInner = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER);
    if (!secondaryInner) {
      return null;
    }

    let wrapper = secondaryInner.querySelector<HTMLElement>("secondary-wrapper#secondary-inner-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("secondary-wrapper");
      wrapper.id = "secondary-inner-wrapper";
      secondaryInner.appendChild(wrapper);
    }
    this.secondaryWrapper = wrapper;

    let rightTabs = wrapper.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    if (!rightTabs) {
      rightTabs = document.createElement("div");
      rightTabs.id = "right-tabs";
      wrapper.appendChild(rightTabs);
    }
    this.rightTabsContainer = rightTabs;

    this.tabsView.render(rightTabs, tabsOptions);
    return rightTabs;
  }

  public registerDefaultSlots(): void {
    this.bindSlot({
      tabKey: "comments",
      sourceSelector: PAGE_CONSTANTS.SELECTORS.COMMENTS_SECTION,
      targetContainerSelector: PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER,
      placeholderClass: `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}-comments`
    });

    this.bindSlot({
      tabKey: "videos",
      sourceSelector: PAGE_CONSTANTS.SELECTORS.RELATED_SECTION,
      targetContainerSelector: PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER,
      placeholderClass: `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}-videos`
    });

    this.bindSlot({
      tabKey: "playlist",
      sourceSelector: PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL,
      targetContainerSelector: PAGE_CONSTANTS.SELECTORS.TAB_PLAYLIST_CONTAINER,
      placeholderClass: `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}-playlist`
    });

    this.bindSlot({
      tabKey: "info",
      sourceSelector: PAGE_CONSTANTS.SELECTORS.WATCH_METADATA,
      targetContainerSelector: PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER,
      placeholderClass: `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}-info`
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

    const observerId = `slot-watcher-${slot.tabKey}`;
    this.observerRegistry.register({
      id: observerId,
      type: "mutation",
      getTarget: () => document.querySelector(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY) || document.body,
      options: { childList: true, subtree: true },
      callback: () => {
        this.tryRelocateSlot(slot.tabKey);
      }
    });
    this.observerRegistry.activate(observerId);
  }

  public tryRelocateSlot(tabKey: TabKey): boolean {
    const slotState = this.slots.get(tabKey);
    if (!slotState || !this.rightTabsContainer) {
      return false;
    }

    const { slot } = slotState;
    const targetContainer = this.rightTabsContainer.querySelector<HTMLElement>(slot.targetContainerSelector);
    if (!targetContainer) {
      return false;
    }

    const sourceElement = document.querySelector<HTMLElement>(slot.sourceSelector);
    if (!sourceElement) {
      return false;
    }

    if (targetContainer.contains(sourceElement)) {
      slotState.element = sourceElement;
      return true;
    }

    return this.polymerPatcher.runInProtectedContext(() => {
      const parent = sourceElement.parentNode;
      if (!parent) {
        return false;
      }

      let anchor = slotState.anchor;
      if (!anchor || !anchor.isConnected) {
        anchor = document.createElement("div");
        anchor.className = `${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR} ${slot.placeholderClass}`;
        anchor.style.display = "none";
        parent.insertBefore(anchor, sourceElement);
        slotState.anchor = anchor;
      }

      targetContainer.appendChild(sourceElement);
      slotState.element = sourceElement;
      return true;
    });
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
    if (element && anchor && anchor.parentNode) {
      this.polymerPatcher.runInProtectedContext(() => {
        anchor.parentNode?.insertBefore(element, anchor);
        anchor.remove();
      });
    }

    slotState.element = null;
    slotState.anchor = null;
  }

  public getTabsView(): TabsView {
    return this.tabsView;
  }

  public destroy(): void {
    this.restoreAll();
    this.slots.clear();
    this.tabsView.destroy();

    if (this.rightTabsContainer && this.rightTabsContainer.parentNode) {
      this.rightTabsContainer.remove();
      this.rightTabsContainer = null;
    }

    if (this.secondaryWrapper && this.secondaryWrapper.children.length === 0) {
      this.secondaryWrapper.remove();
      this.secondaryWrapper = null;
    }
  }
}
