import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExpanderFixer } from "../expander-fixer";
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
    expect(fixSpy).not.toHaveBeenCalled();

    // Trigger with non-zero width
    ro.trigger([
      {
        target: rightTabs,
        contentRect: { width: 300, height: 100 } as DOMRectReadOnly,
        borderBoxSize: [{ inlineSize: 300, blockSize: 100 }]
      }
    ]);
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
    expect(fixSpy).not.toHaveBeenCalled();
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
});
