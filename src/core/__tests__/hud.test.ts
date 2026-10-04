import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactiveDOMRegistry } from "../dom-registry";
import { HUD_CONSTANTS, PlaybackHUD } from "../hud";

interface PlayerFixture {
  readonly page: HTMLElement;
  readonly player: HTMLElement;
}

function setLocation(path: string): void {
  Object.defineProperty(window, "location", {
    value: new URL(`https://www.youtube.com${path}`),
    writable: true,
    configurable: true
  });
}

function createWatchPlayer(hidden: boolean): PlayerFixture {
  const page: HTMLElement = document.createElement("ytd-watch-flexy");
  if (hidden) {
    page.setAttribute("hidden", "");
  }
  const player: HTMLElement = document.createElement("div");
  player.id = "movie_player";
  page.appendChild(player);
  document.body.appendChild(page);
  return { page, player };
}

function createMiniplayer(): PlayerFixture {
  const page: HTMLElement = document.createElement("ytd-miniplayer");
  const player: HTMLElement = document.createElement("div");
  player.id = "movie_player";
  page.appendChild(player);
  document.body.appendChild(page);
  return { page, player };
}

describe("PlaybackHUD player ownership", (): void => {
  const registry: ReactiveDOMRegistry = ReactiveDOMRegistry.getInstance();
  const cancelledFrameIds: number[] = [];
  const scheduledCallbacks: Map<number, FrameRequestCallback> = new Map<number, FrameRequestCallback>();
  let nextFrameId: number = 0;

  beforeEach((): void => {
    PlaybackHUD.destroy();
    document.body.innerHTML = "";
    setLocation("/watch?v=current");
    registry.invalidateCache();
    cancelledFrameIds.length = 0;
    scheduledCallbacks.clear();
    nextFrameId = 0;

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      const frameId: number = nextFrameId;
      nextFrameId += 1;
      scheduledCallbacks.set(frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (frameId: number): void => {
      cancelledFrameIds.push(frameId);
      scheduledCallbacks.delete(frameId);
    });
  });

  afterEach((): void => {
    PlaybackHUD.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates its HUD in the current player instead of reusing a duplicate from a hidden page", (): void => {
    const hiddenPage: PlayerFixture = createWatchPlayer(true);
    const foreignHud: HTMLElement = document.createElement("div");
    foreignHud.id = HUD_CONSTANTS.ELEMENT_ID;
    foreignHud.textContent = "foreign";
    foreignHud.style.display = "block";
    hiddenPage.player.appendChild(foreignHud);

    const currentPage: PlayerFixture = createWatchPlayer(false);
    const currentForeignHud: HTMLElement = document.createElement("div");
    currentForeignHud.id = HUD_CONSTANTS.ELEMENT_ID;
    currentForeignHud.textContent = "current foreign";
    currentForeignHud.style.display = "block";
    currentPage.player.appendChild(currentForeignHud);
    expect(registry.getPlayerContainer()).toBe(currentPage.player);

    PlaybackHUD.show("current player");

    const ownedHud: HTMLElement | null = currentPage.player.querySelector<HTMLElement>(
      `.${HUD_CONSTANTS.ELEMENT_CLASS}`
    );
    expect(ownedHud?.textContent).toBe("current player");
    expect(hiddenPage.player.contains(foreignHud)).toBe(true);
    expect(foreignHud.style.display).toBe("block");
    expect(currentForeignHud.isConnected).toBe(true);
    expect(currentForeignHud.style.display).toBe("block");
  });

  it("removes its old HUD and cancels its animation when the current player changes", (): void => {
    const watchPlayer: PlayerFixture = createWatchPlayer(false);
    PlaybackHUD.show("watch");
    const oldHud: HTMLElement | null = watchPlayer.player.querySelector<HTMLElement>(
      `.${HUD_CONSTANTS.ELEMENT_CLASS}`
    );
    expect(oldHud).not.toBeNull();

    setLocation("/feed/subscriptions");
    const miniPlayer: PlayerFixture = createMiniplayer();
    expect(registry.getPlayerContainer()).toBe(miniPlayer.player);

    PlaybackHUD.show("miniplayer");

    const newHud: HTMLElement | null = miniPlayer.player.querySelector<HTMLElement>(
      `.${HUD_CONSTANTS.ELEMENT_CLASS}`
    );
    expect(newHud?.textContent).toBe("miniplayer");
    expect(watchPlayer.player.contains(oldHud)).toBe(false);
    expect(cancelledFrameIds).toEqual([0]);
  });

  it("hides and destroys only the HUD node it owns", (): void => {
    const currentPage: PlayerFixture = createWatchPlayer(false);
    const foreignHud: HTMLElement = document.createElement("div");
    foreignHud.id = HUD_CONSTANTS.ELEMENT_ID;
    foreignHud.textContent = "foreign";
    foreignHud.style.display = "block";
    currentPage.player.appendChild(foreignHud);

    PlaybackHUD.show("owned");
    const ownedHud: HTMLElement | null = currentPage.player.querySelector<HTMLElement>(
      `.${HUD_CONSTANTS.ELEMENT_CLASS}`
    );
    expect(ownedHud).not.toBeNull();

    PlaybackHUD.hide();
    expect(ownedHud?.style.display).toBe("none");
    expect(foreignHud.style.display).toBe("block");

    PlaybackHUD.show("owned again");
    PlaybackHUD.destroy();
    expect(ownedHud?.isConnected).toBe(false);
    expect(foreignHud.isConnected).toBe(true);
    expect(foreignHud.style.display).toBe("block");
  });
});
