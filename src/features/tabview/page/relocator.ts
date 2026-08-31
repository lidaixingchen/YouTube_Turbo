import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { TabsView } from "./tabs-view";
import type { TabKey, RelocationSlot, TabsViewOptions, LcCommentResult, ContentsRendererLocation } from "./types";

interface ActiveSlotState {
  slot: RelocationSlot;
  element: HTMLElement | null;
  anchor: HTMLElement | null;
}

export function findLcComment(targetLc?: string): LcCommentResult | null {
  if (targetLc) {
    const element = document.querySelector<HTMLElement>(
      `#tab-comments ytd-comments ytd-comment-renderer #header-author a[href*="lc=${targetLc}"]`
    );
    if (element) {
      const commentRendererElm = element.closest<HTMLElement>("ytd-comment-renderer");
      if (commentRendererElm) {
        return {
          lc: targetLc,
          commentRendererElm
        };
      }
    }
  } else {
    const element = document.querySelector<HTMLElement>(
      `#tab-comments ytd-comments ytd-comment-renderer > #linked-comment-badge span:not(:empty)`
    );
    if (element) {
      const commentRendererElm = element.closest<HTMLElement>("ytd-comment-renderer");
      if (commentRendererElm) {
        const header = commentRendererElm.querySelector<HTMLElement>("#header-author");
        if (header) {
          const anchor = header.querySelector<HTMLAnchorElement>('a[href*="lc="]');
          if (anchor) {
            const href = anchor.getAttribute("href") || "";
            const match = /[&?]lc=([\w_.-]+)/.exec(href);
            if (match && match[1]) {
              return {
                lc: match[1],
                commentRendererElm
              };
            }
          }
        }
      }
    }
  }
  return null;
}

export function findContentsRenderer(commentRendererElm: HTMLElement): ContentsRendererLocation | null {
  const parent = commentRendererElm.closest<HTMLElement>(
    "ytd-comments, ytd-item-section-renderer, ytd-comment-thread-renderer, ytd-comment-replies-renderer"
  );
  if (!parent) {
    return null;
  }

  const parentCnt = PolymerHelper.insp(parent);
  const data = parentCnt?.data as { contents?: unknown[] } | undefined;
  const contents = data?.contents;

  let index = -1;
  if (Array.isArray(contents)) {
    const commentCnt = PolymerHelper.insp(commentRendererElm);
    const commentData = commentCnt?.data;

    for (let i = 0; i < contents.length; i++) {
      const item = contents[i] as Record<string, any> | undefined;
      if (
        item === commentData ||
        item?.commentThreadRenderer?.comment?.commentRenderer === commentData ||
        item?.commentRenderer === commentData
      ) {
        index = i;
        break;
      }
    }

    if (index === -1) {
      const childElements = Array.from(parent.children);
      const hostItem = commentRendererElm.closest<HTMLElement>("ytd-comment-thread-renderer") || commentRendererElm;
      index = childElements.indexOf(hostItem);
    }
  }

  return {
    parent,
    index
  };
}

export function lcSwapFuncB(targetLcId: string, currentLcId: string, badgeData: Record<string, unknown>): boolean {
  try {
    const r1 = findLcComment(currentLcId)?.commentRendererElm;
    const r2 = findLcComment(targetLcId)?.commentRendererElm;
    if (!r1 || !r2) {
      return false;
    }

    const r1cnt = PolymerHelper.insp(r1);
    const r2cnt = PolymerHelper.insp(r2);
    if (!r1cnt?.data || !r2cnt?.data) {
      return false;
    }

    const r1d = r1cnt.data as Record<string, unknown>;
    delete r1d.linkedCommentBadge;
    r1cnt.data = { ...r1d };

    const r2d = r2cnt.data as Record<string, unknown>;
    r2cnt.data = { ...r2d, linkedCommentBadge: { ...badgeData } };
    return true;
  } catch {
    return false;
  }
}

export function lcSwapFuncA(targetLcId: string, currentLcId: string): boolean {
  try {
    const r1 = findLcComment(currentLcId)?.commentRendererElm;
    const r2 = findLcComment(targetLcId)?.commentRendererElm;
    if (!r1 || !r2) {
      return false;
    }

    const r1cnt = PolymerHelper.insp(r1);
    const r2cnt = PolymerHelper.insp(r2);
    const r1Badge = (r1cnt?.data as Record<string, any> | undefined)?.linkedCommentBadge;
    const r2Badge = (r2cnt?.data as Record<string, any> | undefined)?.linkedCommentBadge;

    if (typeof r1Badge === "object" && typeof r2Badge === "undefined") {
      const badgeCopy = { ...r1Badge };
      if (badgeCopy.metadataBadgeRenderer?.trackingParams) {
        delete badgeCopy.metadataBadgeRenderer.trackingParams;
      }

      const v1 = findContentsRenderer(r1);
      const v2 = findContentsRenderer(r2);
      if (!v1 || !v2 || v1.parent !== v2.parent) {
        return false;
      }

      if (v2.index >= 0) {
        if (v2.parent.nodeName === "YTD-COMMENT-REPLIES-RENDERER") {
          return lcSwapFuncB(targetLcId, currentLcId, badgeCopy);
        } else {
          const v2pCnt = PolymerHelper.insp(v2.parent);
          if (v2pCnt) {
            const v2Contents = (v2pCnt.data as { contents?: unknown[] } | undefined)?.contents;
            if (Array.isArray(v2Contents)) {
              const targetItem = v2Contents[v2.index];
              const nextContents = [
                targetItem,
                ...v2Contents.slice(0, v2.index),
                ...v2Contents.slice(v2.index + 1)
              ];
              v2pCnt.data = {
                ...(v2pCnt.data as Record<string, unknown>),
                contents: nextContents
              };
            }
          }
          return lcSwapFuncB(targetLcId, currentLcId, badgeCopy);
        }
      }
    }
  } catch {
    // 忽略异常
  }
  return false;
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

  public checkAndHandleLinkedComment(specifiedLcId?: string): boolean {
    const searchParams = new URLSearchParams(window.location.search);
    const lcParam = specifiedLcId || searchParams.get("lc");
    if (!lcParam) {
      return false;
    }

    const targetLc = findLcComment(lcParam);
    const currentLc = targetLc ? findLcComment() : null;

    if (targetLc && currentLc) {
      if (targetLc.lc === currentLc.lc) {
        return true;
      }
      return lcSwapFuncA(targetLc.lc, currentLc.lc);
    }
    return false;
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
    const secondaryInner = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_EXACT);
    const wrapper = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);
    const rightTabs = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    const tabVideos = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);

    if (!tabVideos) {
      return;
    }

    const containersToScan = [secondaryInner, wrapper].filter(Boolean) as HTMLElement[];
    for (let cIdx = 0; cIdx < containersToScan.length; cIdx++) {
      const container = containersToScan[cIdx];
      const children = Array.from(container.children);
      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        if (
          child === wrapper ||
          child === rightTabs ||
          child.matches("secondary-wrapper, ytd-live-chat-frame, [tyt-chat-container], #chat, #chat-container, .tyt-relocator-anchor")
        ) {
          continue;
        }
        if (
          child.matches(PAGE_CONSTANTS.SELECTORS.RELATED_SECTION) ||
          child.querySelector(PAGE_CONSTANTS.SELECTORS.RELATED_SECTION)
        ) {
          tabVideos.replaceChildren(child);
        }
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

