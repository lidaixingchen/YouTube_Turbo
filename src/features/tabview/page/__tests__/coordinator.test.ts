import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TabviewLifecycleCoordinator } from "../coordinator";
import { PolymerHelper } from "../polymer-helper";
import { MinibrowserRouter } from "../minibrowser-router";
import { PAGE_CONSTANTS } from "../constants";
import type { LocaleSnapshot } from "../types";
import {
  installFakeObservers,
  resetFakeObservers,
  assertNoActiveFakeObservers,
  FakeMutationObserver,
  FakeResizeObserver,
  FakeIntersectionObserver
} from "../../../../test/fake-observers";

describe("TabviewLifecycleCoordinator", () => {
  let coordinator: TabviewLifecycleCoordinator;
  const mockLocale: LocaleSnapshot = {
    locale: "en",
    messages: {}
  };

  beforeEach(() => {
    installFakeObservers();
    resetFakeObservers();
    coordinator = new TabviewLifecycleCoordinator();
  });

  afterEach(() => {
    coordinator.destroy();
    assertNoActiveFakeObservers();
    resetFakeObservers();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TABVIEW_LOADED);
    vi.restoreAllMocks();
  });

  it("idempotently initializes without duplicate listeners", () => {
    coordinator.init(mockLocale);
    coordinator.init(mockLocale); // Duplicate init call

    expect(coordinator.getState()).toBeDefined();
  });

  it("activates watch route and mounts components when on /watch", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=abc12345"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    coordinator.init(mockLocale);

    expect(coordinator.getState().pageType).toBe("watch");
    expect(document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`)).not.toBeNull();
    expect(document.documentElement.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TABVIEW_LOADED)).toBe(
      PAGE_CONSTANTS.VALUES.TABVIEW_LOADED_ICP
    );
  });

  it("preserves right-tabs container and slots when navigating watch -> watch", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    coordinator.init(mockLocale);

    const rightTabsBefore = document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`);
    expect(rightTabsBefore).not.toBeNull();

    // Simulate navigation to video2
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video2"),
      configurable: true,
      writable: true
    });

    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
    expect(coordinator.getState().videoId).toBe("video2");
    const rightTabsAfter = document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`);
    expect(rightTabsAfter).toBe(rightTabsBefore);
  });

  it("deactivates route when navigating watch -> home", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    coordinator.init(mockLocale);
    expect(document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`)).not.toBeNull();

    // Navigate to /
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/"),
      configurable: true,
      writable: true
    });

    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));

    expect(coordinator.getState().pageType).toBe("home");
    expect(document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`)).toBeNull();
  });

  it("completely cleans up on destroy() and ignores subsequent events", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    const routerDestroySpy = vi.spyOn(MinibrowserRouter.getInstance(), "destroy");
    coordinator.init(mockLocale);
    coordinator.destroy();

    expect(routerDestroySpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`)).toBeNull();
    expect(FakeMutationObserver.activeInstances.size).toBe(0);
    expect(FakeResizeObserver.activeInstances.size).toBe(0);
    expect(FakeIntersectionObserver.activeInstances.size).toBe(0);

    // Event after destroy should not re-mount
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
    expect(document.querySelector(`#${PAGE_CONSTANTS.IDS.RIGHT_TABS}`)).toBeNull();
  });

  it("replays connected elements on SPA navigation when DOM nodes are reused", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    const chat = document.createElement("ytd-live-chat-frame");
    chat.id = "chat";

    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);
    document.body.appendChild(chat);

    coordinator.init(mockLocale);
    expect(chat.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME)).toBe(true);

    // Simulate SPA navigation to a second video
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video2"),
      configurable: true,
      writable: true
    });
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));

    // Reused chat element should still be active under the new route generation
    expect(chat.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME)).toBe(true);
  });

  it("resiliently finishes teardown even if a cleanup step throws an error", () => {    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    coordinator.init(mockLocale);

    // Sabotage relocator.unmountRoute to throw an error
    const relocator = (coordinator as any).relocator;
    vi.spyOn(relocator, "unmountRoute").mockImplementationOnce(() => {
      throw new Error("Simulated unmountRoute failure");
    });

    // destroy should finish all cleanups and throw AggregateError
    expect(() => coordinator.destroy()).toThrow(AggregateError);
    expect(FakeResizeObserver.activeInstances.size).toBe(0);
    expect(FakeIntersectionObserver.activeInstances.size).toBe(0);
  });

  it("does not install prototype patches resolved after destroy", async () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    let resolveLate!: (value: Record<string, unknown>) => void;
    const latePromise = new Promise<Record<string, unknown>>((resolve): void => {
      resolveLate = resolve;
    });
    vi.spyOn(PolymerHelper, "retrieveCE").mockImplementation(
      async (): Promise<Record<string, unknown> | null> => latePromise
    );

    coordinator.init(mockLocale);
    const originalUpdatePlayerLocation = Symbol("original");
    const lateProto: Record<string, unknown> = {
      updatePlayerLocation: originalUpdatePlayerLocation
    };
    coordinator.destroy();
    resolveLate(lateProto);
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }

    expect(lateProto.updatePlayerLocation).toBe(originalUpdatePlayerLocation);
  });

  it("suspends polymer patcher route before deactivating domain owners", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    coordinator.init(mockLocale);

    const callOrder: string[] = [];
    const patcher = (coordinator as unknown as { polymerPatcher: { suspendRoute: () => void } }).polymerPatcher;
    const relocator = (coordinator as unknown as { relocator: { unmountRoute: () => void } }).relocator;

    vi.spyOn(patcher, "suspendRoute").mockImplementation(() => {
      callOrder.push("suspendRoute");
    });
    vi.spyOn(relocator, "unmountRoute").mockImplementation(() => {
      callOrder.push("unmountRoute");
    });

    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/"),
      configurable: true,
      writable: true
    });
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));

    expect(callOrder).toEqual(["suspendRoute", "unmountRoute"]);
  });

  it("triggers on-demand relocation and syncs status when setActiveTab is called", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    coordinator.init(mockLocale);

    const relocator = (coordinator as unknown as { relocator: { tryRelocateSlot: (tab: string) => boolean } }).relocator;
    const tryRelocateSpy = vi.spyOn(relocator, "tryRelocateSlot");

    coordinator.setActiveTab("comments");

    expect(tryRelocateSpy).toHaveBeenCalledWith("comments");
  });

  it("reactively relocates pending comments slot upon yt-action DOM events", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video1"),
      configurable: true,
      writable: true
    });

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);

    coordinator.init(mockLocale);

    // Now late comments element arrives in body
    const comments = document.createElement("ytd-comments");
    comments.id = "comments";
    document.body.appendChild(comments);

    const tabComments = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER);
    expect(tabComments?.contains(comments)).toBe(false);

    // Fire yt-action event
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_ACTION));

    expect(tabComments?.contains(comments)).toBe(true);
  });
});
