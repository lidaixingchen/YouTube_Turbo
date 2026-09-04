import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Tabview } from "../index";
import { main as pageMain } from "../page/index";

vi.mock("virtual:tabview-page-bundle", () => {
  return {
    default: "/* mock page bundle */"
  };
});

describe("Tabview Session & Ownership Integration", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { host: "www.youtube.com", pathname: "/watch" }
    });

    // 模拟脚本注入机制，直接驱动 pageMain 执行真实页面初始化与 READY 发布
    (window as any).__YTI_TABVIEW_MAIN__ = pageMain;
    (window as any).GM_addElement = (
      _target: HTMLElement,
      _tag: string,
      options: { textContent: string }
    ) => {
      eval(options.textContent);
    };
  });

  afterEach(() => {
    Tabview.destroy();
    delete (window as any).GM_addElement;
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
    Tabview.destroy();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
  });

  it("handles re-setup with fresh session after teardown", async () => {
    vi.useFakeTimers();

    // First setup
    await expect(Tabview.setup()).resolves.toBeUndefined();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBe("icp");

    // Destroy
    Tabview.destroy();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();

    // Second setup generates new session and completes handshake
    await expect(Tabview.setup()).resolves.toBeUndefined();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBe("icp");

    Tabview.destroy();
  });
});
