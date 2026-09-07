import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExpanderFixer, funcCanCollapse } from "../expander-fixer";
import { TabsView } from "../tabs-view";
import { PAGE_CONSTANTS } from "../constants";
import type { RouteGeneration } from "../types";
import {
  installFakeObservers,
  resetFakeObservers,
  assertNoActiveFakeObservers,
  FakeResizeObserver,
  FakeIntersectionObserver
} from "../../../../test/fake-observers";

describe("ExpanderFixer", () => {
  let tabsView: TabsView;
  let fixer: ExpanderFixer;
  const gen1 = 1 as RouteGeneration;

  beforeEach(() => {
    vi.useFakeTimers();
    installFakeObservers();
    resetFakeObservers();
    tabsView = new TabsView();
    fixer = new ExpanderFixer(tabsView);
  });

  afterEach(() => {
    fixer.destroy();
    assertNoActiveFakeObservers();
    resetFakeObservers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not call fixForTabDisplay if rightTabs width is unchanged", () => {
    const rightTabs = document.createElement("div");
    rightTabs.id = PAGE_CONSTANTS.IDS.RIGHT_TABS;
    document.body.appendChild(rightTabs);

    const fixSpy = vi.spyOn(fixer, "fixForTabDisplay");

    fixer.activateRoute({
      generation: gen1,
      rightTabs,
      initialTab: "info"
    });

    // Initial activation calls fixForTabDisplay once
    expect(fixSpy).toHaveBeenCalledTimes(1);
    fixSpy.mockClear();

    const ro = FakeResizeObserver.allInstances[0];
    expect(ro).toBeDefined();

    // Trigger resize with same width
    ro.trigger([
      {
        target: rightTabs,
        contentRect: { width: 0, height: 100 } as DOMRectReadOnly,
        borderBoxSize: [{ inlineSize: 0, blockSize: 100 }]
      }
    ]);
    vi.advanceTimersByTime(16);
    expect(fixSpy).not.toHaveBeenCalled();

    // Trigger with non-zero width
    ro.trigger([
      {
        target: rightTabs,
        contentRect: { width: 300, height: 100 } as DOMRectReadOnly,
        borderBoxSize: [{ inlineSize: 300, blockSize: 100 }]
      }
    ]);
    vi.advanceTimersByTime(16);
    expect(fixSpy).toHaveBeenCalledTimes(1);
    expect(fixSpy).toHaveBeenCalledWith(true);

    // Trigger with same 300 width again
    fixSpy.mockClear();
    ro.trigger([
      {
        target: rightTabs,
        contentRect: { width: 300, height: 100 } as DOMRectReadOnly,
        borderBoxSize: [{ inlineSize: 300, blockSize: 100 }]
      }
    ]);
    vi.advanceTimersByTime(16);
    expect(fixSpy).not.toHaveBeenCalled();
  });

  it("coalesces multiple rapid resize events within a single animation frame", () => {
    const rightTabs = document.createElement("div");
    rightTabs.id = PAGE_CONSTANTS.IDS.RIGHT_TABS;
    document.body.appendChild(rightTabs);

    const fixSpy = vi.spyOn(fixer, "fixForTabDisplay");

    fixer.activateRoute({
      generation: gen1,
      rightTabs,
      initialTab: "info"
    });
    fixSpy.mockClear();

    const ro = FakeResizeObserver.allInstances[0];
    // Trigger 3 continuous resize events in same frame
    ro.trigger([{ contentRect: { width: 320, height: 100 } as DOMRectReadOnly }]);
    ro.trigger([{ contentRect: { width: 340, height: 100 } as DOMRectReadOnly }]);
    ro.trigger([{ contentRect: { width: 360, height: 100 } as DOMRectReadOnly }]);

    expect(fixSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(fixSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores intersection when comments tab is not active", () => {
    const expander = document.createElement("div");
    document.body.appendChild(expander);

    const calcMock = vi.fn();
    (expander as any).polymerController = {
      calculateCanCollapse: calcMock
    };

    fixer.activateRoute({
      generation: gen1,
      rightTabs: document.createElement("div"),
      initialTab: "info"
    });

    fixer.attachCommentEntry(expander, gen1);
    const io = FakeIntersectionObserver.allInstances[0];
    expect(io).toBeDefined();

    // Trigger intersection while info tab is active
    io.trigger([
      {
        target: expander,
        isIntersecting: true
      }
    ]);

    expect(calcMock).not.toHaveBeenCalled();
    expect(expander.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED)).toBe(false);
  });

  it("calculates collapse and projects intersected state when comments tab is active", () => {
    const flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    document.body.appendChild(flexy);

    const expander = document.createElement("div");
    document.body.appendChild(expander);

    const calcMock = vi.fn();
    (expander as any).polymerController = {
      calculateCanCollapse: calcMock
    };

    fixer.activateRoute({
      generation: gen1,
      rightTabs: document.createElement("div"),
      initialTab: "comments"
    });

    const disposer = fixer.attachCommentEntry(expander, gen1);
    const io = FakeIntersectionObserver.allInstances[0];

    // Trigger intersecting
    io.trigger([
      {
        target: expander,
        isIntersecting: true
      }
    ]);

    expect(calcMock).toHaveBeenCalledWith(true);
    expect(expander.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED)).toBe(true);
    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER)).toBe(true);

    // Trigger non-intersecting
    io.trigger([
      {
        target: expander,
        isIntersecting: false
      }
    ]);
    expect(expander.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED)).toBe(false);

    // Disposer unobserves
    disposer();
    expect(io.observedTargets).not.toContain(expander);
  });

  it("skips duplicate measurement of comment expanders when tabs width is unchanged and invalidates on resize", () => {
    const rightTabs = document.createElement("div");
    rightTabs.id = PAGE_CONSTANTS.IDS.RIGHT_TABS;
    const expander = document.createElement("div");
    document.body.appendChild(rightTabs);
    document.body.appendChild(expander);

    const calcMock = vi.fn();
    (expander as any).polymerController = {
      calculateCanCollapse: calcMock
    };

    fixer.activateRoute({
      generation: gen1,
      rightTabs,
      initialTab: "comments"
    });

    fixer.attachCommentEntry(expander, gen1);
    const io = FakeIntersectionObserver.allInstances[0];
    const ro = FakeResizeObserver.allInstances[0];

    // First intersection: calculates once
    io.trigger([{ target: expander, isIntersecting: true }]);
    expect(calcMock).toHaveBeenCalledTimes(1);

    // Second intersection with unchanged width: memoization skips calculation
    calcMock.mockClear();
    io.trigger([{ target: expander, isIntersecting: true }]);
    expect(calcMock).not.toHaveBeenCalled();

    // Resize to new width: invalidates memoization and recalculates
    ro.trigger([
      {
        target: rightTabs,
        contentRect: { width: 450, height: 100 } as DOMRectReadOnly,
        borderBoxSize: [{ inlineSize: 450, blockSize: 100 }]
      }
    ]);
    vi.advanceTimersByTime(16);
    expect(calcMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up on route deactivation and rejects stale generation calls", () => {
    const rightTabs = document.createElement("div");
    const expander = document.createElement("div");
    document.body.appendChild(rightTabs);
    document.body.appendChild(expander);

    fixer.activateRoute({
      generation: gen1,
      rightTabs,
      initialTab: "comments"
    });

    fixer.attachCommentEntry(expander, gen1);
    expect(FakeResizeObserver.allInstances[0].observedTargets).toContain(rightTabs);
    expect(FakeIntersectionObserver.allInstances[0].observedTargets).toContain(expander);

    // Deactivate route gen1
    fixer.deactivateRoute(gen1);

    expect(FakeResizeObserver.activeInstances.size).toBe(0);
    expect(FakeIntersectionObserver.activeInstances.size).toBe(0);

    // Late calls with gen1 should be ignored
    fixer.setActiveTab("info", gen1);
    const lateDisposer = fixer.attachCommentEntry(expander, gen1);
    expect(FakeIntersectionObserver.allInstances.length).toBe(1); // No new observer created
    lateDisposer();
  });

  it("extracts comments count from Polymer controller runs and updates tabsView", () => {
    const tabComments = document.createElement("div");
    tabComments.id = PAGE_CONSTANTS.IDS.TAB_COMMENTS;
    const header = document.createElement("ytd-comments-header-renderer");
    (header as any).polymerController = {
      data: {
        commentsCount: {
          runs: [{ text: "4,520 条评论" }]
        }
      }
    };
    tabComments.appendChild(header);
    document.body.appendChild(tabComments);

    const updateSpy = vi.spyOn(tabsView, "updateCommentCount");
    fixer.updateCommentsCounter();

    expect(updateSpy).toHaveBeenCalledWith("4,520 条评论");
  });

  describe("funcCanCollapse", () => {
    it("consumes __cachedCanToggle fast path and resets to undefined without delete", () => {
      const controller: Record<string, unknown> = {
        __cachedCanToggle: true,
        canToggle: false
      };

      funcCanCollapse.call(controller as any);

      expect(controller.canToggle).toBe(true);
      expect(controller.__cachedCanToggle).toBeUndefined();
      expect("__cachedCanToggle" in controller).toBe(true);
    });

    it("evaluates multi-line overflow when shouldUseNumberOfLines is true", () => {
      const content = document.createElement("div");
      Object.defineProperty(content, "offsetHeight", { value: 40, configurable: true });
      Object.defineProperty(content, "scrollHeight", { value: 80, configurable: true });

      const controller: Record<string, unknown> = {
        shouldUseNumberOfLines: true,
        collapsed: true,
        content,
        canToggle: false
      };

      funcCanCollapse.call(controller as any);
      expect(controller.canToggle).toBe(true);
    });

    it("evaluates collapsedHeight threshold when shouldUseNumberOfLines is false", () => {
      const content = document.createElement("div");
      Object.defineProperty(content, "scrollHeight", { value: 60, configurable: true });

      const controller: Record<string, unknown> = {
        shouldUseNumberOfLines: false,
        collapsedHeight: 80,
        content,
        canToggle: true
      };

      funcCanCollapse.call(controller as any);
      expect(controller.canToggle).toBe(false);
    });
  });

  it("skips calling unpatched native calculateCanCollapse in Phase 2 to prevent reflows", () => {
    const expander = document.createElement("div");
    document.body.appendChild(expander);

    let nativeCalled = false;
    const nativeCalculateCanCollapse = function (this: unknown): void {
      nativeCalled = true;
    };

    (expander as any).polymerController = {
      calculateCanCollapse: nativeCalculateCanCollapse,
      canToggle: false
    };

    fixer.activateRoute({
      generation: gen1,
      rightTabs: document.createElement("div"),
      initialTab: "comments"
    });

    fixer.batchFixCommentExpanders(false, [expander]);

    expect(nativeCalled).toBe(false);
    expect((expander as any).polymerController.canToggle).toBe(false);
    expect((expander as any).polymerController.__cachedCanToggle).toBeUndefined();
  });

  it("cancels pending resize rAF upon activateRoute to prevent cross-route executions", () => {
    const rightTabs = document.createElement("div");
    rightTabs.id = PAGE_CONSTANTS.IDS.RIGHT_TABS;
    document.body.appendChild(rightTabs);

    fixer.activateRoute({
      generation: gen1,
      rightTabs,
      initialTab: "info"
    });

    const fixSpy = vi.spyOn(fixer, "fixForTabDisplay");
    fixSpy.mockClear();

    const ro = FakeResizeObserver.allInstances[0];
    ro.trigger([{ contentRect: { width: 320, height: 100 } as DOMRectReadOnly }]);

    // Activate next route before rAF fires
    const gen2 = 2 as RouteGeneration;
    fixer.activateRoute({
      generation: gen2,
      rightTabs,
      initialTab: "info"
    });

    fixSpy.mockClear();
    vi.advanceTimersByTime(16);

    expect(fixSpy).not.toHaveBeenCalled();
  });
});
