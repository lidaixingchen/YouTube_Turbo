import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ReactiveDOMRegistry } from "../dom-registry";
import {
  HIDDEN_ATTRIBUTE,
  MINIPLAYER_HOST_SELECTOR,
  PAGE_MANAGER_ID,
  SHORTS_ACTIVE_REEL_ATTRIBUTE,
  SHORTS_ACTIVE_REEL_SELECTOR,
  SHORTS_PAGE_CONTAINER_SELECTOR,
  WATCH_PAGE_CONTAINER_SELECTOR
} from "../constants";
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

function attributeRecord(target: Node, attributeName: string): Partial<MutationRecord> {
  return {
    type: "attributes",
    target,
    attributeName
  };
}

interface MediaFixture {
  readonly root: HTMLElement;
  readonly player: HTMLElement;
  readonly video: HTMLVideoElement;
  readonly title: HTMLElement;
}

function createWatchMediaFixture(hidden: boolean, titleText: string): MediaFixture {
  const root: HTMLElement = document.createElement(WATCH_PAGE_CONTAINER_SELECTOR);
  if (hidden) {
    root.setAttribute(HIDDEN_ATTRIBUTE, "");
  }
  const player: HTMLElement = document.createElement("div");
  player.id = "movie_player";
  const video: HTMLVideoElement = document.createElement("video");
  player.appendChild(video);
  const title: HTMLElement = document.createElement("h1");
  title.className = "ytd-watch-metadata";
  title.textContent = titleText;
  root.append(player, title);
  document.body.appendChild(root);
  return { root, player, video, title };
}

function createShortsMediaFixture(hidden: boolean, titleText: string): MediaFixture {
  const root: HTMLElement = document.createElement(SHORTS_PAGE_CONTAINER_SELECTOR);
  if (hidden) {
    root.setAttribute(HIDDEN_ATTRIBUTE, "");
  }
  const inactiveReel: HTMLElement = document.createElement("ytd-reel-video-renderer");
  const inactivePlayer: HTMLElement = document.createElement("div");
  inactivePlayer.id = "movie_player";
  inactivePlayer.appendChild(document.createElement("video"));
  const inactiveTitle: HTMLElement = document.createElement("h1");
  inactiveTitle.className = "watch-title-container";
  inactiveTitle.textContent = "inactive reel title";
  inactiveReel.append(inactivePlayer, inactiveTitle);
  root.appendChild(inactiveReel);

  const activeReel: HTMLElement = document.createElement("ytd-reel-video-renderer");
  activeReel.setAttribute(SHORTS_ACTIVE_REEL_ATTRIBUTE, "");
  const player: HTMLElement = document.createElement("div");
  player.id = "movie_player";
  const video: HTMLVideoElement = document.createElement("video");
  player.appendChild(video);
  activeReel.appendChild(player);

  const title: HTMLElement = document.createElement("h1");
  title.className = "watch-title-container";
  title.textContent = titleText;
  activeReel.appendChild(title);
  root.appendChild(activeReel);
  document.body.appendChild(root);
  return { root, player, video, title };
}

function createMiniplayerMediaFixture(hidden: boolean, titleText: string): MediaFixture {
  const root: HTMLElement = document.createElement(MINIPLAYER_HOST_SELECTOR);
  if (hidden) {
    root.setAttribute(HIDDEN_ATTRIBUTE, "");
  }
  const player: HTMLElement = document.createElement("div");
  player.id = "movie_player";
  const video: HTMLVideoElement = document.createElement("video");
  player.appendChild(video);
  const title: HTMLElement = document.createElement("h1");
  title.className = "watch-title-container";
  title.textContent = titleText;
  root.append(player, title);
  document.body.appendChild(root);
  return { root, player, video, title };
}

describe("ReactiveDOMRegistry current media scope", (): void => {
  const registry: ReactiveDOMRegistry = ReactiveDOMRegistry.getInstance();

  beforeEach((): void => {
    setLocation("/watch?v=current");
    document.body.innerHTML = "";
    registry.invalidateCache();
  });

  afterEach((): void => {
    document.body.innerHTML = "";
    registry.invalidateCache();
  });

  it("resolves video, player and title from the visible watch root after a hidden retained root", (): void => {
    const retained: MediaFixture = createWatchMediaFixture(true, "retained title");
    const current: MediaFixture = createWatchMediaFixture(false, "current title");

    expect(registry.getVideoElement()).toBe(current.video);
    expect(registry.getPlayerContainer()).toBe(current.player);
    expect(registry.getVideoTitleElement()).toBe(current.title);
    expect(registry.getVideoElement()).not.toBe(retained.video);
    expect(registry.getPlayerContainer()).not.toBe(retained.player);
    expect(registry.getVideoTitleElement()).not.toBe(retained.title);
  });

  it("does not reuse connected cached nodes after the route changes", (): void => {
    const retained: MediaFixture = createWatchMediaFixture(false, "retained title");
    expect(registry.getVideoElement()).toBe(retained.video);
    expect(registry.getPlayerContainer()).toBe(retained.player);
    expect(registry.getVideoTitleElement()).toBe(retained.title);

    setLocation("/watch?v=current");
    retained.root.setAttribute(HIDDEN_ATTRIBUTE, "");
    const current: MediaFixture = createWatchMediaFixture(false, "current title");
    document.dispatchEvent(new Event("yt-navigate-finish"));

    expect(retained.video.isConnected).toBe(true);
    expect(registry.getVideoElement()).toBe(current.video);
    expect(registry.getPlayerContainer()).toBe(current.player);
    expect(registry.getVideoTitleElement()).toBe(current.title);
  });

  it("does not reuse connected media nodes after they leave their owning page root", (): void => {
    const current: MediaFixture = createWatchMediaFixture(false, "current title");
    expect(registry.getVideoElement()).toBe(current.video);
    expect(registry.getPlayerContainer()).toBe(current.player);
    expect(registry.getVideoTitleElement()).toBe(current.title);

    const otherContainer: HTMLElement = document.createElement("div");
    document.body.appendChild(otherContainer);
    otherContainer.append(current.player, current.title);

    expect(current.video.isConnected).toBe(true);
    expect(current.player.isConnected).toBe(true);
    expect(current.title.isConnected).toBe(true);
    expect(registry.getVideoElement()).toBeNull();
    expect(registry.getPlayerContainer()).toBeNull();
    expect(registry.getVideoTitleElement()).toBeNull();
  });

  it("keeps the Shorts active-reel selection within its route root", (): void => {
    setLocation("/shorts/current");
    const retained: MediaFixture = createShortsMediaFixture(true, "retained title");
    const current: MediaFixture = createShortsMediaFixture(false, "current title");

    expect(registry.getVideoElement()).toBe(current.video);
    expect(registry.getPlayerContainer()).toBe(current.player);
    expect(registry.getVideoTitleElement()).toBe(current.title);
    expect(registry.getVideoElement()).not.toBe(retained.video);
    expect(registry.getPlayerContainer()).not.toBe(retained.player);
    expect(registry.getVideoTitleElement()).not.toBe(retained.title);
  });

  it("refreshes cached media when the active reel changes without a URL change", (): void => {
    setLocation("/shorts/current");
    const current: MediaFixture = createShortsMediaFixture(false, "active title");
    const reels: NodeListOf<HTMLElement> = current.root.querySelectorAll<HTMLElement>("ytd-reel-video-renderer");
    const inactiveReel: HTMLElement | null = reels.item(0);
    const activeReel: HTMLElement | null = current.root.querySelector<HTMLElement>(SHORTS_ACTIVE_REEL_SELECTOR);
    if (!inactiveReel || !activeReel) {
      throw new Error("Shorts fixture reels were not created");
    }
    const inactiveVideo: HTMLVideoElement | null = inactiveReel.querySelector<HTMLVideoElement>("video");
    const inactivePlayer: HTMLElement | null = inactiveReel.querySelector<HTMLElement>("#movie_player");
    const inactiveTitle: HTMLElement | null = inactiveReel.querySelector<HTMLElement>("h1");
    if (!inactiveVideo || !inactivePlayer || !inactiveTitle) {
      throw new Error("Inactive Shorts fixture media was not created");
    }

    const originalHref: string = window.location.href;
    expect(registry.getVideoElement()).toBe(current.video);
    expect(registry.getPlayerContainer()).toBe(current.player);
    expect(registry.getVideoTitleElement()).toBe(current.title);
    activeReel.removeAttribute(SHORTS_ACTIVE_REEL_ATTRIBUTE);
    inactiveReel.setAttribute(SHORTS_ACTIVE_REEL_ATTRIBUTE, "");

    expect(window.location.href).toBe(originalHref);
    expect(registry.getVideoElement()).toBe(inactiveVideo);
    expect(registry.getPlayerContainer()).toBe(inactivePlayer);
    expect(registry.getVideoTitleElement()).toBe(inactiveTitle);
  });

  it("returns null when Shorts has no active reel even if an inactive reel has media", (): void => {
    setLocation("/shorts/current");
    const current: MediaFixture = createShortsMediaFixture(false, "active title");
    const activeReel: HTMLElement | null = current.root.querySelector<HTMLElement>(SHORTS_ACTIVE_REEL_SELECTOR);
    if (!activeReel) {
      throw new Error("Shorts fixture active reel was not created");
    }
    activeReel.removeAttribute(SHORTS_ACTIVE_REEL_ATTRIBUTE);

    expect(
      current.root.querySelector(`ytd-reel-video-renderer:not([${SHORTS_ACTIVE_REEL_ATTRIBUTE}]) video`)
    ).not.toBeNull();
    expect(registry.getVideoElement()).toBeNull();
    expect(registry.getPlayerContainer()).toBeNull();
    expect(registry.getVideoTitleElement()).toBeNull();
  });

  it("uses a visible miniplayer as the fallback scope outside watch and Shorts routes", (): void => {
    setLocation("/feed/subscriptions");
    const retained: MediaFixture = createMiniplayerMediaFixture(true, "retained title");
    const current: MediaFixture = createMiniplayerMediaFixture(false, "current title");

    expect(registry.getVideoElement()).toBe(current.video);
    expect(registry.getPlayerContainer()).toBe(current.player);
    expect(registry.getVideoTitleElement()).toBe(current.title);
    expect(registry.getVideoElement()).not.toBe(retained.video);
  });

  it("keeps the WeakRef cache fast path scoped to its owning page", (): void => {
    const current: MediaFixture = createWatchMediaFixture(false, "current title");
    const first: HTMLVideoElement | null = registry.getVideoElement();
    const querySpy = vi.spyOn(current.root, "querySelector");

    expect(first).toBe(current.video);
    expect(registry.getVideoElement()).toBe(first);
    expect(querySpy).not.toHaveBeenCalled();
  });
});

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
    setLocation("/watch?v=scope");
    document.body.innerHTML = "";
    ReactiveDOMRegistry.getInstance().invalidateCache();
  });

  afterEach((): void => {
    document.body.innerHTML = "";
    ReactiveDOMRegistry.getInstance().invalidateCache();
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
    activeReel.setAttribute(SHORTS_ACTIVE_REEL_ATTRIBUTE, "");
    const activeVideo: HTMLVideoElement = document.createElement("video");
    activeReel.appendChild(activeVideo);
    shorts.appendChild(activeReel);

    observer.trigger([childListRecord(shorts, [inactiveReel, activeReel])]);

    await expect(pending).resolves.toBe(activeVideo);
  });

  it("waits for the active Shorts reel video when an inactive reel already has video", async (): Promise<void> => {
    setLocation("/shorts/xyz");
    const shorts: HTMLElement = document.createElement(SHORTS_PAGE_CONTAINER_SELECTOR);
    document.body.appendChild(shorts);

    const inactiveReel: HTMLElement = document.createElement("ytd-reel-video-renderer");
    const inactivePlayer: HTMLElement = document.createElement("div");
    inactivePlayer.id = "movie_player";
    inactivePlayer.appendChild(document.createElement("video"));
    inactiveReel.appendChild(inactivePlayer);
    shorts.appendChild(inactiveReel);

    const activeReel: HTMLElement = document.createElement("ytd-reel-video-renderer");
    activeReel.setAttribute(SHORTS_ACTIVE_REEL_ATTRIBUTE, "");
    const activePlayer: HTMLElement = document.createElement("div");
    activePlayer.id = "movie_player";
    activeReel.appendChild(activePlayer);
    shorts.appendChild(activeReel);

    expect(ReactiveDOMRegistry.getInstance().getVideoElement()).toBeNull();
    const pending: Promise<HTMLVideoElement | null> = ReactiveDOMRegistry.getInstance().waitForVideoElement(5000);
    const observer: FakeMutationObserver = getActiveObserver();
    expect(observer.observedTargets[0].options).toEqual({
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [SHORTS_ACTIVE_REEL_ATTRIBUTE]
    });

    const activeVideo: HTMLVideoElement = document.createElement("video");
    activePlayer.appendChild(activeVideo);
    observer.trigger([childListRecord(activePlayer, [activeVideo])]);

    await expect(pending).resolves.toBe(activeVideo);
  });

  it("waits for a Shorts active-reel attribute change before resolving its video", async (): Promise<void> => {
    setLocation("/shorts/xyz");
    const shortsFixture: MediaFixture = createShortsMediaFixture(false, "active title");
    const activeReel: HTMLElement | null = shortsFixture.root.querySelector<HTMLElement>(SHORTS_ACTIVE_REEL_SELECTOR);
    if (!activeReel) {
      throw new Error("Shorts fixture active reel was not created");
    }
    activeReel.removeAttribute(SHORTS_ACTIVE_REEL_ATTRIBUTE);

    expect(ReactiveDOMRegistry.getInstance().getVideoElement()).toBeNull();
    const pending: Promise<HTMLVideoElement | null> = ReactiveDOMRegistry.getInstance().waitForVideoElement(5000);
    const observer: FakeMutationObserver = getActiveObserver();
    let settled: boolean = false;
    pending.then((): void => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);

    activeReel.setAttribute(SHORTS_ACTIVE_REEL_ATTRIBUTE, "");
    observer.trigger([attributeRecord(activeReel, SHORTS_ACTIVE_REEL_ATTRIBUTE)]);

    await expect(pending).resolves.toBe(shortsFixture.video);
    expect(FakeMutationObserver.activeInstances.size).toBe(0);
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

  it("does not observe without a legal root and excludes out-of-scope videos on timeout", async (): Promise<void> => {
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
    await expect(pending).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
