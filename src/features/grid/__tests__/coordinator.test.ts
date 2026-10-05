import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GridCoordinator } from "../coordinator";
import { GRID_CONSTANTS } from "../constants";

const GRID_TEST_MIDDLE_INSERTION_ITEM_COUNT: number = 6;
const NATIVE_MUTATION_OBSERVER: typeof MutationObserver = globalThis.MutationObserver;

describe("GridCoordinator", () => {
  let coordinator: GridCoordinator;
  let container: HTMLElement;
  let matchMediaDescriptor: PropertyDescriptor | undefined;

  const installMatchMediaStub = (): void => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (media: string): MediaQueryList =>
        ({
          matches: false,
          media,
          onchange: null,
          addEventListener: (): void => undefined,
          removeEventListener: (): void => undefined,
          addListener: (): void => undefined,
          removeListener: (): void => undefined,
          dispatchEvent: (): boolean => false
        } as unknown as MediaQueryList)
    });
  };

  const flushMicrotasks = async (): Promise<void> => {
    await new Promise<void>((resolve: () => void) => queueMicrotask(resolve));
  };

  beforeEach(() => {
    matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
    document.body.innerHTML = "";
    container = document.createElement("ytd-rich-grid-renderer");
    const contents = document.createElement("div");
    contents.id = "contents";
    contents.className = "ytd-rich-grid-renderer";
    container.appendChild(contents);
    document.body.appendChild(container);

    // Default window width to 1200px (4 columns)
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1200
    });

    coordinator = GridCoordinator.getInstance();
  });

  afterEach(() => {
    coordinator.destroy();
    document.body.innerHTML = "";
    if (matchMediaDescriptor) {
      Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
    matchMediaDescriptor = undefined;
    vi.restoreAllMocks();
  });

  const createItem = (id: string): HTMLElement => {
    const el: HTMLElement = document.createElement("ytd-rich-item-renderer");
    el.id = id;
    return el;
  };

  const createSection = (id: string): HTMLElement => {
    const el: HTMLElement = document.createElement("ytd-rich-section-renderer");
    el.id = id;
    return el;
  };

  const getContents = (): HTMLElement => {
    return document.querySelector<HTMLElement>(GRID_CONSTANTS.FEED_CONTAINER_SELECTOR)!;
  };

  it("identifies node types correctly without allocating string uppercase copies", () => {
    const item = createItem("i1");
    const section = createSection("s1");
    const other = document.createElement("div");

    expect(coordinator.getNodeType(item)).toBe("item");
    expect(coordinator.getNodeType(section)).toBe("section");
    expect(coordinator.getNodeType(other)).toBe("other");
    expect(coordinator.getNodeType(null)).toBe("other");
  });

  it("performs full rebalance on initial setup and leaves comment anchors", () => {
    const contents = getContents();
    // 3 items before section -> in 4-col layout, needs 1 item from after section
    const i1 = createItem("i1");
    const i2 = createItem("i2");
    const i3 = createItem("i3");
    const s1 = createSection("s1");
    const i4 = createItem("i4");
    const i5 = createItem("i5");

    contents.appendChild(i1);
    contents.appendChild(i2);
    contents.appendChild(i3);
    contents.appendChild(s1);
    contents.appendChild(i4);
    contents.appendChild(i5);

    coordinator.rebalance();

    // i4 should be moved before s1
    const children = Array.from(contents.children);
    expect(children.indexOf(i4)).toBe(3);
    expect(children.indexOf(s1)).toBe(4);
    expect(i4.getAttribute(GRID_CONSTANTS.DATA_ATTRS.REBALANCED)).toBe("true");

    // A comment anchor should be placed where i4 originally was
    expect(coordinator.getAnchorCount()).toBe(1);

    // Tail state: s1 reset row, then i5 remains (remainder = 1)
    expect(coordinator.getTailState().tailRemainder).toBe(1);
    expect(coordinator.getTailState().pendingSection).toBeNull();
  });

  it("restores original DOM topology idempotently when reverting to native", () => {
    const contents = getContents();
    const i1 = createItem("i1");
    const i2 = createItem("i2");
    const i3 = createItem("i3");
    const s1 = createSection("s1");
    const i4 = createItem("i4");

    contents.appendChild(i1);
    contents.appendChild(i2);
    contents.appendChild(i3);
    contents.appendChild(s1);
    contents.appendChild(i4);

    coordinator.rebalance();
    expect(i4.nextElementSibling).toBe(s1);

    coordinator.revertToNative();

    // i4 should be returned to its anchor after s1
    expect(s1.nextElementSibling).toBe(i4);
    expect(i4.hasAttribute(GRID_CONSTANTS.DATA_ATTRS.REBALANCED)).toBe(false);
    expect(coordinator.getAnchorCount()).toBe(0);
  });

  it("prevents topological drift (snowballing) across repeated breakpoint switches", () => {
    const contents = getContents();
    const s1 = createSection("s1");
    const items = [
      createItem("i1"),
      createItem("i2"),
      createItem("i3"),
      s1,
      createItem("i4"),
      createItem("i5"),
      createItem("i6"),
      createItem("i7"),
      createItem("i8")
    ];
    items.forEach((el) => contents.appendChild(el));

    // 1. First run at 4 columns: 3 items before s1 -> needs 1 (i4 moved before s1)
    coordinator.rebalance();
    let beforeS1 = [];
    let cur = s1.previousElementSibling;
    while (cur) {
      beforeS1.unshift(cur);
      cur = cur.previousElementSibling;
    }
    expect(beforeS1).toHaveLength(4); // i1, i2, i3, i4

    // 2. Switch to 3 columns (window.innerWidth = 900)
    Object.defineProperty(window, "innerWidth", { value: 900 });
    coordinator.rebalance();

    beforeS1 = [];
    cur = s1.previousElementSibling;
    while (cur) {
      beforeS1.unshift(cur);
      cur = cur.previousElementSibling;
    }
    // In 3 columns: original i1, i2, i3 perfectly fill 1 row! No items needed before s1
    expect(beforeS1).toHaveLength(3); // exactly i1, i2, i3

    // 3. Switch back to 4 columns (window.innerWidth = 1200)
    Object.defineProperty(window, "innerWidth", { value: 1200 });
    coordinator.rebalance();

    beforeS1 = [];
    cur = s1.previousElementSibling;
    while (cur) {
      beforeS1.unshift(cur);
      cur = cur.previousElementSibling;
    }
    // Must remain exactly 4 items, never 5 or more (no snowballing accumulation)
    expect(beforeS1).toHaveLength(4);
    expect(coordinator.getAnchorCount()).toBe(1);
  });

  it("executes O(1) fast path without moving DOM nodes when appending pure items", async () => {
    const contents = getContents();
    const i1 = createItem("i1");
    const i2 = createItem("i2");
    contents.appendChild(i1);
    contents.appendChild(i2);

    // Initial baseline
    coordinator.rebalance();
    expect(coordinator.getTailState().tailRemainder).toBe(2);
    expect(coordinator.getAnchorCount()).toBe(0);

    // Append 2 new items
    const i3 = createItem("i3");
    const i4 = createItem("i4");
    contents.appendChild(i3);
    contents.appendChild(i4);

    // Trigger incremental rebalance with added nodes
    const fullRebalanceSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(
      coordinator as unknown as { rebalanceFull: () => void },
      "rebalanceFull"
    );
    coordinator.scheduleRebalance(false, [i3, i4]);

    await flushMicrotasks();

    // Tail remainder should be (2 + 2) % 4 = 0
    expect(coordinator.getTailState().tailRemainder).toBe(0);
    // Zero anchors created, no DOM relocation performed
    expect(coordinator.getAnchorCount()).toBe(0);
    expect(fullRebalanceSpy).not.toHaveBeenCalled();
  });

  it("heals pending section alignment when subsequent items arrive", async () => {
    const contents = getContents();
    // 2 items before s1 -> needs 2 items. Only 1 item follows s1 -> section is pending
    const i1 = createItem("i1");
    const i2 = createItem("i2");
    const s1 = createSection("s1");
    const i3 = createItem("i3");

    contents.appendChild(i1);
    contents.appendChild(i2);
    contents.appendChild(s1);
    contents.appendChild(i3);

    coordinator.rebalance();
    expect(coordinator.getTailState().pendingSection === s1).toBe(true);

    // Later, network streams in 2 more items
    const i4 = createItem("i4");
    const i5 = createItem("i5");
    contents.appendChild(i4);
    contents.appendChild(i5);

    coordinator.scheduleRebalance(false, [i4, i5]);
    await flushMicrotasks();

    // Pending section should be healed and cleared
    expect(coordinator.getTailState().pendingSection).toBeNull();
    // S1 has 4 items before it (i1, i2, and 2 items moved from after s1)
    let countBefore = 0;
    let node = s1.previousElementSibling;
    while (node) {
      countBefore++;
      node = node.previousElementSibling;
    }
    expect(countBefore).toBe(4);
  });

  it("triggers full self-healing path when items are removed from middle", async () => {
    const contents = getContents();
    const i1 = createItem("i1");
    const i2 = createItem("i2");
    const i3 = createItem("i3");
    const i4 = createItem("i4");
    const s1 = createSection("s1");
    const i5 = createItem("i5");

    contents.appendChild(i1);
    contents.appendChild(i2);
    contents.appendChild(i3);
    contents.appendChild(i4);
    contents.appendChild(s1);
    contents.appendChild(i5);

    // Initial 4 items before section: aligned
    coordinator.rebalance();
    expect(coordinator.getAnchorCount()).toBe(0);

    // Now remove i2 (middle deletion)
    i2.remove();

    // Schedule rebalance with forceFull = true
    coordinator.scheduleRebalance(true);
    await flushMicrotasks();

    // Now 3 items were left before s1 -> needs i5 to fill row
    expect(coordinator.getAnchorCount()).toBe(1);
    expect(i5.nextElementSibling).toBe(s1);
  });

  it("completely cleans up styles, anchors and state on destroy", () => {
    const contents = getContents();
    const i1 = createItem("i1");
    const s1 = createSection("s1");
    const i2 = createItem("i2");
    const i3 = createItem("i3");
    const i4 = createItem("i4");

    contents.appendChild(i1);
    contents.appendChild(s1);
    contents.appendChild(i2);
    contents.appendChild(i3);
    contents.appendChild(i4);

    coordinator.rebalance();
    expect(coordinator.getAnchorCount()).toBeGreaterThan(0);

    coordinator.destroy();

    // All relocations reverted
    expect(coordinator.getAnchorCount()).toBe(0);
    expect(coordinator.getTailState().tailRemainder).toBe(0);
    expect(coordinator.getTailState().pendingSection).toBeNull();
  });

  it("prevents zombie node resurrection when a relocated item is deleted", () => {
    const contents = getContents();
    const i1 = createItem("i1");
    const i2 = createItem("i2");
    const i3 = createItem("i3");
    const s1 = createSection("s1");
    const i4 = createItem("i4");

    contents.appendChild(i1);
    contents.appendChild(i2);
    contents.appendChild(i3);
    contents.appendChild(s1);
    contents.appendChild(i4);

    coordinator.rebalance();
    // i4 was moved before s1
    expect(i4.nextElementSibling).toBe(s1);
    expect(coordinator.getAnchorCount()).toBe(1);

    // Simulate YouTube or user removing i4 (disconnected node)
    i4.remove();
    expect(i4.isConnected).toBe(false);

    // Revert to native should NOT resurrect disconnected i4
    coordinator.revertToNative();

    expect(i4.isConnected).toBe(false);
    expect(contents.contains(i4)).toBe(false);
    expect(coordinator.getAnchorCount()).toBe(0);
  });

  it("falls back to full rebalance when pending section is unfulfilled and a new section arrives", async () => {
    const contents = getContents();
    // 1 item before s1 -> needs 3 items. 0 items follow
    const i1 = createItem("i1");
    const s1 = createSection("s1");
    contents.appendChild(i1);
    contents.appendChild(s1);

    coordinator.rebalance();
    expect(coordinator.getTailState().pendingSection).toBe(s1);

    // Now append: 1 item, then another section s2, then 4 items
    const i2 = createItem("i2");
    const s2 = createSection("s2");
    const i3 = createItem("i3");
    const i4 = createItem("i4");
    const i5 = createItem("i5");
    const i6 = createItem("i6");

    contents.appendChild(i2);
    contents.appendChild(s2);
    contents.appendChild(i3);
    contents.appendChild(i4);
    contents.appendChild(i5);
    contents.appendChild(i6);

    coordinator.scheduleRebalance(false, [i2, s2, i3, i4, i5, i6]);
    await flushMicrotasks();

    // Should have safely recovered and cleared s1 pending state via full rebalance fallback
    expect(coordinator.getTailState().pendingSection).toBeNull();
  });

  it("does not rebalance after destroy when work is already queued", async () => {
    const contents: HTMLElement = getContents();
    const i1: HTMLElement = createItem("i1");
    const i2: HTMLElement = createItem("i2");
    const i3: HTMLElement = createItem("i3");
    const section: HTMLElement = createSection("s1");
    const i4: HTMLElement = createItem("i4");
    contents.append(i1, i2, i3, section, i4);
    installMatchMediaStub();

    coordinator.init();
    await flushMicrotasks();
    expect(coordinator.getAnchorCount()).toBe(1);

    coordinator.scheduleRebalance();
    coordinator.destroy();
    expect(coordinator.getAnchorCount()).toBe(0);
    expect(section.nextElementSibling).toBe(i4);

    await flushMicrotasks();
    expect(coordinator.getAnchorCount()).toBe(0);
    expect(section.nextElementSibling).toBe(i4);
  });

  it("keeps a queued callback from consuming state after destroy and re-init", async () => {
    installMatchMediaStub();
    coordinator.init();
    await flushMicrotasks();

    const fullRebalanceSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(
      coordinator as unknown as { rebalanceFull: () => void },
      "rebalanceFull"
    );
    coordinator.scheduleRebalance(true);
    coordinator.destroy();
    container.remove();

    const nextContainer: HTMLElement = document.createElement("ytd-rich-grid-renderer");
    const nextContents: HTMLElement = document.createElement("div");
    nextContents.id = "contents";
    nextContents.className = "ytd-rich-grid-renderer";
    const nextItems: HTMLElement[] = [
      createItem("next-1"),
      createItem("next-2"),
      createItem("next-3"),
      createItem("next-4")
    ];
    const nextSection: HTMLElement = createSection("next-section");
    nextContents.append(nextItems[0], nextItems[1], nextItems[2], nextSection, nextItems[3]);
    nextContainer.appendChild(nextContents);
    document.body.appendChild(nextContainer);
    container = nextContainer;

    let fullCallsBeforeNewLifecycleTask: number = -1;
    queueMicrotask((): void => {
      fullCallsBeforeNewLifecycleTask = fullRebalanceSpy.mock.calls.length;
    });
    coordinator.init();
    await flushMicrotasks();

    expect(fullCallsBeforeNewLifecycleTask).toBe(0);
    expect(fullRebalanceSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps a queued callback from consuming state after navigation", async () => {
    installMatchMediaStub();
    coordinator.init();
    await flushMicrotasks();

    const fullRebalanceSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(
      coordinator as unknown as { rebalanceFull: () => void },
      "rebalanceFull"
    );
    coordinator.scheduleRebalance(true);
    let fullCallsBeforeNewRouteTask: number = -1;
    queueMicrotask((): void => {
      fullCallsBeforeNewRouteTask = fullRebalanceSpy.mock.calls.length;
    });

    container.remove();
    const nextContainer: HTMLElement = document.createElement("ytd-rich-grid-renderer");
    const nextContents: HTMLElement = document.createElement("div");
    nextContents.id = "contents";
    nextContents.className = "ytd-rich-grid-renderer";
    const nextItems: HTMLElement[] = [
      createItem("next-1"),
      createItem("next-2"),
      createItem("next-3"),
      createItem("next-4")
    ];
    const nextSection: HTMLElement = createSection("next-section");
    nextContents.append(nextItems[0], nextItems[1], nextItems[2], nextSection, nextItems[3]);
    nextContainer.appendChild(nextContents);
    document.body.appendChild(nextContainer);
    container = nextContainer;
    window.dispatchEvent(new Event("yt-navigate-finish"));
    await flushMicrotasks();

    expect(fullCallsBeforeNewRouteTask).toBe(0);
    expect(fullRebalanceSpy).toHaveBeenCalledTimes(1);
    expect(coordinator.getAnchorCount()).toBe(1);
  });

  it("fully rebalances a section inserted before the third of six items", async () => {
    const contents: HTMLElement = getContents();
    const items: HTMLElement[] = [];
    for (let index: number = 0; index < GRID_TEST_MIDDLE_INSERTION_ITEM_COUNT; index++) {
      const item: HTMLElement = createItem(`i${index}`);
      items.push(item);
      contents.appendChild(item);
    }
    coordinator.rebalance();

    const fullRebalanceSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(
      coordinator as unknown as { rebalanceFull: () => void },
      "rebalanceFull"
    );
    const section: HTMLElement = createSection("middle-section");
    contents.insertBefore(section, items[GRID_CONSTANTS.COLUMNS.TWO]);
    coordinator.scheduleRebalance(false, [section]);
    await flushMicrotasks();

    const children: Element[] = Array.from(contents.children);
    expect(children.indexOf(section)).toBe(GRID_CONSTANTS.COLUMNS.FOUR);
    expect(children.slice(0, GRID_CONSTANTS.COLUMNS.FOUR)).toEqual(items.slice(0, GRID_CONSTANTS.COLUMNS.FOUR));
    expect(fullRebalanceSpy).toHaveBeenCalledTimes(1);
  });

  it("fully rebalances an item inserted before an existing section", async () => {
    const contents: HTMLElement = getContents();
    const items: HTMLElement[] = [
      createItem("i1"),
      createItem("i2"),
      createItem("i3"),
      createItem("i4"),
      createItem("i5"),
      createItem("i6"),
      createItem("i7")
    ];
    const section: HTMLElement = createSection("s1");
    contents.append(...items.slice(0, 4), section, ...items.slice(4));
    coordinator.rebalance();

    const fullRebalanceSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(
      coordinator as unknown as { rebalanceFull: () => void },
      "rebalanceFull"
    );
    const insertedItem: HTMLElement = createItem("inserted-item");
    contents.insertBefore(insertedItem, section);
    coordinator.scheduleRebalance(false, [insertedItem]);
    await flushMicrotasks();

    expect(Array.from(contents.children).indexOf(section)).toBe(GRID_CONSTANTS.COLUMNS.FOUR * GRID_CONSTANTS.COLUMNS.TWO);
    expect(fullRebalanceSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps native append batches equivalent to a full rebalance across pending sections", async () => {
    vi.stubGlobal("MutationObserver", NATIVE_MUTATION_OBSERVER);
    installMatchMediaStub();

    const contents: HTMLElement = getContents();
    const items: HTMLElement[] = [
      createItem("A"),
      createItem("B"),
      createItem("C")
    ];
    const firstSection: HTMLElement = createSection("S1");
    const secondSection: HTMLElement = createSection("S2");
    contents.append(items[0], items[1], firstSection, items[2], secondSection);

    coordinator.init();
    await flushMicrotasks();

    const appendedItems: HTMLElement[] = [
      createItem("D"),
      createItem("E"),
      createItem("F")
    ];
    for (const item of appendedItems) {
      contents.appendChild(item);
      await flushMicrotasks();
    }

    const layoutAfterNativeAppends: string[] = Array.from(contents.children, (element: Element): string => element.id);
    coordinator.rebalance();
    const layoutAfterFullRebalance: string[] = Array.from(contents.children, (element: Element): string => element.id);

    expect(layoutAfterNativeAppends).toEqual(layoutAfterFullRebalance);
    expect(layoutAfterFullRebalance).toEqual(["A", "B", "C", "D", "S1", "S2", "E", "F"]);
  });

  it("disconnects old native grid observation on navigation and observes the reentered grid", async () => {
    vi.stubGlobal("MutationObserver", NATIVE_MUTATION_OBSERVER);
    installMatchMediaStub();

    const oldContents: HTMLElement = getContents();
    const oldItems: HTMLElement[] = [
      createItem("old-1"),
      createItem("old-2"),
      createItem("old-3"),
      createItem("old-4")
    ];
    const oldSection: HTMLElement = createSection("old-section");
    oldContents.append(...oldItems.slice(0, GRID_CONSTANTS.COLUMNS.THREE), oldSection, oldItems[GRID_CONSTANTS.COLUMNS.THREE]);

    coordinator.init();
    await flushMicrotasks();

    const fullRebalanceSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(
      coordinator as unknown as { rebalanceFull: () => void },
      "rebalanceFull"
    );

    coordinator.scheduleRebalance(true);
    container.remove();
    window.dispatchEvent(new Event("yt-navigate-finish"));
    oldContents.appendChild(createItem("old-route-mutation"));
    await flushMicrotasks();

    expect(fullRebalanceSpy).not.toHaveBeenCalled();
    expect(coordinator.getAnchorCount()).toBe(0);

    const nextContainer: HTMLElement = document.createElement("ytd-rich-grid-renderer");
    const nextContents: HTMLElement = document.createElement("div");
    nextContents.id = "contents";
    nextContents.className = "ytd-rich-grid-renderer";
    const nextItems: HTMLElement[] = [
      createItem("next-1"),
      createItem("next-2"),
      createItem("next-3"),
      createItem("next-4")
    ];
    const nextSection: HTMLElement = createSection("next-section");
    nextContents.append(...nextItems.slice(0, GRID_CONSTANTS.COLUMNS.THREE), nextSection, nextItems[GRID_CONSTANTS.COLUMNS.THREE]);
    nextContainer.appendChild(nextContents);
    document.body.appendChild(nextContainer);
    container = nextContainer;

    window.dispatchEvent(new Event("yt-navigate-finish"));
    await flushMicrotasks();

    expect(fullRebalanceSpy).toHaveBeenCalledTimes(1);
    expect(coordinator.getAnchorCount()).toBe(1);
    expect(nextItems[GRID_CONSTANTS.COLUMNS.THREE].nextElementSibling).toBe(nextSection);
  });
});

