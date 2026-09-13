import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SlotMountBus } from "../slot-mount-bus";
import { TOOLBAR_CONSTANTS } from "../constants";
import { ReactiveDOMRegistry } from "../../../core/dom-registry";
import { FakeMutationObserver } from "../../../test/fake-observers";
import type { SlotDefinition, SlotMountContext, SlotRenderer } from "../types";

const BUS: SlotMountBus = SlotMountBus.getInstance();
const BUDGET_PROBE_OFFSET_MS: number = 1000;

const LIFECYCLE_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT,
  TOOLBAR_CONSTANTS.PAGE_TYPE_CHANGED_EVENT,
  TOOLBAR_CONSTANTS.PAGE_DATA_UPDATED_EVENT,
  "DOMContentLoaded"
]);

interface DocumentListenerTracker {
  added: string[];
  removed: string[];
  restore: () => void;
}

function trackDocumentLifecycleListeners(): DocumentListenerTracker {
  const added: string[] = [];
  const removed: string[] = [];
  const originalAdd: typeof document.addEventListener = document.addEventListener.bind(document);
  const originalRemove: typeof document.removeEventListener = document.removeEventListener.bind(document);

  const addSpy = vi
    .spyOn(document, "addEventListener")
    .mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void => {
      if (LIFECYCLE_EVENT_TYPES.has(type)) {
        added.push(type);
      }
      originalAdd(type, listener, options);
    }) as typeof document.addEventListener);

  const removeSpy = vi
    .spyOn(document, "removeEventListener")
    .mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void => {
      if (LIFECYCLE_EVENT_TYPES.has(type)) {
        removed.push(type);
      }
      originalRemove(type, listener, options);
    }) as typeof document.removeEventListener);

  return {
    added,
    removed,
    restore: (): void => {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  };
}

function setLocation(path: string): void {
  Object.defineProperty(window, "location", {
    value: new URL(`https://www.youtube.com${path}`),
    writable: true,
    configurable: true
  });
}

async function flushCoordination(rounds: number = 4): Promise<void> {
  for (let i: number = 0; i < rounds; i++) {
    await Promise.resolve();
    if (vi.isFakeTimers()) {
      vi.advanceTimersByTime(0);
    }
  }
}

function activeObserverCount(): number {
  return FakeMutationObserver.activeInstances.size;
}

function getActiveObserver(): FakeMutationObserver {
  const observer: FakeMutationObserver | undefined = FakeMutationObserver.activeInstances.values().next().value;
  if (!observer) {
    throw new Error("no active FakeMutationObserver to trigger");
  }
  return observer;
}

function triggerMutations(records: Array<Partial<MutationRecord>>): void {
  getActiveObserver().trigger(records);
}

function childListRecord(target: Node, added: Node[] = [], removed: Node[] = []): Partial<MutationRecord> {
  return {
    type: "childList",
    target,
    addedNodes: added as unknown as NodeList,
    removedNodes: removed as unknown as NodeList
  };
}

interface WatchFixture {
  page: HTMLElement;
  player: HTMLElement;
  rightControls: HTMLElement;
  metadata: HTMLElement;
  actionsInner: HTMLElement;
}

function createWatchFixture(): WatchFixture {
  const page: HTMLElement = document.createElement("ytd-watch-flexy");
  const player: HTMLElement = document.createElement("div");
  player.id = "movie_player";
  const rightControls: HTMLElement = document.createElement("div");
  rightControls.className = "ytp-right-controls";
  player.appendChild(rightControls);

  const metadata: HTMLElement = document.createElement("ytd-watch-metadata");
  const actionsInner: HTMLElement = document.createElement("div");
  actionsInner.id = "top-level-buttons-computed";
  metadata.appendChild(actionsInner);

  page.appendChild(player);
  page.appendChild(metadata);
  document.body.appendChild(page);
  return { page, player, rightControls, metadata, actionsInner };
}

function createShortsFixture(): { page: HTMLElement; navDown: HTMLElement } {
  const page: HTMLElement = document.createElement("ytd-shorts");
  const navDown: HTMLElement = document.createElement("div");
  navDown.id = "navigation-button-down";
  page.appendChild(navDown);
  document.body.appendChild(page);
  return { page, navDown };
}

function appendTestScope(id: string): HTMLElement {
  const scope: HTMLElement = document.createElement("div");
  scope.id = id;
  document.body.appendChild(scope);
  return scope;
}

function makePlayerSlotDefinition(overrides?: Partial<SlotDefinition>): SlotDefinition {
  return {
    slotKey: "slot:test_player",
    containerSelector: "#movie_player",
    targetSelector: ".ytp-right-controls",
    elementId: "test_player_slot",
    isApplicable: (url: URL): boolean => !url.pathname.startsWith(TOOLBAR_CONSTANTS.SHORTS_ROUTE_PREFIX),
    mount: (target: HTMLElement, element: HTMLElement): void => {
      if (!target.contains(element)) {
        target.appendChild(element);
      }
    },
    ...overrides
  };
}

function makeMetadataSlotDefinition(overrides?: Partial<SlotDefinition>): SlotDefinition {
  return {
    slotKey: "slot:test_metadata",
    containerSelector: "ytd-watch-metadata",
    targetSelector: "#top-level-buttons-computed",
    elementId: "test_metadata_slot",
    isApplicable: (url: URL): boolean => url.pathname.startsWith(TOOLBAR_CONSTANTS.WATCH_ROUTE_PREFIX),
    mount: (target: HTMLElement, element: HTMLElement): void => {
      if (!target.contains(element)) {
        target.appendChild(element);
      }
    },
    ...overrides
  };
}

function captureRenderer(
  element: HTMLElement | null,
  contexts?: SlotMountContext[]
): SlotRenderer {
  return (context: SlotMountContext): HTMLElement | null => {
    contexts?.push(context);
    return element;
  };
}

describe("SlotMountBus deep contract", (): void => {
  beforeEach((): void => {
    ReactiveDOMRegistry.getInstance();
    setLocation("/watch?v=bus_test");
    document.body.innerHTML = "";
    BUS.destroy();
  });

  afterEach((): void => {
    BUS.destroy();
  });

  it("mounts synchronously when container and target already exist with zero observer and timer", (): void => {
    vi.useFakeTimers();
    const fixture: WatchFixture = createWatchFixture();
    const element: HTMLElement = document.createElement("div");
    const contexts: SlotMountContext[] = [];

    const mounted: HTMLElement | null = BUS.mountSlot(makePlayerSlotDefinition(), captureRenderer(element, contexts));

    expect(mounted).toBe(element);
    expect(fixture.rightControls.contains(element)).toBe(true);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].container).toBe(fixture.player);
    expect(contexts[0].target).toBe(fixture.rightControls);
    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(BUS.isSlotPending("slot:test_player")).toBe(false);
    vi.useRealTimers();
  });

  it("resolves the target only inside the declared container when multiple same-name targets exist", (): void => {
    const routePage: HTMLElement = document.createElement("ytd-watch-flexy");
    const scopeA: HTMLElement = appendTestScope("scope-a");
    const scopeB: HTMLElement = appendTestScope("scope-b");
    routePage.appendChild(scopeA);
    routePage.appendChild(scopeB);
    document.body.appendChild(routePage);
    const targetA: HTMLElement = document.createElement("div");
    targetA.className = "shared-target";
    const targetB: HTMLElement = document.createElement("div");
    targetB.className = "shared-target";
    scopeA.appendChild(targetA);
    scopeB.appendChild(targetB);

    const element: HTMLElement = document.createElement("div");
    const mounted: HTMLElement | null = BUS.mountSlot(
      makePlayerSlotDefinition({
        slotKey: "slot:scoped",
        containerSelector: "#scope-a",
        targetSelector: ".shared-target",
        elementId: "scoped_slot",
        isApplicable: undefined
      }),
      captureRenderer(element)
    );

    expect(mounted).toBe(element);
    expect(scopeA.contains(element)).toBe(true);
    expect(scopeB.contains(element)).toBe(false);
    expect(scopeB.querySelector(".shared-target")).toBe(targetB);
  });

  it("hands the resolved current container to the renderer so companion nodes join the same host", (): void => {
    const retainedPage: HTMLElement = document.createElement("ytd-watch-flexy");
    retainedPage.setAttribute("hidden", "");
    const retainedPlayer: HTMLElement = document.createElement("div");
    retainedPlayer.id = "movie_player";
    const retainedControls: HTMLElement = document.createElement("div");
    retainedControls.className = "ytp-right-controls";
    retainedPlayer.appendChild(retainedControls);
    retainedPage.appendChild(retainedPlayer);
    document.body.appendChild(retainedPage);

    const fixture: WatchFixture = createWatchFixture();
    const contexts: SlotMountContext[] = [];
    const element: HTMLElement = document.createElement("div");
    const companion: HTMLElement = document.createElement("div");
    companion.id = "test_companion_panel";

    const mounted: HTMLElement | null = BUS.mountSlot(
      makePlayerSlotDefinition(),
      (context: SlotMountContext): HTMLElement => {
        contexts.push(context);
        context.container.appendChild(companion);
        return element;
      }
    );

    expect(mounted).toBe(element);
    expect(contexts[0].container).toBe(fixture.player);
    expect(contexts[0].container).not.toBe(retainedPlayer);
    expect(fixture.player.contains(companion)).toBe(true);
    expect(retainedPlayer.contains(companion)).toBe(false);
  });

  it("never mounts into hidden retained pages sharing the same selectors", (): void => {
    const retainedPage: HTMLElement = document.createElement("ytd-watch-flexy");
    retainedPage.setAttribute("hidden", "");
    const retainedControls: HTMLElement = document.createElement("div");
    retainedControls.className = "ytp-right-controls";
    retainedPage.appendChild(retainedControls);
    document.body.appendChild(retainedPage);

    const fixture: WatchFixture = createWatchFixture();
    const element: HTMLElement = document.createElement("div");

    BUS.mountSlot(makePlayerSlotDefinition(), captureRenderer(element));

    expect(fixture.rightControls.contains(element)).toBe(true);
    expect(retainedPage.contains(element)).toBe(false);
  });

  it("mounts through a scoped local observation when the target is inserted later and stops when done", async (): Promise<void> => {
    vi.useFakeTimers();
    const fixture: WatchFixture = createWatchFixture();
    fixture.rightControls.remove();
    const element: HTMLElement = document.createElement("div");

    BUS.mountSlot(makePlayerSlotDefinition(), captureRenderer(element));

    expect(BUS.isSlotPending("slot:test_player")).toBe(true);
    expect(activeObserverCount()).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets).toHaveLength(1);
    expect(observer.observedTargets[0].target).toBe(fixture.player);
    expect(observer.observedTargets[0].options).toMatchObject({ childList: true, subtree: true });

    const controls: HTMLElement = document.createElement("div");
    controls.className = "ytp-right-controls";
    fixture.player.appendChild(controls);
    triggerMutations([childListRecord(fixture.player, [controls])]);
    await flushCoordination();

    expect(controls.contains(element)).toBe(true);
    expect(BUS.isSlotPending("slot:test_player")).toBe(false);
    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("discovers a delayed container from the route root, shrinks scope and keeps the original deadline", async (): Promise<void> => {
    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);

    const elementA: HTMLElement = document.createElement("div");
    BUS.mountSlot(makePlayerSlotDefinition({ slotKey: "slot:late_a" }), captureRenderer(elementA));

    const elementB: HTMLElement = document.createElement("div");
    BUS.mountSlot(
      makePlayerSlotDefinition({ slotKey: "slot:late_b", targetSelector: ".late-controls" }),
      captureRenderer(elementB)
    );

    expect(activeObserverCount()).toBe(1);
    const observer: FakeMutationObserver = getActiveObserver();
    const observedBeforeShrink: number = observer.observedTargets.length;
    expect(observedBeforeShrink).toBe(1);
    expect(observer.observedTargets[0].target).toBe(page);

    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS - BUDGET_PROBE_OFFSET_MS);

    const player: HTMLElement = document.createElement("div");
    player.id = "movie_player";
    const controls: HTMLElement = document.createElement("div");
    controls.className = "ytp-right-controls";
    player.appendChild(controls);
    page.appendChild(player);
    triggerMutations([childListRecord(page, [player])]);
    await flushCoordination();

    expect(controls.contains(elementA)).toBe(true);
    expect(BUS.isSlotPending("slot:late_a")).toBe(false);
    expect(BUS.isSlotPending("slot:late_b")).toBe(true);

    const shrunkObserver: FakeMutationObserver = getActiveObserver();
    expect(shrunkObserver.observedTargets).toHaveLength(1);
    expect(shrunkObserver.observedTargets[0].target).toBe(player);

    vi.advanceTimersByTime(BUDGET_PROBE_OFFSET_MS);
    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(BUS.hasSlot("slot:late_b")).toBe(true);

    const lateControls: HTMLElement = document.createElement("div");
    lateControls.className = "late-controls";
    player.appendChild(lateControls);
    BUS.refreshSlot("slot:late_b");
    expect(lateControls.contains(elementB)).toBe(true);
    vi.useRealTimers();
  });

  it("observes only direct children of page-manager while the route page container is missing", async (): Promise<void> => {
    vi.useFakeTimers();
    const pageManager: HTMLElement = document.createElement("div");
    pageManager.id = TOOLBAR_CONSTANTS.PAGE_MANAGER_ID;
    document.body.appendChild(pageManager);

    const element: HTMLElement = document.createElement("div");
    BUS.mountSlot(makePlayerSlotDefinition(), captureRenderer(element));

    expect(BUS.isSlotPending("slot:test_player")).toBe(true);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets).toHaveLength(1);
    expect(observer.observedTargets[0].target).toBe(pageManager);
    expect(observer.observedTargets[0].options).toMatchObject({ childList: true, subtree: false });

    const fixture: WatchFixture = createWatchFixture();
    pageManager.appendChild(fixture.page);
    triggerMutations([childListRecord(pageManager, [fixture.page])]);
    await flushCoordination();

    expect(fixture.rightControls.contains(element)).toBe(true);
    expect(activeObserverCount()).toBe(0);
    vi.useRealTimers();
  });

  it("keeps the registration pending with zero observer and timer when no legal discovery root exists", (): void => {
    vi.useFakeTimers();
    const element: HTMLElement = document.createElement("div");

    BUS.mountSlot(makePlayerSlotDefinition(), captureRenderer(element));

    expect(BUS.isSlotPending("slot:test_player")).toBe(true);
    expect(BUS.hasSlot("slot:test_player")).toBe(true);
    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    const fixture: WatchFixture = createWatchFixture();
    document.dispatchEvent(new Event(TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT));

    expect(fixture.rightControls.contains(element)).toBe(true);
    expect(BUS.isSlotPending("slot:test_player")).toBe(false);
    vi.useRealTimers();
  });

  it("aggregates concurrent waiters onto one observer with deduplicated roots", async (): Promise<void> => {
    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);

    const playerElement: HTMLElement = document.createElement("div");
    const metadataElement: HTMLElement = document.createElement("div");
    const playerRenderer: SlotRenderer = vi.fn(captureRenderer(playerElement));
    const metadataRenderer: SlotRenderer = vi.fn(captureRenderer(metadataElement));
    BUS.mountSlot(makePlayerSlotDefinition(), playerRenderer);
    BUS.mountSlot(makeMetadataSlotDefinition(), metadataRenderer);

    expect(activeObserverCount()).toBe(1);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets).toHaveLength(1);
    expect(observer.observedTargets[0].target).toBe(page);

    const player: HTMLElement = document.createElement("div");
    player.id = "movie_player";
    const controls: HTMLElement = document.createElement("div");
    controls.className = "ytp-right-controls";
    player.appendChild(controls);
    const metadata: HTMLElement = document.createElement("ytd-watch-metadata");
    const actionsInner: HTMLElement = document.createElement("div");
    actionsInner.id = "top-level-buttons-computed";
    metadata.appendChild(actionsInner);
    page.appendChild(player);
    page.appendChild(metadata);
    triggerMutations([childListRecord(page, [player]), childListRecord(page, [metadata])]);
    await flushCoordination();

    expect(controls.contains(playerElement)).toBe(true);
    expect(actionsInner.contains(metadataElement)).toBe(true);
    expect(playerRenderer).toHaveBeenCalledTimes(1);
    expect(metadataRenderer).toHaveBeenCalledTimes(1);
    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("unmounts one waiting slot without disturbing the other", (): void => {
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);

    BUS.mountSlot(makePlayerSlotDefinition({ slotKey: "slot:keep" }), captureRenderer(null));
    BUS.mountSlot(makePlayerSlotDefinition({ slotKey: "slot:drop" }), captureRenderer(null));
    expect(activeObserverCount()).toBe(1);

    BUS.unmountSlot("slot:drop");

    expect(BUS.hasSlot("slot:drop")).toBe(false);
    expect(BUS.hasSlot("slot:keep")).toBe(true);
    expect(BUS.isSlotPending("slot:keep")).toBe(true);
    expect(activeObserverCount()).toBe(1);
  });

  it("keeps observing the detached container during the window without repositioning into a replacement host", async (): Promise<void> => {
    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    const playerA: HTMLElement = document.createElement("div");
    playerA.id = "movie_player";
    page.appendChild(playerA);
    document.body.appendChild(page);

    const element: HTMLElement = document.createElement("div");
    const renderer: SlotRenderer = vi.fn(captureRenderer(element));
    BUS.mountSlot(
      makePlayerSlotDefinition({ slotKey: "slot:replaced", targetSelector: ".late-controls" }),
      renderer
    );
    const metadataElement: HTMLElement = document.createElement("div");
    BUS.mountSlot(
      makeMetadataSlotDefinition({ slotKey: "slot:meta_wait", targetSelector: ".late-actions" }),
      captureRenderer(metadataElement)
    );

    expect(getActiveObserver().observedTargets).toHaveLength(2);

    const playerB: HTMLElement = document.createElement("div");
    playerB.id = "movie_player";
    const lateControlsB: HTMLElement = document.createElement("div");
    lateControlsB.className = "late-controls";
    playerB.appendChild(lateControlsB);
    page.removeChild(playerA);
    page.appendChild(playerB);

    triggerMutations([childListRecord(page, [playerB], [playerA])]);
    await flushCoordination();

    expect(renderer).toHaveBeenCalledTimes(0);
    expect(playerB.contains(element)).toBe(false);
    expect(BUS.isSlotPending("slot:replaced")).toBe(true);
    expect(BUS.isSlotPending("slot:meta_wait")).toBe(true);

    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS);
    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    const remounted: HTMLElement | null = BUS.refreshSlot("slot:replaced");
    expect(remounted).toBe(element);
    expect(lateControlsB.contains(element)).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("repairs a replaced host only through the next recovery event, then remounts into the new host", async (): Promise<void> => {    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    const playerA: HTMLElement = document.createElement("div");
    playerA.id = "movie_player";
    page.appendChild(playerA);
    document.body.appendChild(page);

    const element: HTMLElement = document.createElement("div");
    BUS.mountSlot(makePlayerSlotDefinition({ targetSelector: ".late-controls" }), captureRenderer(element));
    expect(BUS.isSlotPending("slot:test_player")).toBe(true);

    const playerB: HTMLElement = document.createElement("div");
    playerB.id = "movie_player";
    page.removeChild(playerA);
    page.appendChild(playerB);

    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS);
    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(BUS.isSlotPending("slot:test_player")).toBe(true);
    expect(playerA.contains(element)).toBe(false);
    expect(playerB.contains(element)).toBe(false);

    expect(BUS.refreshSlot("slot:test_player")).toBeNull();
    const controlsB: HTMLElement = document.createElement("div");
    controlsB.className = "late-controls";
    playerB.appendChild(controlsB);

    const remounted: HTMLElement | null = BUS.refreshSlot("slot:test_player");
    expect(remounted).toBe(element);
    expect(playerB.contains(element)).toBe(true);
    vi.useRealTimers();
  });

  it("reuses the mounted element across repeated refreshes without re-invoking the renderer", (): void => {
    const fixture: WatchFixture = createWatchFixture();
    const element: HTMLElement = document.createElement("div");
    const contexts: SlotMountContext[] = [];
    const renderer: SlotRenderer = vi.fn(captureRenderer(element, contexts));

    BUS.mountSlot(makePlayerSlotDefinition(), renderer);
    BUS.refreshAll();
    BUS.refreshAll();
    BUS.refreshSlot("slot:test_player");

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(contexts).toHaveLength(1);
    expect(BUS.refreshSlot("slot:test_player")).toBe(element);
    expect(fixture.rightControls.firstChild).toBe(element);
  });

  it("releases the old display and remounts it into the replacement target on refresh", (): void => {
    const fixture: WatchFixture = createWatchFixture();
    const element: HTMLElement = document.createElement("div");
    const renderer: SlotRenderer = vi.fn(captureRenderer(element));

    BUS.mountSlot(makePlayerSlotDefinition(), renderer);
    expect(fixture.rightControls.contains(element)).toBe(true);

    const replacementControls: HTMLElement = document.createElement("div");
    replacementControls.className = "ytp-right-controls";
    fixture.rightControls.remove();
    fixture.player.appendChild(replacementControls);
    expect(element.isConnected).toBe(false);

    const remounted: HTMLElement | null = BUS.refreshSlot("slot:test_player");

    expect(remounted).toBe(element);
    expect(replacementControls.contains(element)).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it("remounts with a fresh element when the host target changes", (): void => {
    const fixture: WatchFixture = createWatchFixture();
    const firstElement: HTMLElement = document.createElement("div");
    const contexts: SlotMountContext[] = [];
    let nextElement: HTMLElement = firstElement;
    const renderer: SlotRenderer = vi.fn((context: SlotMountContext): HTMLElement => {
      contexts.push(context);
      return nextElement;
    });

    BUS.mountSlot(makePlayerSlotDefinition(), renderer);
    expect(fixture.rightControls.contains(firstElement)).toBe(true);

    const secondElement: HTMLElement = document.createElement("div");
    nextElement = secondElement;
    const replacementControls: HTMLElement = document.createElement("div");
    replacementControls.className = "ytp-right-controls";
    fixture.rightControls.remove();
    fixture.player.appendChild(replacementControls);

    BUS.refreshSlot("slot:test_player");

    expect(renderer).toHaveBeenCalledTimes(2);
    expect(contexts[1].target).toBe(replacementControls);
    expect(replacementControls.contains(secondElement)).toBe(true);
    expect(replacementControls.contains(firstElement)).toBe(false);
  });

  it("mounts as a sibling after the shorts navigation button and keeps identity on refresh", (): void => {
    setLocation("/shorts/abc");
    const { navDown } = createShortsFixture();
    const element: HTMLElement = document.createElement("div");
    element.id = "test_shorts_slot";
    const renderer: SlotRenderer = vi.fn(captureRenderer(element));

    BUS.mountSlot(
      makePlayerSlotDefinition({
        slotKey: "slot:test_shorts",
        containerSelector: "ytd-shorts",
        targetSelector: "#navigation-button-down",
        elementId: "test_shorts_slot",
        isApplicable: (url: URL): boolean => url.pathname.startsWith(TOOLBAR_CONSTANTS.SHORTS_ROUTE_PREFIX),
        mount: (target: HTMLElement, mounted: HTMLElement): void => {
          if (!target.parentElement?.contains(mounted)) {
            target.after(mounted);
          }
        }
      }),
      renderer
    );

    const shortsSlot: HTMLElement | null = document.getElementById("test_shorts_slot");
    expect(shortsSlot).toBe(element);
    expect(element.previousElementSibling).toBe(navDown);

    BUS.refreshAll();
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(document.getElementById("test_shorts_slot")).toBe(element);
  });

  it("retries the same renderer through external mutations after an initial null render", async (): Promise<void> => {
    const fixture: WatchFixture = createWatchFixture();
    const element: HTMLElement = document.createElement("div");
    let renderIndex: number = 0;
    const renderer: SlotRenderer = vi.fn((_context: SlotMountContext): HTMLElement | null => {
      renderIndex++;
      return renderIndex === 1 ? null : element;
    });

    expect(BUS.mountSlot(makePlayerSlotDefinition(), renderer)).toBeNull();
    expect(BUS.isSlotPending("slot:test_player")).toBe(true);
    expect(activeObserverCount()).toBe(1);

    const unrelated: HTMLElement = document.createElement("div");
    fixture.player.appendChild(unrelated);
    triggerMutations([childListRecord(fixture.player, [unrelated])]);
    await flushCoordination();

    expect(renderer).toHaveBeenCalledTimes(2);
    expect(fixture.rightControls.contains(element)).toBe(true);
    expect(BUS.isSlotPending("slot:test_player")).toBe(false);
    expect(activeObserverCount()).toBe(0);
  });

  it("discards a queued mount when the URL changes before the microtask runs and stays inactive after navigation", async (): Promise<void> => {
    vi.useFakeTimers();
    setLocation("/shorts/abc");
    const page: HTMLElement = document.createElement("ytd-shorts");
    document.body.appendChild(page);

    const element: HTMLElement = document.createElement("div");
    element.id = "test_shorts_slot";
    const renderer: SlotRenderer = vi.fn(captureRenderer(element));

    BUS.mountSlot(
      makePlayerSlotDefinition({
        slotKey: "slot:test_shorts",
        containerSelector: "ytd-shorts",
        targetSelector: "#navigation-button-down",
        elementId: "test_shorts_slot",
        isApplicable: (url: URL): boolean => url.pathname.startsWith(TOOLBAR_CONSTANTS.SHORTS_ROUTE_PREFIX)
      }),
      renderer
    );
    expect(BUS.isSlotPending("slot:test_shorts")).toBe(true);

    const navDown: HTMLElement = document.createElement("div");
    navDown.id = "navigation-button-down";
    page.appendChild(navDown);
    triggerMutations([childListRecord(page, [navDown])]);

    setLocation("/watch?v=changed");
    await flushCoordination();

    expect(element.isConnected).toBe(false);
    expect(BUS.isSlotPending("slot:test_shorts")).toBe(false);
    expect(BUS.hasSlot("slot:test_shorts")).toBe(true);

    document.dispatchEvent(new Event(TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT));

    expect(document.getElementById("test_shorts_slot")).toBeNull();
    expect(BUS.isSlotPending("slot:test_shorts")).toBe(false);
    vi.useRealTimers();
  });

  it("preserves the mounted element across same-layout navigation between watch pages", (): void => {
    const fixture: WatchFixture = createWatchFixture();
    const element: HTMLElement = document.createElement("div");
    element.id = "test_player_slot";
    const renderer: SlotRenderer = vi.fn(captureRenderer(element));

    BUS.mountSlot(makePlayerSlotDefinition(), renderer);
    expect(fixture.rightControls.contains(element)).toBe(true);

    setLocation("/watch?v=another_video");
    document.dispatchEvent(new Event(TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT));

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(document.getElementById("test_player_slot")).toBe(element);
    expect(fixture.rightControls.contains(element)).toBe(true);
  });

  it("does not extend the running observation deadline on repeated same-URL navigation events", (): void => {
    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);
    BUS.mountSlot(makePlayerSlotDefinition({ targetSelector: ".late-controls" }), captureRenderer(null));

    expect(vi.getTimerCount()).toBe(1);
    document.dispatchEvent(new Event(TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT));
    document.dispatchEvent(new Event(TOOLBAR_CONSTANTS.PAGE_TYPE_CHANGED_EVENT));
    document.dispatchEvent(new Event(TOOLBAR_CONSTANTS.PAGE_DATA_UPDATED_EVENT));

    expect(vi.getTimerCount()).toBe(1);
    expect(activeObserverCount()).toBe(1);

    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(activeObserverCount()).toBe(0);
    expect(BUS.isSlotPending("slot:test_player")).toBe(true);
    vi.useRealTimers();
  });

  it("stops the window on budget exhaustion while keeping the registration pending", (): void => {
    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);
    const element: HTMLElement = document.createElement("div");

    BUS.mountSlot(makePlayerSlotDefinition({ targetSelector: ".late-controls" }), captureRenderer(element));
    expect(activeObserverCount()).toBe(1);

    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS);

    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(BUS.hasSlot("slot:test_player")).toBe(true);
    expect(BUS.isSlotPending("slot:test_player")).toBe(true);

    const player: HTMLElement = document.createElement("div");
    player.id = "movie_player";
    page.appendChild(player);
    const lateControls: HTMLElement = document.createElement("div");
    lateControls.className = "late-controls";
    player.appendChild(lateControls);
    const recovered: HTMLElement | null = BUS.refreshSlot("slot:test_player");
    expect(recovered).toBe(element);
    expect(BUS.isSlotPending("slot:test_player")).toBe(false);
    vi.useRealTimers();
  });

  it("clears the deadline on destroy and keeps a fresh window valid afterwards", (): void => {
    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);
    BUS.mountSlot(makePlayerSlotDefinition({ targetSelector: ".late-controls" }), captureRenderer(null));

    BUS.destroy();
    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS * 2);

    expect(BUS.hasSlot("slot:test_player")).toBe(false);
    expect(activeObserverCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    const element: HTMLElement = document.createElement("div");
    BUS.mountSlot(makePlayerSlotDefinition({ targetSelector: ".late-controls" }), captureRenderer(element));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(0);
    expect(BUS.hasSlot("slot:test_player")).toBe(true);
    vi.useRealTimers();
  });

  it("does not create a self-sustaining microtask chain when one mount writes DOM and another renderer returns null", async (): Promise<void> => {
    const fixture: WatchFixture = createWatchFixture();
    const elementA: HTMLElement = document.createElement("div");
    const rendererA: SlotRenderer = vi.fn(captureRenderer(elementA));
    const rendererB: SlotRenderer = vi.fn(captureRenderer(null));

    BUS.mountSlot(makePlayerSlotDefinition({ slotKey: "slot:writer" }), rendererA);
    BUS.mountSlot(makePlayerSlotDefinition({ slotKey: "slot:nullish" }), rendererB);

    await flushCoordination();
    await flushCoordination();
    await flushCoordination();

    expect(rendererA).toHaveBeenCalledTimes(1);
    expect(rendererB).toHaveBeenCalledTimes(1);
    expect(fixture.rightControls.contains(elementA)).toBe(true);
    expect(BUS.isSlotPending("slot:nullish")).toBe(true);
  });

  it("coordinates ancestor-rooted and descendant-rooted slots exactly once from one mutation hitting both roots", async (): Promise<void> => {
    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    const player: HTMLElement = document.createElement("div");
    player.id = "movie_player";
    page.appendChild(player);
    document.body.appendChild(page);

    const elementA: HTMLElement = document.createElement("div");
    const rendererA: SlotRenderer = vi.fn(captureRenderer(elementA));
    BUS.mountSlot(
      makePlayerSlotDefinition({ slotKey: "slot:on_container", targetSelector: ".late-controls" }),
      rendererA
    );
    const elementB: HTMLElement = document.createElement("div");
    const rendererB: SlotRenderer = vi.fn(captureRenderer(elementB));
    BUS.mountSlot(makeMetadataSlotDefinition({ slotKey: "slot:on_page" }), rendererB);

    expect(rendererA).toHaveBeenCalledTimes(0);
    expect(rendererB).toHaveBeenCalledTimes(0);
    expect(activeObserverCount()).toBe(1);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets).toHaveLength(2);

    const actionsInner: HTMLElement = document.createElement("div");
    actionsInner.id = "top-level-buttons-computed";
    const metadata: HTMLElement = document.createElement("ytd-watch-metadata");
    metadata.appendChild(actionsInner);
    player.appendChild(metadata);

    triggerMutations([childListRecord(player, [metadata])]);
    await flushCoordination();

    expect(actionsInner.contains(elementB)).toBe(true);
    expect(BUS.isSlotPending("slot:on_page")).toBe(false);
    expect(BUS.isSlotPending("slot:on_container")).toBe(true);
    expect(rendererB).toHaveBeenCalledTimes(1);
    expect(rendererA).toHaveBeenCalledTimes(0);

    const lateControls: HTMLElement = document.createElement("div");
    lateControls.className = "late-controls";
    player.appendChild(lateControls);

    triggerMutations([childListRecord(player, [lateControls])]);
    await flushCoordination();

    expect(lateControls.contains(elementA)).toBe(true);
    expect(BUS.isSlotPending("slot:on_container")).toBe(false);
    expect(rendererA).toHaveBeenCalledTimes(1);
    expect(rendererB).toHaveBeenCalledTimes(1);
    expect(activeObserverCount()).toBe(0);
    vi.useRealTimers();
  });

  it("invalidates the current commit when the renderer re-enters with a replacement registration", (): void => {
    const fixture: WatchFixture = createWatchFixture();
    const staleElement: HTMLElement = document.createElement("div");
    const freshElement: HTMLElement = document.createElement("div");

    const replacementRenderer: SlotRenderer = vi.fn(captureRenderer(freshElement));
    const renderer: SlotRenderer = vi.fn((_context: SlotMountContext): HTMLElement => {
      BUS.mountSlot(makePlayerSlotDefinition(), replacementRenderer);
      return staleElement;
    });

    const mounted: HTMLElement | null = BUS.mountSlot(makePlayerSlotDefinition(), renderer);

    expect(mounted).toBe(freshElement);
    expect(fixture.rightControls.contains(freshElement)).toBe(true);
    expect(fixture.rightControls.contains(staleElement)).toBe(false);
    expect(staleElement.isConnected).toBe(false);
    expect(BUS.hasSlot("slot:test_player")).toBe(true);
  });

  it("does not mount when the renderer unregisters its own key mid-coordination", (): void => {
    const fixture: WatchFixture = createWatchFixture();
    const element: HTMLElement = document.createElement("div");
    const renderer: SlotRenderer = vi.fn((_context: SlotMountContext): HTMLElement => {
      BUS.unmountSlot("slot:test_player");
      return element;
    });

    const mounted: HTMLElement | null = BUS.mountSlot(makePlayerSlotDefinition(), renderer);

    expect(mounted).toBeNull();
    expect(BUS.hasSlot("slot:test_player")).toBe(false);
    expect(fixture.rightControls.contains(element)).toBe(false);
  });

  it("revokes a failed initial registration, rethrows and allows a later clean registration", (): void => {
    const fixture: WatchFixture = createWatchFixture();
    const failure = new Error("renderer exploded");
    const failingRenderer: SlotRenderer = vi.fn((): HTMLElement | null => {
      throw failure;
    });

    expect(() => BUS.mountSlot(makePlayerSlotDefinition(), failingRenderer)).toThrow(failure);
    expect(BUS.hasSlot("slot:test_player")).toBe(false);
    expect(document.getElementById("test_player_slot")).toBeNull();
    expect(activeObserverCount()).toBe(0);

    const element: HTMLElement = document.createElement("div");
    const mounted: HTMLElement | null = BUS.mountSlot(makePlayerSlotDefinition(), captureRenderer(element));
    expect(mounted).toBe(element);
    expect(fixture.rightControls.contains(element)).toBe(true);
  });

  it("isolates a throwing delayed coordination and pauses only that slot inside the window", async (): Promise<void> => {
    vi.useFakeTimers();
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);

    const failure = new Error("delayed renderer exploded");
    const failingRenderer: SlotRenderer = vi.fn((): HTMLElement | null => {
      throw failure;
    });
    const healthyElement: HTMLElement = document.createElement("div");
    const healthyRenderer: SlotRenderer = vi.fn(captureRenderer(healthyElement));

    BUS.mountSlot(makePlayerSlotDefinition({ slotKey: "slot:broken" }), failingRenderer);
    BUS.mountSlot(makePlayerSlotDefinition({ slotKey: "slot:healthy" }), healthyRenderer);

    const player: HTMLElement = document.createElement("div");
    player.id = "movie_player";
    const controls: HTMLElement = document.createElement("div");
    controls.className = "ytp-right-controls";
    player.appendChild(controls);
    page.appendChild(player);
    triggerMutations([childListRecord(page, [player])]);
    await flushCoordination();

    expect(controls.contains(healthyElement)).toBe(true);
    expect(BUS.hasSlot("slot:broken")).toBe(true);
    expect(BUS.isSlotPending("slot:broken")).toBe(true);
    expect(failingRenderer).toHaveBeenCalledTimes(1);

    expect(BUS.refreshSlot("slot:broken")).toBeNull();
    expect(failingRenderer).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("continues removing bus-owned display nodes when the unmount callback throws", (): void => {
    const fixture: WatchFixture = createWatchFixture();
    const element: HTMLElement = document.createElement("div");
    const throwingUnmount = (): void => {
      throw new Error("unmount exploded");
    };

    BUS.mountSlot(makePlayerSlotDefinition({ slotKey: "slot:throwing", unmount: throwingUnmount }), captureRenderer(element));
    expect(fixture.rightControls.contains(element)).toBe(true);

    expect(() => BUS.unmountSlot("slot:throwing")).not.toThrow();
    expect(element.isConnected).toBe(false);
    expect(BUS.hasSlot("slot:throwing")).toBe(false);
  });

  it("releases document lifecycle listeners after the last registration is revoked", (): void => {
    const tracker: DocumentListenerTracker = trackDocumentLifecycleListeners();
    try {
      createWatchFixture();
      const element: HTMLElement = document.createElement("div");

      BUS.mountSlot(makePlayerSlotDefinition(), captureRenderer(element));
      expect(tracker.added).toEqual([
        TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT,
        TOOLBAR_CONSTANTS.PAGE_TYPE_CHANGED_EVENT,
        TOOLBAR_CONSTANTS.PAGE_DATA_UPDATED_EVENT
      ]);

      BUS.unmountSlot("slot:test_player");
      expect(tracker.removed).toEqual([
        TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT,
        TOOLBAR_CONSTANTS.PAGE_TYPE_CHANGED_EVENT,
        TOOLBAR_CONSTANTS.PAGE_DATA_UPDATED_EVENT
      ]);
      expect(activeObserverCount()).toBe(0);
    } finally {
      tracker.restore();
    }
  });

  it("binds lifecycle events idempotently on an empty bus without observer or timer, and unbinds on destroy", (): void => {
    vi.useFakeTimers();
    const tracker: DocumentListenerTracker = trackDocumentLifecycleListeners();
    try {
      BUS.bindNavigation();
      BUS.bindNavigation();

      expect(tracker.added).toHaveLength(3);
      expect(activeObserverCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);

      BUS.destroy();
      expect(tracker.removed).toHaveLength(3);
      expect(activeObserverCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      tracker.restore();
      vi.useRealTimers();
    }
  });

  it("installs the DOMContentLoaded listener only while the document is loading and releases it deterministically", (): void => {
    const readyStateSpy = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const tracker: DocumentListenerTracker = trackDocumentLifecycleListeners();
    try {
      BUS.bindNavigation();
      expect(tracker.added).toEqual([
        TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT,
        TOOLBAR_CONSTANTS.PAGE_TYPE_CHANGED_EVENT,
        TOOLBAR_CONSTANTS.PAGE_DATA_UPDATED_EVENT,
        "DOMContentLoaded"
      ]);

      BUS.destroy();
      expect(tracker.removed).toContain("DOMContentLoaded");

      BUS.bindNavigation();
      document.dispatchEvent(new Event("DOMContentLoaded"));
      BUS.destroy();
      expect(
        tracker.removed.filter((type: string): boolean => type === "DOMContentLoaded")
      ).toHaveLength(1);
      expect(activeObserverCount()).toBe(0);
    } finally {
      tracker.restore();
      readyStateSpy.mockRestore();
    }
  });

  it("neutralizes queued work and late events when destroyed mid-flight", async (): Promise<void> => {
    const tracker: DocumentListenerTracker = trackDocumentLifecycleListeners();
    try {
      const page: HTMLElement = document.createElement("ytd-watch-flexy");
      document.body.appendChild(page);
      const renderer: SlotRenderer = vi.fn(captureRenderer(null));
      BUS.mountSlot(makePlayerSlotDefinition({ targetSelector: ".late-controls" }), renderer);
      expect(activeObserverCount()).toBe(1);

      triggerMutations([childListRecord(page)]);
      BUS.destroy();
      await flushCoordination();

      expect(BUS.hasSlot("slot:test_player")).toBe(false);
      expect(document.getElementById("test_player_slot")).toBeNull();
      expect(activeObserverCount()).toBe(0);
      expect(tracker.removed).toEqual([
        TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT,
        TOOLBAR_CONSTANTS.PAGE_TYPE_CHANGED_EVENT,
        TOOLBAR_CONSTANTS.PAGE_DATA_UPDATED_EVENT
      ]);

      page.remove();
      createWatchFixture();
      const revivedElement: HTMLElement = document.createElement("div");
      const revived: HTMLElement | null = BUS.mountSlot(makePlayerSlotDefinition(), captureRenderer(revivedElement));
      expect(revived).toBe(revivedElement);
    } finally {
      tracker.restore();
    }
  });
});
