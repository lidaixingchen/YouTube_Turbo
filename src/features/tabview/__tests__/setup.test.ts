import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TABVIEW_CONSTANTS } from "../constants";
import { Tabview } from "../index";
import { TabviewLifecycleCoordinator } from "../page/coordinator";
import { main as pageMain } from "../page/index";

vi.mock("virtual:tabview-page-bundle", () => {
  return {
    default: "/* mock page bundle */"
  };
});

describe("Tabview.setup() and destroy() lifecycle", () => {
  const originalLocation = window.location;

  function acknowledgeTeardown(sessionId: string, sequence: number = TABVIEW_CONSTANTS.INITIAL_SEQUENCE): void {
    window.dispatchEvent(new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId,
        sender: "page",
        target: "sandbox",
        sequence,
        body: { kind: "control", action: { type: "teardown-ack", success: true } }
      }
    }));
  }

  beforeEach(() => {
    delete (window as any).__YTI_TABVIEW_MAIN__;
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

  afterEach(async () => {
    const cleanupPromise: Promise<void> = Tabview.destroy().catch((): void => {});
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(TABVIEW_CONSTANTS.TEARDOWN_TIMEOUT_MS);
      vi.useRealTimers();
    }
    await cleanupPromise;
    delete (window as any).GM_addElement;
    delete (window as any).__YTI_TABVIEW_MAIN__;
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation
    });
  });

  it("deduplicates concurrent setup calls", async () => {
    vi.useFakeTimers();
    let sessionId: string = "";
    (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: { sessionId: string }): void => {
      sessionId = bootstrap.sessionId;
    };

    const p1 = Tabview.setup();
    const p2 = Tabview.setup();

    expect(p1).toBe(p2);

    // Let it timeout to clean up
    const timeoutExpectation: Promise<void> = expect(p1).rejects.toThrow("Ready barrier timeout");
    vi.advanceTimersByTime(TABVIEW_CONSTANTS.READY_TIMEOUT_MS);
    await timeoutExpectation;
    const destroyPromise: Promise<void> = Tabview.destroy();
    acknowledgeTeardown(sessionId);
    await destroyPromise;
  });

  it("waits for confirmed cleanup before retrying a timed-out setup", async () => {
    vi.useFakeTimers();

    let sessionId: string = "";
    (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: { sessionId: string }): void => {
      sessionId = bootstrap.sessionId;
    };

    const setupPromise: Promise<void> = Tabview.setup();
    const timeoutExpectation: Promise<void> = expect(setupPromise).rejects.toThrow("Ready barrier timeout");
    vi.advanceTimersByTime(TABVIEW_CONSTANTS.READY_TIMEOUT_MS);

    await timeoutExpectation;
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
    await expect(Tabview.setup()).rejects.toThrow("Teardown must finish before setup");

    const destroyPromise: Promise<void> = Tabview.destroy();
    acknowledgeTeardown(sessionId);
    await destroyPromise;

    const retryPromise: Promise<void> = Tabview.setup();
    expect(retryPromise).toBeDefined();

    const retryTimeoutExpectation: Promise<void> = expect(retryPromise).rejects.toThrow("Ready barrier timeout");
    vi.advanceTimersByTime(TABVIEW_CONSTANTS.READY_TIMEOUT_MS);
    await retryTimeoutExpectation;
    const retryDestroyPromise: Promise<void> = Tabview.destroy();
    acknowledgeTeardown(sessionId);
    await retryDestroyPromise;
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
    const destroyPromise = Tabview.destroy();
    const ackEvent = new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId: injectedBootstrap.sessionId,
        sender: "page",
        target: "sandbox",
        sequence: 2,
        body: {
          kind: "control",
          action: {
            type: "teardown-ack",
            success: true
          }
        }
      }
    });
    window.dispatchEvent(ackEvent);
    await destroyPromise;
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
  });

  it("waits for the page cleanup result after a ready timeout", async () => {
    vi.useFakeTimers();

    let sessionId: string = "";
    (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: { sessionId: string }): void => {
      sessionId = bootstrap.sessionId;
    };

    const setupPromise: Promise<void> = Tabview.setup();
    const timeoutExpectation: Promise<void> = expect(setupPromise).rejects.toThrow("Ready barrier timeout");
    await vi.advanceTimersByTimeAsync(TABVIEW_CONSTANTS.READY_TIMEOUT_MS);
    await timeoutExpectation;

    let settled: boolean = false;
    const destroyPromise: Promise<void> = Tabview.destroy();
    void destroyPromise.then((): void => { settled = true; }, (): void => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    window.dispatchEvent(new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId,
        sender: "page",
        target: "sandbox",
        sequence: TABVIEW_CONSTANTS.INITIAL_SEQUENCE,
        body: {
          kind: "message",
          value: { type: "ready", protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION }
        }
      }
    }));
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();

    window.dispatchEvent(new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId,
        sender: "page",
        target: "sandbox",
        sequence: TABVIEW_CONSTANTS.INITIAL_SEQUENCE + 1,
        body: {
          kind: "control",
          action: { type: "teardown-ack", success: true }
        }
      }
    }));
    await expect(destroyPromise).resolves.toBeUndefined();
  });

  it("destroys idempotently without leaks", async () => {
    await Tabview.destroy();
    await Tabview.destroy();
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
  });

  it("rejects the stable setup promise when the page closes the session synchronously during injection", async () => {
    vi.useFakeTimers();
    vi.spyOn(TabviewLifecycleCoordinator.prototype, "init").mockImplementation((): boolean => {
      throw new Error("coordinator init boom");
    });
    (window as any).__YTI_TABVIEW_MAIN__ = pageMain;

    const setupPromise = Tabview.setup();
    expect(setupPromise).toBeInstanceOf(Promise);

    await expect(setupPromise).rejects.toThrow("page-init-failed");
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("locks a session when the peer closes before confirming cleanup", async () => {
    vi.useFakeTimers();

    let sessionId: string = "";
    (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: { sessionId: string }): void => {
      sessionId = bootstrap.sessionId;
    };

    const setupPromise: Promise<void> = Tabview.setup();
    window.dispatchEvent(new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId,
        sender: "page",
        target: "sandbox",
        sequence: TABVIEW_CONSTANTS.INITIAL_SEQUENCE,
        body: { kind: "close", reason: "injection-failed" }
      }
    }));

    await expect(setupPromise).rejects.toThrow("Session closed during setup: injection-failed");
    const firstFailure: unknown = await Tabview.destroy().catch((err: unknown): unknown => err);
    await expect(Tabview.destroy()).rejects.toBe(firstFailure);
    await expect(Tabview.setup()).rejects.toThrow("reload required");
  });
});
