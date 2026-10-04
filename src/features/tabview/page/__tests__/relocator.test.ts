import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DOMRelocator } from "../relocator";
import { PAGE_CONSTANTS } from "../constants";
import type { RouteGeneration, TabsViewOptions } from "../types";
import {
  installFakeObservers,
  resetFakeObservers,
  assertNoActiveFakeObservers,
  FakeMutationObserver
} from "../../../../test/fake-observers";

describe("DOMRelocator", () => {
  let relocator: DOMRelocator;
  const gen1 = 1 as RouteGeneration;
  const gen2 = 2 as RouteGeneration;
  const mockTabsOptions: TabsViewOptions = {
    localeSnapshot: {
      locale: "en",
      messages: {}
    },
    onTabSelected: vi.fn(),
    onFontSizeChanged: vi.fn()
  };

  beforeEach(() => {
    installFakeObservers();
    resetFakeObservers();
    relocator = new DOMRelocator();
  });

  afterEach(() => {
    relocator.destroy();
    assertNoActiveFakeObservers();
    resetFakeObservers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("mounts route, sets up exact secondary-inner observer with childList only", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    document.body.appendChild(secondaryInner);

    const rightTabs = relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    expect(rightTabs.id).toBe(PAGE_CONSTANTS.IDS.RIGHT_TABS);
    expect(FakeMutationObserver.allInstances.length).toBe(1);

    const mo = FakeMutationObserver.allInstances[0];
    expect(mo.observedTargets[0].target).toBe(secondaryInner);
    expect(mo.observedTargets[0].options).toEqual({
      childList: true,
      subtree: false
    });
  });

  it("ignores mutations on internal/self nodes (wrapper, chat, anchor, right-tabs)", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const sweepSpy = vi.spyOn(relocator, "sweepSecondary");
    const mo = FakeMutationObserver.allInstances[0];

    // Create ignored nodes
    const rightTabsNode = document.createElement("div");
    rightTabsNode.id = PAGE_CONSTANTS.IDS.RIGHT_TABS;

    const chatNode = document.createElement("ytd-live-chat-frame");

    mo.trigger([
      {
        target: secondaryInner,
        addedNodes: [rightTabsNode, chatNode] as unknown as NodeList
      }
    ]);

    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it("triggers sweepSecondary on external related element additions and physically moves node", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const relatedElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    secondaryInner.appendChild(relatedElement);

    const mo = FakeMutationObserver.allInstances[0];
    mo.trigger([
      {
        target: secondaryInner,
        addedNodes: [relatedElement] as unknown as NodeList
      }
    ]);

    const tabVideos = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
    expect(tabVideos).not.toBeNull();
    expect(tabVideos?.contains(relatedElement)).toBe(true);
  });

  it("restores content moved by secondary sweep when the route is unmounted", (): void => {
    const watchContainer: HTMLElement = document.createElement("div");
    const secondaryInner: HTMLElement = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    watchContainer.appendChild(secondaryInner);
    document.body.appendChild(watchContainer);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const before: HTMLElement = document.createElement("span");
    const relatedElement: HTMLElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    const after: HTMLElement = document.createElement("span");
    secondaryInner.append(before, relatedElement, after);

    relocator.sweepSecondary();
    expect(document.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER)?.contains(relatedElement)).toBe(true);

    relocator.unmountRoute(gen1);

    expect(secondaryInner.contains(relatedElement)).toBe(true);
    expect(relatedElement.previousSibling).toBe(before);
    expect(relatedElement.nextSibling).toBe(after);
    expect(document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`)).toBeNull();
  });

  it("restores from the saved sibling when the anchor was removed and reuses its position on sync", (): void => {
    const secondaryInner: HTMLElement = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    const sourceParent: HTMLElement = document.createElement("div");
    const before: HTMLElement = document.createElement("span");
    const relatedElement: HTMLElement = document.createElement("div");
    relatedElement.id = "related";
    const after: HTMLElement = document.createElement("span");
    sourceParent.append(before, relatedElement, after);
    secondaryInner.appendChild(sourceParent);
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });
    relocator.refreshAllSlots();
    relocator.refreshAllSlots();

    const tabVideos: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
    const anchor: HTMLElement | null = sourceParent.querySelector<HTMLElement>(
      `.${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}`
    );
    expect(tabVideos?.contains(relatedElement)).toBe(true);
    expect(anchor).not.toBeNull();
    expect(sourceParent.querySelectorAll(`.${PAGE_CONSTANTS.CLASSES.PLACEHOLDER_ANCHOR}`)).toHaveLength(1);

    anchor?.remove();
    relocator.restoreSlot("videos");

    expect(Array.from(sourceParent.children)).toEqual([before, relatedElement, after]);
  });

  it("preserves content in the route-owned wrapper when its source parent disappears", (): void => {
    const secondaryInner: HTMLElement = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    const sourceParent: HTMLElement = document.createElement("div");
    const relatedElement: HTMLElement = document.createElement("div");
    relatedElement.id = "related";
    sourceParent.appendChild(relatedElement);
    secondaryInner.appendChild(sourceParent);
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const rightTabs: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RIGHT_TABS);
    expect(rightTabs?.contains(relatedElement)).toBe(true);
    sourceParent.remove();

    relocator.destroy();

    expect(secondaryInner.contains(relatedElement)).toBe(true);
    expect(relatedElement.isConnected).toBe(true);
    expect(relatedElement.parentElement).not.toBe(document.body);
  });

  it("retains tab-owned content when both its source and route root are removed", (): void => {
    const secondaryInner: HTMLElement = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    const relatedElement: HTMLElement = document.createElement("div");
    relatedElement.id = "related";
    relatedElement.textContent = "preserved content";
    secondaryInner.appendChild(relatedElement);
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const tabVideos: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
    expect(tabVideos?.contains(relatedElement)).toBe(true);
    const routeWrapper: HTMLElement | null = tabVideos?.closest<HTMLElement>(
      PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER
    ) ?? null;
    secondaryInner.remove();

    relocator.destroy();

    expect(routeWrapper?.contains(relatedElement)).toBe(true);
    expect(tabVideos?.contains(relatedElement)).toBe(false);
    expect(relatedElement.textContent).toBe("preserved content");
  });

  it("releases detached route ownership so a mounted route can relocate its own content", (): void => {
    const oldRoot: HTMLElement = document.createElement("div");
    const oldSecondaryInner: HTMLElement = document.createElement("div");
    oldSecondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    const oldRelated: HTMLElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    oldRelated.textContent = "old route content";
    oldSecondaryInner.appendChild(oldRelated);
    oldRoot.appendChild(oldSecondaryInner);
    document.body.appendChild(oldRoot);

    const oldTabs: HTMLElement = relocator.mountRoute({
      generation: gen1,
      secondaryInner: oldSecondaryInner,
      tabsOptions: mockTabsOptions
    });
    const oldWrapper: HTMLElement | null = oldTabs.parentElement;
    expect(oldTabs.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER)?.contains(oldRelated)).toBe(true);

    oldRoot.remove();
    relocator.unmountRoute(gen1);

    expect(oldWrapper?.contains(oldRelated)).toBe(true);
    expect(oldTabs.contains(oldRelated)).toBe(false);

    const newRoot: HTMLElement = document.createElement("div");
    const newSecondaryInner: HTMLElement = document.createElement("div");
    newSecondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    const newRelated: HTMLElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    newRelated.textContent = "new route content";
    newSecondaryInner.appendChild(newRelated);
    newRoot.appendChild(newSecondaryInner);
    document.body.appendChild(newRoot);

    const newTabs: HTMLElement = relocator.mountRoute({
      generation: gen2,
      secondaryInner: newSecondaryInner,
      tabsOptions: mockTabsOptions
    });

    expect(newTabs.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER)?.contains(newRelated)).toBe(true);
    expect(oldWrapper?.contains(oldRelated)).toBe(true);
    expect(relocator.isSlotRelocated("videos")).toBe(true);

    relocator.unmountRoute(gen2);
  });

  it("cleans tabs on destroy and relocates content after reinitializing on a new root", (): void => {
    const oldRoot: HTMLElement = document.createElement("div");
    const oldSecondaryInner: HTMLElement = document.createElement("div");
    oldSecondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    const oldRelated: HTMLElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    oldRelated.textContent = "retained old content";
    oldSecondaryInner.appendChild(oldRelated);
    oldRoot.appendChild(oldSecondaryInner);
    document.body.appendChild(oldRoot);

    const oldTabs: HTMLElement = relocator.mountRoute({
      generation: gen1,
      secondaryInner: oldSecondaryInner,
      tabsOptions: mockTabsOptions
    });
    const oldWrapper: HTMLElement | null = oldTabs.parentElement;
    const tabsDestroySpy: ReturnType<typeof vi.spyOn> = vi.spyOn(relocator.getTabsView(), "destroy");
    expect(oldTabs.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER)?.contains(oldRelated)).toBe(true);

    oldRoot.remove();
    relocator.destroy();

    expect(tabsDestroySpy).toHaveBeenCalledOnce();
    expect(oldWrapper?.contains(oldRelated)).toBe(true);
    expect(oldTabs.contains(oldRelated)).toBe(false);

    const newRoot: HTMLElement = document.createElement("div");
    const newSecondaryInner: HTMLElement = document.createElement("div");
    newSecondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    const newRelated: HTMLElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    newRelated.textContent = "reinitialized content";
    newSecondaryInner.appendChild(newRelated);
    newRoot.appendChild(newSecondaryInner);
    document.body.appendChild(newRoot);

    const newTabs: HTMLElement = relocator.mountRoute({
      generation: gen2,
      secondaryInner: newSecondaryInner,
      tabsOptions: mockTabsOptions
    });

    expect(newTabs.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER)?.contains(newRelated)).toBe(true);
    expect(oldWrapper?.contains(oldRelated)).toBe(true);
    expect(relocator.isSlotRelocated("videos")).toBe(true);
  });

  it("restores an existing owned node before sweep replaces its target", (): void => {
    const secondaryInner: HTMLElement = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    const sourceParent: HTMLElement = document.createElement("div");
    const existingRelated: HTMLElement = document.createElement("div");
    existingRelated.id = "related";
    sourceParent.appendChild(existingRelated);
    secondaryInner.appendChild(sourceParent);
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const tabVideos: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
    const skeleton: HTMLElement = document.createElement("div");
    skeleton.className = "watch-skeleton style-scope ytd-watch-flexy";
    skeleton.appendChild(existingRelated);
    tabVideos?.replaceChildren(skeleton);

    const replacement: HTMLElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    secondaryInner.appendChild(replacement);
    expect(document.querySelector(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_EXACT)).toBe(secondaryInner);
    expect(Array.from(secondaryInner.querySelectorAll(PAGE_CONSTANTS.SELECTORS.RELATED_SECTION))).toContain(replacement);
    expect(existingRelated.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)).toBe(skeleton);
    relocator.sweepSecondary();

    expect(sourceParent.contains(existingRelated)).toBe(true);
    expect(tabVideos?.contains(replacement)).toBe(true);
    expect(tabVideos?.contains(existingRelated)).toBe(false);
  });

  it("suppresses sweepSecondary during relocation operations via Silence Lock", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const sweepSpy = vi.spyOn(relocator, "sweepSecondary");
    const mo = FakeMutationObserver.allInstances[0];

    // Simulate an internal relocation running under Silence Lock
    (relocator as any).isSilent = true;

    const relatedElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    mo.trigger([
      {
        target: secondaryInner,
        addedNodes: [relatedElement] as unknown as NodeList
      }
    ]);

    expect(sweepSpy).not.toHaveBeenCalled();
    (relocator as any).isSilent = false;
  });

  it("disconnects observer and restores slots on unmountRoute", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    expect(FakeMutationObserver.activeInstances.size).toBe(1);

    relocator.unmountRoute(gen1);

    expect(FakeMutationObserver.activeInstances.size).toBe(0);
    expect(document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`)).toBeNull();
  });

  it("rejects stale generation callbacks", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    document.body.appendChild(secondaryInner);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const sweepSpy = vi.spyOn(relocator, "sweepSecondary");
    const mo = FakeMutationObserver.allInstances[0];

    // Switch to gen2
    relocator.unmountRoute(gen1);

    const relatedElement = document.createElement("ytd-watch-next-secondary-results-renderer");
    // Trigger late callback captured from gen1
    mo.trigger([
      {
        target: secondaryInner,
        addedNodes: [relatedElement] as unknown as NodeList
      }
    ]);

    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it("ignores skeleton elements and hidden containers during tryRelocateSlot and sweepSecondary", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    document.body.appendChild(secondaryInner);

    // Create a hidden skeleton with a fake related inside
    const skeletonWrapper = document.createElement("div");
    skeletonWrapper.id = "related-skeleton";
    skeletonWrapper.className = "watch-skeleton style-scope ytd-watch-flexy";
    skeletonWrapper.setAttribute("hidden", "");
    const fakeRelated = document.createElement("div");
    fakeRelated.id = "related";
    skeletonWrapper.appendChild(fakeRelated);
    secondaryInner.appendChild(skeletonWrapper);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const tabVideos = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
    expect(tabVideos).not.toBeNull();
    // Skeleton related must NOT be relocated into tab-videos
    expect(tabVideos?.contains(fakeRelated)).toBe(false);
    expect(tabVideos?.contains(skeletonWrapper)).toBe(false);

    // Trigger mutation with skeleton node
    const mo = FakeMutationObserver.allInstances[0];
    mo.trigger([
      {
        target: secondaryInner,
        addedNodes: [skeletonWrapper] as unknown as NodeList
      }
    ]);

    expect(tabVideos?.contains(fakeRelated)).toBe(false);
  });

  it("preserves already relocated related element in tab-videos during sweepSecondary", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    document.body.appendChild(secondaryInner);

    const realRelated = document.createElement("div");
    realRelated.id = "related";
    secondaryInner.appendChild(realRelated);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const tabVideos = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER);
    expect(tabVideos?.contains(realRelated)).toBe(true);

    // If another candidate arrives in secondaryInner, sweepSecondary does not overwrite
    const extraRelated = document.createElement("div");
    extraRelated.id = "related";
    secondaryInner.appendChild(extraRelated);

    relocator.sweepSecondary();
    expect(tabVideos?.contains(realRelated)).toBe(true);
    expect(tabVideos?.contains(extraRelated)).toBe(false);
  });

  it("successfully relocates native comments even when element or parent has hidden attribute", () => {
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    document.body.appendChild(secondaryInner);

    const commentsSection = document.createElement("ytd-comments");
    commentsSection.id = "comments";
    commentsSection.setAttribute("hidden", "");
    document.body.appendChild(commentsSection);

    relocator.mountRoute({
      generation: gen1,
      secondaryInner,
      tabsOptions: mockTabsOptions
    });

    const tabComments = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER);
    expect(tabComments).not.toBeNull();
    expect(tabComments?.contains(commentsSection)).toBe(true);
    expect(relocator.isSlotRelocated("comments")).toBe(true);
  });
});

