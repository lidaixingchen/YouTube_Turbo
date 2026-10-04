import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Tabview } from "../index";
import { PAGE_CONSTANTS } from "../page/constants";

describe("Tabview Session & Ownership Integration", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { host: "www.youtube.com", pathname: "/watch" }
    });

    (window as any).GM_addElement = (
      _target: HTMLElement,
      _tag: string,
      options: { textContent: string }
    ): HTMLScriptElement => {
      eval(options.textContent);
      return document.createElement("script");
    };
  });

  afterEach(async () => {
    await Tabview.destroy().catch(() => {});
    delete (window as any).GM_addElement;
    delete (window as any).__YTI_TABVIEW_MAIN__;
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("tabview-loaded");
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation
    });
  });

  it("completes full handshake from sandbox setup to page ready", async () => {
    vi.useFakeTimers();

    const setupPromise = Tabview.setup();

    await expect(setupPromise).resolves.toBeUndefined();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBe("icp");

    // Feature destroy cascades close to page session
    await Tabview.destroy();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
  });

  it("handles re-setup with fresh session after teardown", async () => {
    vi.useFakeTimers();

    // First setup
    await expect(Tabview.setup()).resolves.toBeUndefined();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBe("icp");

    // Destroy
    await Tabview.destroy();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();

    // Second setup generates new session and completes handshake
    await expect(Tabview.setup()).resolves.toBeUndefined();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBe("icp");

    await Tabview.destroy();
  });

  it("re-evaluating the page bundle reuses the page-lifetime comments adapter", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const effectCalls: string[] = [];
    class FakeCommentsElement extends HTMLElement {
      public _createPropertyObserver(property: string, observerMethod: string, options?: unknown): void {
        effectCalls.push(`${property}:${observerMethod}:${String(options)}`);
      }
    }
    customElements.define("ytd-comments", FakeCommentsElement);

    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    const secondaryInner = document.createElement("div");
    secondaryInner.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
    secondaryInner.className = "style-scope ytd-watch-flexy";
    const commentsElement = document.createElement("ytd-comments");
    commentsElement.id = "comments";
    document.body.appendChild(flexy);
    document.body.appendChild(secondaryInner);
    document.body.appendChild(commentsElement);

    const flush = async (): Promise<void> => {
      for (let i = 0; i < 8; i++) {
        await Promise.resolve();
      }
    };

    await expect(Tabview.setup()).resolves.toBeUndefined();
    await flush();
    expect(effectCalls).toEqual(["data:_dataChanged498:undefined"]);
    expect(document.documentElement.getAttribute("tabview-loaded")).toBe("icp");

    await Tabview.destroy();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
    await flush();

    await expect(Tabview.setup()).resolves.toBeUndefined();
    await flush();
    expect(effectCalls).toEqual(["data:_dataChanged498:undefined"]);

    (commentsElement as unknown as { data?: unknown }).data = {
      contents: [{ commentThreadRenderer: {} }, {}]
    };
    const callback = (commentsElement as unknown as { _dataChanged498?: () => void })._dataChanged498;
    expect(typeof callback).toBe("function");
    callback?.call(commentsElement);
    expect(commentsElement.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS)).toBe("1");

    await Tabview.destroy();
    delete (FakeCommentsElement.prototype as unknown as Record<string | symbol, unknown>)[
      Symbol.for(PAGE_CONSTANTS.SYMBOLS.COMMENTS_DATA_ADAPTER)
    ];
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
