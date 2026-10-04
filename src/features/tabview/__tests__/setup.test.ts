import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TABVIEW_CONSTANTS } from "../constants";
import { Tabview } from "../index";
import { TabviewLifecycleCoordinator } from "../page/coordinator";
import { main as pageMain } from "../page/index";

const READY_SEQUENCE: number = TABVIEW_CONSTANTS.INITIAL_SEQUENCE + 1;
const TEARDOWN_ACK_SEQUENCE: number = READY_SEQUENCE + 1;
const COMMAND_SEQUENCE: number = READY_SEQUENCE + 1;
const MANUAL_TEARDOWN_SEQUENCE: number = COMMAND_SEQUENCE + 1;

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

  function publishReady(sessionId: string): void {
    window.dispatchEvent(new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId,
        sender: "page",
        target: "sandbox",
        sequence: READY_SEQUENCE,
        body: {
          kind: "message",
          value: {
            type: "ready",
            protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION
          }
        }
      }
    }));
  }

  function publishActiveTabCommand(sessionId: string): void {
    window.dispatchEvent(new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId,
        sender: "sandbox",
        target: "page",
        sequence: COMMAND_SEQUENCE,
        body: {
          kind: "message",
          value: { type: "set-active-tab", tabKey: "videos" }
        }
      }
    }));
  }

  function publishTeardownRequest(sessionId: string): void {
    window.dispatchEvent(new CustomEvent(TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME, {
      detail: {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId,
        sender: "sandbox",
        target: "page",
        sequence: MANUAL_TEARDOWN_SEQUENCE,
        body: { kind: "control", action: { type: "teardown-request" } }
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
    ): HTMLScriptElement => {
      try {
        eval(options.textContent);
      } catch {
        // ignore
      }
      return document.createElement("script");
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

  it.each(["null", "throw"] as const)(
    "uses native script injection when GM_addElement %s",
    async (failureMode: "null" | "throw"): Promise<void> => {
      vi.useFakeTimers();

      const invokedSessionIds: string[] = [];
      (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: { sessionId: string }): void => {
        invokedSessionIds.push(bootstrap.sessionId);
        pageMain(bootstrap);
      };
      const initSpy: ReturnType<typeof vi.spyOn> = vi
        .spyOn(TabviewLifecycleCoordinator.prototype, "init")
        .mockReturnValue(true);
      const commandSpy: ReturnType<typeof vi.spyOn> = vi
        .spyOn(TabviewLifecycleCoordinator.prototype, "setActiveTab")
        .mockImplementation((): void => {});
      const destroySpy: ReturnType<typeof vi.spyOn> = vi
        .spyOn(TabviewLifecycleCoordinator.prototype, "destroy")
        .mockImplementation((): void => {});
      const nativeAppendChild: typeof document.head.appendChild = document.head.appendChild.bind(document.head);
      const appendSpy: ReturnType<typeof vi.spyOn> = vi
        .spyOn(document.head, "appendChild")
        .mockImplementation((node: Node): Node => {
          const scriptSource: string = node.textContent ?? "";
          if (node instanceof HTMLScriptElement && scriptSource.includes("window.__YTI_TABVIEW_MAIN__")) {
            eval(scriptSource);
          }
          return nativeAppendChild(node);
        });
      const injectionError: Error = new Error("GM_addElement failed");
      const gmAddElementSpy: ReturnType<typeof vi.fn> = vi.fn(
        (
          _target: HTMLElement,
          _tag: string,
          options: { textContent: string }
        ): HTMLScriptElement | null => {
          try {
            eval(options.textContent);
          } catch {
            return null;
          }
          if (failureMode === "throw") {
            throw injectionError;
          }
          return null;
        }
      );
      (window as any).GM_addElement = gmAddElementSpy;

      const scriptCountBefore: number = document.head.querySelectorAll("script").length;
      const setupPromise: Promise<void> = Tabview.setup();

      expect(gmAddElementSpy).toHaveBeenCalledOnce();
      expect(document.head.querySelectorAll("script")).toHaveLength(scriptCountBefore + 1);
      expect(invokedSessionIds).toHaveLength(2);
      const firstSessionId: string = invokedSessionIds[0];
      expect(invokedSessionIds).toEqual([firstSessionId, firstSessionId]);
      expect(initSpy).toHaveBeenCalledOnce();
      await expect(setupPromise).resolves.toBeUndefined();

      publishActiveTabCommand(firstSessionId);
      expect(commandSpy).toHaveBeenCalledTimes(1);

      const destroyPromise: Promise<void> = Tabview.destroy();
      publishTeardownRequest(firstSessionId);
      await expect(destroyPromise).resolves.toBeUndefined();
      expect(destroySpy).toHaveBeenCalledOnce();

      const retryPromise: Promise<void> = Tabview.setup();
      expect(invokedSessionIds).toHaveLength(4);
      const retrySessionId: string = invokedSessionIds[2];
      expect(invokedSessionIds.slice(2)).toEqual([retrySessionId, retrySessionId]);
      expect(retrySessionId).not.toBe(firstSessionId);
      expect(initSpy).toHaveBeenCalledTimes(2);
      await expect(retryPromise).resolves.toBeUndefined();

      publishActiveTabCommand(retrySessionId);
      expect(commandSpy).toHaveBeenCalledTimes(2);

      const retryDestroyPromise: Promise<void> = Tabview.destroy();
      publishTeardownRequest(retrySessionId);
      await expect(retryDestroyPromise).resolves.toBeUndefined();
      expect(destroySpy).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      appendSpy.mockRestore();
    }
  );

  it("uses the GM script element when injection succeeds", async (): Promise<void> => {
    vi.useFakeTimers();

    let injectedBootstrap: { sessionId: string } | null = null;
    (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: { sessionId: string }): void => {
      injectedBootstrap = bootstrap;
    };
    const nativeAppendSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(document.head, "appendChild");
    const gmAddElementSpy: ReturnType<typeof vi.fn> = vi.fn(
      (
        _target: HTMLElement,
        _tag: string,
        options: { textContent: string }
      ): HTMLScriptElement => {
        try {
          eval(options.textContent);
        } catch {
          return document.createElement("script");
        }
        return document.createElement("script");
      }
    );
    (window as any).GM_addElement = gmAddElementSpy;

    const setupPromise: Promise<void> = Tabview.setup();

    expect(gmAddElementSpy).toHaveBeenCalledOnce();
    expect(nativeAppendSpy).not.toHaveBeenCalled();
    expect(injectedBootstrap).not.toBeNull();
    publishReady(injectedBootstrap!.sessionId);
    await expect(setupPromise).resolves.toBeUndefined();
    nativeAppendSpy.mockRestore();

    const destroyPromise: Promise<void> = Tabview.destroy();
    acknowledgeTeardown(injectedBootstrap!.sessionId, TEARDOWN_ACK_SEQUENCE);
    await expect(destroyPromise).resolves.toBeUndefined();
  });

  it("settles failed injection and releases the sandbox session listener", async (): Promise<void> => {
    vi.useFakeTimers();

    const injectionError: Error = new Error("native injection failed");
    const removeListenerSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(window, "removeEventListener");
    const appendSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(document.head, "appendChild");
    appendSpy.mockImplementation((_node: Node): Node => {
      throw injectionError;
    });
    (window as any).GM_addElement = (): null => null;

    const setupPromise: Promise<void> = Tabview.setup();

    await expect(setupPromise).rejects.toBe(injectionError);
    expect(document.documentElement.getAttribute("tabview-loaded")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListenerSpy).toHaveBeenCalledWith(
      TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME,
      expect.any(Function)
    );

    await expect(Tabview.destroy()).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);

    appendSpy.mockRestore();
    let retryBootstrap: { sessionId: string } | null = null;
    (window as any).__YTI_TABVIEW_MAIN__ = (bootstrap: { sessionId: string }): void => {
      retryBootstrap = bootstrap;
    };
    (window as any).GM_addElement = (
      _target: HTMLElement,
      _tag: string,
      options: { textContent: string }
    ): HTMLScriptElement => {
      eval(options.textContent);
      return document.createElement("script");
    };

    const retryPromise: Promise<void> = Tabview.setup();
    expect(retryBootstrap).not.toBeNull();
    publishReady(retryBootstrap!.sessionId);
    await expect(retryPromise).resolves.toBeUndefined();
    const retryDestroyPromise: Promise<void> = Tabview.destroy();
    acknowledgeTeardown(retryBootstrap!.sessionId, TEARDOWN_ACK_SEQUENCE);
    await expect(retryDestroyPromise).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
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
