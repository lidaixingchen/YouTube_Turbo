import { describe, it, expect } from "vitest";
import { TABVIEW_CONSTANTS } from "../constants";
import { createSessionId } from "../protocol";
import { createTabviewSession } from "../session";
import type {
  TabviewBootstrap,
  TabviewSession,
  TabviewSessionNotice,
  LocaleSnapshot
} from "../types";

describe("TabviewSession", () => {
  const mockLocale: LocaleSnapshot = {
    locale: "zh-CN",
    direction: "ltr",
    messages: { tab_info: "简介" } as any
  };

  function createMockBootstrap(sessionId = createSessionId()): TabviewBootstrap {
    return {
      namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
      protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
      sessionId,
      initialLocale: mockLocale
    };
  }

  it("completes ready barrier and flushes queued commands FIFO", () => {
    const bootstrap = createMockBootstrap();
    const sandboxNotices: TabviewSessionNotice<"sandbox">[] = [];
    const pageNotices: TabviewSessionNotice<"page">[] = [];

    const sandboxSession: TabviewSession<"sandbox"> = createTabviewSession({
      role: "sandbox",
      bootstrap,
      receive: (notice) => sandboxNotices.push(notice)
    });

    const pageSession: TabviewSession<"page"> = createTabviewSession({
      role: "page",
      bootstrap,
      receive: (notice) => pageNotices.push(notice)
    });

    // Sandbox dispatches commands before ready
    const res1 = sandboxSession.dispatch({ type: "set-active-tab", tabKey: "comments" });
    const res2 = sandboxSession.dispatch({ type: "set-font-size", tabKey: "comments", fontSize: 16 });
    expect(res1).toEqual({ status: "queued" });
    expect(res2).toEqual({ status: "queued" });
    expect(pageNotices.length).toBe(0);

    // Page dispatches event before ready -> should be queued
    const resEvt = pageSession.dispatch({ type: "tab-changed", tabKey: "videos" });
    expect(resEvt).toEqual({ status: "queued" });

    // Page issues ready
    const resReady = pageSession.dispatch({
      type: "ready",
      protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION
    });
    expect(resReady).toEqual({ status: "sent" });

    // Sandbox receives ready notice
    expect(sandboxNotices[0]).toEqual({
      kind: "message",
      message: { type: "ready", protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION }
    });

    // Page receives flushed commands in FIFO order
    expect(pageNotices).toEqual([
      { kind: "message", message: { type: "set-active-tab", tabKey: "comments" } },
      { kind: "message", message: { type: "set-font-size", tabKey: "comments", fontSize: 16 } }
    ]);

    // Sandbox receives the queued page event after ready
    expect(sandboxNotices[1]).toEqual({
      kind: "message",
      message: { type: "tab-changed", tabKey: "videos" }
    });

    sandboxSession.close();
    pageSession.close();
  });

  it("isolates sessions with different sessionIds", () => {
    const bootstrapA = createMockBootstrap(createSessionId());
    const bootstrapB = createMockBootstrap(createSessionId());

    const noticesA: TabviewSessionNotice<"sandbox">[] = [];
    const noticesB: TabviewSessionNotice<"sandbox">[] = [];

    const sandboxA = createTabviewSession({
      role: "sandbox",
      bootstrap: bootstrapA,
      receive: (notice) => noticesA.push(notice)
    });

    const sandboxB = createTabviewSession({
      role: "sandbox",
      bootstrap: bootstrapB,
      receive: (notice) => noticesB.push(notice)
    });

    const pageA = createTabviewSession({
      role: "page",
      bootstrap: bootstrapA,
      receive: () => {}
    });

    pageA.dispatch({
      type: "ready",
      protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION
    });

    // Only sandboxA receives the ready notice
    expect(noticesA.length).toBe(1);
    expect(noticesB.length).toBe(0);

    sandboxA.close();
    sandboxB.close();
    pageA.close();
  });

  it("handles duplicate ready with protocol-error without refaulting", () => {
    const bootstrap = createMockBootstrap();
    const sandboxNotices: TabviewSessionNotice<"sandbox">[] = [];

    const sandbox = createTabviewSession({
      role: "sandbox",
      bootstrap,
      receive: (notice) => sandboxNotices.push(notice)
    });

    const page = createTabviewSession({
      role: "page",
      bootstrap,
      receive: () => {}
    });

    page.dispatch({ type: "ready", protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION });
    expect(sandboxNotices.length).toBe(1);

    // Second ready from page
    page.dispatch({ type: "ready", protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION });
    // Sandbox reports duplicate-ready
    const lastNotice = sandboxNotices[sandboxNotices.length - 1];
    expect(lastNotice.kind).toBe("protocol-error");
    if (lastNotice.kind === "protocol-error") {
      expect(lastNotice.error.code).toBe("duplicate-ready");
    }

    sandbox.close();
    page.close();
  });

  it("closes cleanly and notifies peer", () => {
    const bootstrap = createMockBootstrap();
    const sandboxNotices: TabviewSessionNotice<"sandbox">[] = [];
    const pageNotices: TabviewSessionNotice<"page">[] = [];

    const sandbox = createTabviewSession({
      role: "sandbox",
      bootstrap,
      receive: (notice) => sandboxNotices.push(notice)
    });

    const page = createTabviewSession({
      role: "page",
      bootstrap,
      receive: (notice) => pageNotices.push(notice)
    });

    sandbox.close("feature-disabled");

    expect(pageNotices).toContainEqual({
      kind: "closed",
      reason: "feature-disabled"
    });

    expect(sandbox.dispatch({ type: "set-active-tab", tabKey: "info" })).toEqual({
      status: "closed"
    });

    page.close();
  });
});
