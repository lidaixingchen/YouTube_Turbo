import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  detectRouteKind,
  resolveActiveMiniplayerHost,
  resolveRoutePageRoot,
  resolveRouteScope,
  resetMissingPageRootWarning
} from "../scoped-discovery";

function setLocation(path: string): void {
  Object.defineProperty(window, "location", {
    value: new URL(`https://www.youtube.com${path}`),
    writable: true,
    configurable: true
  });
}

describe("detectRouteKind", (): void => {
  it("classifies watch, shorts and other routes", (): void => {
    expect(detectRouteKind("/watch?v=abc")).toBe("watch");
    expect(detectRouteKind("/shorts/abc")).toBe("shorts");
    expect(detectRouteKind("/")).toBe("other");
    expect(detectRouteKind("/feed/subscriptions")).toBe("other");
  });
});

describe("scoped discovery roots", (): void => {
  beforeEach((): void => {
    setLocation("/watch?v=discovery");
    document.body.innerHTML = "";
    resetMissingPageRootWarning();
  });

  afterEach((): void => {
    document.body.innerHTML = "";
    resetMissingPageRootWarning();
    vi.restoreAllMocks();
  });

  it("resolves the connected non-hidden route page container", (): void => {
    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);

    expect(resolveRoutePageRoot()).toBe(page);
    expect(resolveRouteScope()).toBe(page);
  });

  it("excludes hidden retained page containers from the route root", (): void => {
    vi.spyOn(console, "warn").mockImplementation((): void => {});
    const retained: HTMLElement = document.createElement("ytd-watch-flexy");
    retained.setAttribute("hidden", "");
    document.body.appendChild(retained);

    expect(resolveRoutePageRoot()).toBeNull();
  });

  it("resolves the shorts page container on shorts routes", (): void => {
    setLocation("/shorts/abc");
    const shorts: HTMLElement = document.createElement("ytd-shorts");
    document.body.appendChild(shorts);

    expect(resolveRoutePageRoot()).toBe(shorts);
  });

  it("returns null on routes without a dedicated page container", (): void => {
    setLocation("/");

    expect(resolveRoutePageRoot()).toBeNull();
  });

  it("resolves the active miniplayer host and excludes hidden hosts", (): void => {
    const host: HTMLElement = document.createElement("ytd-miniplayer");
    document.body.appendChild(host);
    expect(resolveActiveMiniplayerHost()).toBe(host);

    host.setAttribute("hidden", "");
    expect(resolveActiveMiniplayerHost()).toBeNull();
  });

  it("falls back to the miniplayer host when the route page root is missing", (): void => {
    setLocation("/");
    const host: HTMLElement = document.createElement("ytd-miniplayer");
    document.body.appendChild(host);

    expect(resolveRouteScope()).toBe(host);
  });

  it("warns once per missing page container and resets after recovery", (): void => {
    setLocation("/watch?v=warn");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((): void => {});

    expect(resolveRoutePageRoot()).toBeNull();
    expect(resolveRoutePageRoot()).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const page: HTMLElement = document.createElement("ytd-watch-flexy");
    document.body.appendChild(page);
    expect(resolveRoutePageRoot()).toBe(page);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    page.remove();
    expect(resolveRoutePageRoot()).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
