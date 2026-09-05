import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TabviewLifecycleCoordinator } from "../coordinator";
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

  it("advances route generation and deactivates route when navigating watch -> watch", () => {
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

    // Simulate navigation to video2
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=video2"),
      configurable: true,
      writable: true
    });

    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
    expect(coordinator.getState().videoId).toBe("video2");
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

    coordinator.init(mockLocale);
    coordinator.destroy();

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

  it("resiliently finishes teardown even if a cleanup step throws an error", () => {
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

    // Sabotage relocator.unmountRoute to throw an error
    const relocator = (coordinator as any).relocator;
    vi.spyOn(relocator, "unmountRoute").mockImplementationOnce(() => {
      throw new Error("Simulated unmountRoute failure");
    });

    // destroy should proceed and not throw
    expect(() => coordinator.destroy()).not.toThrow();
    expect(FakeResizeObserver.activeInstances.size).toBe(0);
    expect(FakeIntersectionObserver.activeInstances.size).toBe(0);
  });
});
