import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReactiveDOMRegistry } from "../dom-registry";

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
