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
});
