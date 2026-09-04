import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TABVIEW_CONSTANTS } from "../constants";
import { Tabview } from "../index";

vi.mock("virtual:tabview-page-bundle", () => {
  return {
    default: "/* mock page bundle */"
  };
});

describe("Tabview.setup() and destroy() lifecycle", () => {
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
    ) => {
      try {
        eval(options.textContent);
      } catch {
        // ignore
      }
    };
  });

  afterEach(() => {
    Tabview.destroy();
    delete (window as any).GM_addElement;
    delete (window as any).__YTI_TABVIEW_MAIN__;
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation
    });
  });

  it("deduplicates concurrent setup calls", async () => {
    vi.useFakeTimers();

    const p1 = Tabview.setup();
    const p2 = Tabview.setup();

    expect(p1).toBe(p2);

    // Let it timeout to clean up
    vi.advanceTimersByTime(TABVIEW_CONSTANTS.READY_TIMEOUT_MS);

    await expect(p1).rejects.toThrow("Ready barrier timeout");
  });

  it("rolls back atomically on timeout and allows retry", async () => {
    vi.useFakeTimers();

    const setupPromise = Tabview.setup();
    vi.advanceTimersByTime(TABVIEW_CONSTANTS.READY_TIMEOUT_MS);

    await expect(setupPromise).rejects.toThrow("Ready barrier timeout");
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();

    // Verify retry succeeds to start new attempt
    const retryPromise = Tabview.setup();
    expect(retryPromise).toBeDefined();

    vi.advanceTimersByTime(TABVIEW_CONSTANTS.READY_TIMEOUT_MS);
    await expect(retryPromise).rejects.toThrow("Ready barrier timeout");
  });

  it("resolves setup when page sends ready and mounts styles", async () => {
    vi.useFakeTimers();

    // Mock page main function called by script injection
    let injectedBootstrap: any = null;
    (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: any) => {
      injectedBootstrap = bootstrap;
    };

    const setupPromise = Tabview.setup();
    expect(injectedBootstrap).not.toBeNull();

    // Simulate page publishing ready envelope
    const readyEvent = new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId: injectedBootstrap.sessionId,
        sender: "page",
        target: "sandbox",
        sequence: 1,
        body: {
          kind: "message",
          value: {
            type: "ready",
            protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION
          }
        }
      }
    });
    window.dispatchEvent(readyEvent);

    await expect(setupPromise).resolves.toBeUndefined();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBe("icp");

    // Clean up
    delete (window as any).__YTI_TABVIEW_MAIN__;
    Tabview.destroy();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
  });

  it("rejects setup promise when peer closes before ready", async () => {
    vi.useFakeTimers();

    let injectedBootstrap: any = null;
    (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: any) => {
      injectedBootstrap = bootstrap;
    };

    const setupPromise = Tabview.setup();
    expect(injectedBootstrap).not.toBeNull();

    const closeEvent = new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId: injectedBootstrap.sessionId,
        sender: "page",
        target: "sandbox",
        sequence: 1,
        body: {
          kind: "close",
          reason: "injection-failed"
        }
      }
    });
    window.dispatchEvent(closeEvent);

    await expect(setupPromise).rejects.toThrow("Session closed during setup: injection-failed");
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
  });

  it("destroys idempotently without leaks", () => {
    Tabview.destroy();
    Tabview.destroy();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
  });
});
