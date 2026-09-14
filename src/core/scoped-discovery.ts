import {
  MINIPLAYER_HOST_SELECTOR,
  RETAINED_PAGE_EXCLUSION,
  SHORTS_PAGE_CONTAINER_SELECTOR,
  SHORTS_ROUTE_PREFIX,
  WATCH_PAGE_CONTAINER_SELECTOR,
  WATCH_ROUTE_PREFIX
} from "./constants";

export type YouTubeRouteKind = "watch" | "shorts" | "other";

let hasWarnedMissingPageRoot: boolean = false;

export function detectRouteKind(pathname: string): YouTubeRouteKind {
  if (pathname.startsWith(WATCH_ROUTE_PREFIX)) {
    return "watch";
  }
  if (pathname.startsWith(SHORTS_ROUTE_PREFIX)) {
    return "shorts";
  }
  return "other";
}

export function resolveRoutePageRoot(): HTMLElement | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const pathname: string = window.location.pathname;
  const kind: YouTubeRouteKind = detectRouteKind(pathname);
  if (kind === "other") {
    return null;
  }
  const pageSelector: string = kind === "watch" ? WATCH_PAGE_CONTAINER_SELECTOR : SHORTS_PAGE_CONTAINER_SELECTOR;
  const pageRoot: HTMLElement | null = document.querySelector<HTMLElement>(
    `${pageSelector}${RETAINED_PAGE_EXCLUSION}`
  );
  if (!pageRoot) {
    warnMissingPageRoot(pageSelector, pathname);
    return null;
  }
  hasWarnedMissingPageRoot = false;
  return pageRoot;
}

export function resolveActiveMiniplayerHost(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.querySelector<HTMLElement>(`${MINIPLAYER_HOST_SELECTOR}${RETAINED_PAGE_EXCLUSION}`);
}

export function resolveRouteScope(): HTMLElement | null {
  return resolveRoutePageRoot() ?? resolveActiveMiniplayerHost();
}

export function resetMissingPageRootWarning(): void {
  hasWarnedMissingPageRoot = false;
}

function warnMissingPageRoot(pageSelector: string, pathname: string): void {
  if (hasWarnedMissingPageRoot) {
    return;
  }
  hasWarnedMissingPageRoot = true;
  console.warn(
    `[SlotMountBus] route "${pathname}" has no connected page container matching "${pageSelector}${RETAINED_PAGE_EXCLUSION}"; slot mounting is deferred until the container appears or a route event fires`
  );
}
