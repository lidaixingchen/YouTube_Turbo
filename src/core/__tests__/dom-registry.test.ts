import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReactiveDOMRegistry } from "../dom-registry";
import { HIDDEN_ATTRIBUTE, PAGE_MANAGER_ID } from "../constants";
import { FakeMutationObserver } from "../../test/fake-observers";

function setLocation(path: string): void {
  Object.defineProperty(window, "location", {
    value: new URL(`https://www.youtube.com${path}`),
    writable: true,
    configurable: true
  });
}

async function flushMicrotasks(rounds: number = 3): Promise<void> {
  for (let i: number = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

function getActiveObserver(): FakeMutationObserver {
  const observer: FakeMutationObserver | undefined = FakeMutationObserver.activeInstances.values().next().value;
  if (!observer) {
    throw new Error("no active FakeMutationObserver to trigger");
  }
  return observer;
}

function childListRecord(target: Node, added: Node[] = [], removed: Node[] = []): Partial<MutationRecord> {
  return {
    type: "childList",
    target,
    addedNodes: added as unknown as NodeList,
    removedNodes: removed as unknown as NodeList
  };
}

describe("ReactiveDOMRegistry scoped player query", (): void => {
  const createWatchPage = (hidden: boolean): { page: HTMLElement; player: HTMLElement } => {
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    if (hidden) {
      page.setAttribute("hidden", "");
    }
    const player: HTMLElement = document.createElement("div");
    player.id = "movie_player";
    player.className = "html5-video-player";
    page.appendChild(player);
    document.body.appendChild(page);
    return { page, player };
  };

  beforeEach((): void => {
    document.body.innerHTML = "";
  });

  afterEach((): void => {
    document.body.innerHTML = "";
  });

  it("should return the player located inside the given scope", (): void => {
    const { page, player } = createWatchPage(false);
    const resolved: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer(page);
    expect(resolved).toBe(player);
  });

  it("should return the scope itself when it matches the player container", (): void => {
    const outer: HTMLElement = document.createElement("div");
    const player: HTMLElement = document.createElement("div");
    player.id = "movie_player";
    outer.appendChild(player);
    document.body.appendChild(outer);

    const resolved: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer(player);
    expect(resolved).toBe(player);
  });

  it("should return null instead of falling back to players outside the scope", (): void => {
    const retained = createWatchPage(true);
    const current = createWatchPage(false);

    const resolved: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer(current.page);
    expect(resolved).toBe(current.player);
    expect(resolved).not.toBe(retained.player);

    const fromRetainedScope: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer(retained.page);
    expect(fromRetainedScope).toBe(retained.player);

    const emptyScope: HTMLElement = document.createElement("div");
    document.body.appendChild(emptyScope);
    expect(ReactiveDOMRegistry.getInstance().getPlayerContainer(emptyScope)).toBeNull();
  });

  it("should not let scoped query results overwrite the unscoped cache", (): void => {
    const first = createWatchPage(false);
    const second = createWatchPage(false);

    const unscoped: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer();
    expect(unscoped).toBe(first.player);

    const scoped: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer(second.page);
    expect(scoped).toBe(second.player);

    const cached: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer();
    expect(cached).toBe(first.player);

    first.page.remove();
    second.page.remove();
  });

  it("should keep the parameterless cache fast path behavior", (): void => {
    const { page, player } = createWatchPage(false);

    const first: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer();
    expect(first).toBe(player);

    page.removeChild(player);
    expect(ReactiveDOMRegistry.getInstance().getPlayerContainer()).toBeNull();

    page.appendChild(player);
    expect(ReactiveDOMRegistry.getInstance().getPlayerContainer()).toBe(player);
  });
});

describe("ReactiveDOMRegistry waitForVideoElement bounded discovery", (): void => {
  beforeEach((): void => {
    vi.useFakeTimers();
    setLocation("/watch?v=wait");
    document.body.innerHTML = "";
    ReactiveDOMRegistry.getInstance().invalidateCache();
  });

  afterEach((): void => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    ReactiveDOMRegistry.getInstance().invalidateCache();
  });

  it("observes the route page root and resolves through a scoped priority hit that writes the cache", async (): Promise<void> => {
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    const player: HTMLElement = document.createElement("div");
    player.id = "movie_player";
    page.appendChild(player);
    document.body.appendChild(page);

    const pending: Promise<HTMLVideoElement | null> = ReactiveDOMRegistry.getInstance().waitForVideoElement(5000);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets).toHaveLength(1);
    expect(observer.observedTargets[0].target).toBe(page);
    expect(observer.observedTargets[0].options).toEqual({ childList: true, subtree: true });

    const video: HTMLVideoElement = document.createElement("video");
    player.appendChild(video);
    observer.trigger([childListRecord(player, [video])]);

    await expect(pending).resolves.toBe(video);
    expect(ReactiveDOMRegistry.getInstance().getVideoElement()).toBe(video);
    expect(FakeMutationObserver.activeInstances.size).toBe(0);
  });

  it("prefers the active reel video over a document-order-earlier inactive reel inside the scope", async (): Promise<void> => {
    setLocation("/shorts/xyz");
    const shorts: HTMLElement = document.createElement("ytd-shorts");
    document.body.appendChild(shorts);

    const pending: Promise<HTMLVideoElement | null> = ReactiveDOMRegistry.getInstance().waitForVideoElement(5000);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets[0].target).toBe(shorts);

    const inactiveReel: HTMLElement = document.createElement("ytd-reel-video-renderer");
    const inactiveVideo: HTMLVideoElement = document.createElement("video");
    inactiveReel.appendChild(inactiveVideo);
    shorts.appendChild(inactiveReel);

    const activeReel: HTMLElement = document.createElement("ytd-reel-video-renderer");
    activeReel.setAttribute("is-active", "");
    const activeVideo: HTMLVideoElement = document.createElement("video");
    activeReel.appendChild(activeVideo);
    shorts.appendChild(activeReel);

    observer.trigger([childListRecord(shorts, [inactiveReel, activeReel])]);

    await expect(pending).resolves.toBe(activeVideo);
  });

  it("picks the non-hidden page container as the discovery root when a retained page coexists", async (): Promise<void> => {
    const retained: HTMLElement = document.createElement("ytd-watch-flexy");
    retained.setAttribute("hidden", "");
    document.body.appendChild(retained);
    const current: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(current);

    const pending: Promise<HTMLVideoElement | null> = ReactiveDOMRegistry.getInstance().waitForVideoElement(5000);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets).toHaveLength(1);
    expect(observer.observedTargets[0].target).toBe(current);

    const video: HTMLVideoElement = document.createElement("video");
    current.appendChild(video);
    observer.trigger([childListRecord(current, [video])]);
    await expect(pending).resolves.toBe(video);
  });

  it("discovers the page container from page-manager via the hidden attribute wakeup and shrinks the root", async (): Promise<void> => {
    const pageManager: HTMLElement = document.createElement("div");
    pageManager.id = PAGE_MANAGER_ID;
    document.body.appendChild(pageManager);
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    page.setAttribute("hidden", "");
    pageManager.appendChild(page);

    const pending: Promise<HTMLVideoElement | null> = ReactiveDOMRegistry.getInstance().waitForVideoElement(5000);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets).toHaveLength(1);
    expect(observer.observedTargets[0].target).toBe(pageManager);
    expect(observer.observedTargets[0].options).toEqual({
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: [HIDDEN_ATTRIBUTE]
    });
    expect(vi.getTimerCount()).toBe(1);

    page.removeAttribute("hidden");
    observer.trigger([{ type: "attributes", target: page, attributeName: HIDDEN_ATTRIBUTE }]);

    const shrunk: FakeMutationObserver = getActiveObserver();
    expect(shrunk).toBe(observer);
    expect(shrunk.observedTargets).toHaveLength(1);
    expect(shrunk.observedTargets[0].target).toBe(page);
    expect(shrunk.observedTargets[0].options).toEqual({ childList: true, subtree: true });
    expect(vi.getTimerCount()).toBe(1);

    const video: HTMLVideoElement = document.createElement("video");
    page.appendChild(video);
    shrunk.trigger([childListRecord(page, [video])]);

    await expect(pending).resolves.toBe(video);
    expect(vi.getTimerCount()).toBe(0);
    expect(FakeMutationObserver.activeInstances.size).toBe(0);
  });

  it("does not observe when no legal discovery root exists and converges to getVideoElement on timeout", async (): Promise<void> => {
    setLocation("/");

    const pageManager: HTMLElement = document.createElement("div");
    pageManager.id = PAGE_MANAGER_ID;
    document.body.appendChild(pageManager);

    const pending: Promise<HTMLVideoElement | null> = ReactiveDOMRegistry.getInstance().waitForVideoElement(2000);

    expect(FakeMutationObserver.allInstances.length).toBe(0);
    expect(vi.getTimerCount()).toBe(1);

    const stray: HTMLVideoElement = document.createElement("video");
    document.body.appendChild(stray);

    vi.advanceTimersByTime(1999);
    await flushMicrotasks();
    let probe: boolean = false;
    pending.then((): void => {
      probe = true;
    });
    await flushMicrotasks();
    expect(probe).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(pending).resolves.toBe(stray);
    expect(vi.getTimerCount()).toBe(0);
  });
});
