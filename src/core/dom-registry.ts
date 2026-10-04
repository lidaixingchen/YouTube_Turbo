import {
  DEFAULT_VIDEO_WIDTH,
  DEFAULT_VIDEO_HEIGHT,
  HIDDEN_ATTRIBUTE,
  MINIPLAYER_HOST_SELECTOR,
  PAGE_MANAGER_ID,
  RETAINED_PAGE_EXCLUSION,
  SHORTS_ACTIVE_REEL_ATTRIBUTE,
  SHORTS_ACTIVE_REEL_SELECTOR,
  SHORTS_PAGE_CONTAINER_SELECTOR,
  WATCH_PAGE_CONTAINER_SELECTOR
} from "./constants";
import {
  detectRouteKind,
  resolveActiveMiniplayerHost,
  resolveRoutePageRoot
} from "./scoped-discovery";
import type { VideoResolution } from "../types";

type DiscoveryRootKind = "route-page" | "miniplayer" | "page-manager";
type MediaScopeKind = Exclude<DiscoveryRootKind, "page-manager">;

interface MediaQueryScope {
  readonly root: HTMLElement;
  readonly kind: MediaScopeKind;
}

interface ScopedNodeCache<T extends HTMLElement> {
  readonly nodeRef: WeakRef<T>;
  readonly scopeRef: WeakRef<HTMLElement>;
  readonly mediaRootRef: WeakRef<HTMLElement>;
  readonly scopeKind: MediaScopeKind;
  readonly href: string;
}

export class ReactiveDOMRegistry {
  private static instance: ReactiveDOMRegistry | null = null;

  private videoCache: ScopedNodeCache<HTMLVideoElement> | null = null;
  private playerCache: ScopedNodeCache<HTMLElement> | null = null;
  private titleCache: ScopedNodeCache<HTMLElement> | null = null;
  private isNavigationBound: boolean = false;

  private static readonly SELECTORS = {
    VIDEO_ALTERNATIVES: ["#movie_player video", "video.video-stream", "video"],
    PLAYER_CONTAINER: "#movie_player, #player-container-outer .html5-video-player, ytd-player, #player",
    VIDEO_TITLE: "h1.title.ytd-video-primary-info-renderer, h1.ytd-watch-metadata, #title h1, h1.watch-title-container"
  } as const;

  private static readonly DEFAULT_TIMEOUT_MS = 5000;

  public static getInstance(): ReactiveDOMRegistry {
    if (!ReactiveDOMRegistry.instance) {
      ReactiveDOMRegistry.instance = new ReactiveDOMRegistry();
      ReactiveDOMRegistry.instance.bindNavigation();
    }
    return ReactiveDOMRegistry.instance;
  }

  private bindNavigation(): void {
    if (this.isNavigationBound || typeof document === "undefined") {
      return;
    }
    this.isNavigationBound = true;

    const resetHandler = (): void => {
      this.invalidateCache();
    };

    document.addEventListener("yt-navigate-finish", resetHandler, false);
    document.addEventListener("yt-page-type-changed", resetHandler, false);
  }

  public invalidateCache(): void {
    this.videoCache = null;
    this.playerCache = null;
    this.titleCache = null;
  }

  private queryVideoElement(root: ParentNode): HTMLVideoElement | null {
    for (const selector of ReactiveDOMRegistry.SELECTORS.VIDEO_ALTERNATIVES) {
      const found: HTMLVideoElement | null = root.querySelector<HTMLVideoElement>(selector);
      if (found) {
        return found;
      }
    }
    return null;
  }

  public getVideoElement(): HTMLVideoElement | null {
    const cached = this.getCachedNode(this.videoCache);
    if (cached) {
      return cached;
    }

    this.videoCache = null;
    const scope: MediaQueryScope | null = this.resolveMediaScope();
    const mediaRoot: HTMLElement | null = scope ? this.resolveMediaContentRoot(scope.root) : null;
    const queried: HTMLVideoElement | null = mediaRoot ? this.queryVideoElement(mediaRoot) : null;
    if (scope && mediaRoot && queried && queried.isConnected && mediaRoot.contains(queried)) {
      this.videoCache = this.createScopedCache(queried, scope, mediaRoot);
      return queried;
    }

    return null;
  }

  public getPlayerContainer(scope?: HTMLElement): HTMLElement | null {
    if (scope) {
      const mediaRoot: HTMLElement | null = this.resolveMediaContentRoot(scope);
      const queried: HTMLElement | null = mediaRoot ? this.queryPlayerContainer(mediaRoot) : null;
      return queried && queried.isConnected && mediaRoot?.contains(queried) ? queried : null;
    }

    const cached = this.getCachedNode(this.playerCache);
    if (cached) {
      return cached;
    }

    this.playerCache = null;
    const mediaScope: MediaQueryScope | null = this.resolveMediaScope();
    const mediaRoot: HTMLElement | null = mediaScope
      ? this.resolveMediaContentRoot(mediaScope.root)
      : null;
    const queried: HTMLElement | null = mediaRoot ? this.queryPlayerContainer(mediaRoot) : null;
    if (mediaScope && mediaRoot && queried && queried.isConnected && mediaRoot.contains(queried)) {
      this.playerCache = this.createScopedCache(queried, mediaScope, mediaRoot);
      return queried;
    }

    return null;
  }

  public getVideoTitleElement(): HTMLElement | null {
    const cached = this.getCachedNode(this.titleCache);
    if (cached) {
      return cached;
    }

    this.titleCache = null;
    const scope: MediaQueryScope | null = this.resolveMediaScope();
    const mediaRoot: HTMLElement | null = scope ? this.resolveMediaContentRoot(scope.root) : null;
    const queried: HTMLElement | null = mediaRoot
      ? mediaRoot.querySelector<HTMLElement>(ReactiveDOMRegistry.SELECTORS.VIDEO_TITLE)
      : null;
    if (scope && mediaRoot && queried && queried.isConnected && mediaRoot.contains(queried)) {
      this.titleCache = this.createScopedCache(queried, scope, mediaRoot);
      return queried;
    }

    return null;
  }

  private resolveMediaScope(): MediaQueryScope | null {
    const pageRoot: HTMLElement | null = resolveRoutePageRoot();
    if (pageRoot) {
      return { root: pageRoot, kind: "route-page" };
    }
    const miniplayerHost: HTMLElement | null = resolveActiveMiniplayerHost();
    return miniplayerHost ? { root: miniplayerHost, kind: "miniplayer" } : null;
  }

  private queryPlayerContainer(mediaRoot: HTMLElement): HTMLElement | null {
    return mediaRoot.matches(ReactiveDOMRegistry.SELECTORS.PLAYER_CONTAINER)
      ? mediaRoot
      : mediaRoot.querySelector<HTMLElement>(ReactiveDOMRegistry.SELECTORS.PLAYER_CONTAINER);
  }

  private resolveMediaContentRoot(scope: HTMLElement): HTMLElement | null {
    return scope.matches(SHORTS_PAGE_CONTAINER_SELECTOR)
      ? scope.querySelector<HTMLElement>(SHORTS_ACTIVE_REEL_SELECTOR)
      : scope;
  }

  private createScopedCache<T extends HTMLElement>(
    node: T,
    scope: MediaQueryScope,
    mediaRoot: HTMLElement
  ): ScopedNodeCache<T> {
    return {
      nodeRef: new WeakRef(node),
      scopeRef: new WeakRef(scope.root),
      mediaRootRef: new WeakRef(mediaRoot),
      scopeKind: scope.kind,
      href: this.getCurrentHref()
    };
  }

  private getCachedNode<T extends HTMLElement>(cache: ScopedNodeCache<T> | null): T | null {
    if (!cache || cache.href !== this.getCurrentHref()) {
      return null;
    }

    const node: T | undefined = cache.nodeRef.deref();
    const scope: HTMLElement | undefined = cache.scopeRef.deref();
    const mediaRoot: HTMLElement | undefined = cache.mediaRootRef.deref();
    if (
      !node ||
      !scope ||
      !mediaRoot ||
      !node.isConnected ||
      !scope.isConnected ||
      !this.isCurrentScope(scope, cache.scopeKind) ||
      !this.isCurrentMediaRoot(scope, mediaRoot) ||
      !scope.contains(mediaRoot) ||
      !mediaRoot.contains(node)
    ) {
      return null;
    }
    return node;
  }

  private getCurrentHref(): string {
    return typeof window === "undefined" ? "" : window.location.href;
  }

  private isCurrentScope(scope: HTMLElement, kind: MediaScopeKind): boolean {
    if (scope.hasAttribute(HIDDEN_ATTRIBUTE)) {
      return false;
    }
    if (kind === "miniplayer") {
      return scope.matches(`${MINIPLAYER_HOST_SELECTOR}${RETAINED_PAGE_EXCLUSION}`);
    }

    const routeKind: ReturnType<typeof detectRouteKind> = detectRouteKind(
      typeof window === "undefined" ? "" : window.location.pathname
    );
    const pageSelector: string | null =
      routeKind === "watch"
        ? WATCH_PAGE_CONTAINER_SELECTOR
        : routeKind === "shorts"
          ? SHORTS_PAGE_CONTAINER_SELECTOR
          : null;
    return pageSelector !== null && scope.matches(`${pageSelector}${RETAINED_PAGE_EXCLUSION}`);
  }

  private isCurrentMediaRoot(scope: HTMLElement, mediaRoot: HTMLElement): boolean {
    return scope.matches(SHORTS_PAGE_CONTAINER_SELECTOR)
      ? mediaRoot.matches(SHORTS_ACTIVE_REEL_SELECTOR)
      : mediaRoot === scope;
  }

  public getVideoTitle(): string {
    const titleEl = this.getVideoTitleElement();
    if (titleEl && titleEl.textContent) {
      return titleEl.textContent.trim();
    }
    return (document.title || "").replace(/- YouTube$/i, "").trim() || "video";
  }

  public getVideoResolution(): VideoResolution {
    const video = this.getVideoElement();
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      return {
        width: video.videoWidth,
        height: video.videoHeight
      };
    }
    return { width: DEFAULT_VIDEO_WIDTH, height: DEFAULT_VIDEO_HEIGHT };
  }

  public getCurrentTime(): number {
    const video = this.getVideoElement();
    return video ? video.currentTime : 0;
  }

  public getDuration(): number {
    const video = this.getVideoElement();
    return video ? video.duration : 0;
  }

  /**
   * 响应式等待 Video 节点就绪：
   * - 静态命中则立即 resolve；
   * - 否则按有限发现根表（路由页面容器 → 活跃迷你播放器宿主 → #page-manager 直子 + hidden 属性观察）挂载
   *   Scoped MutationObserver，发现路由页面容器后在同一等待窗口内收缩观察根，截止时间不变；
   * - 命中以作用域化优先级选择器写入 WeakRef 缓存后 resolve；
   * - 无合法发现根时不建立观察；超时（默认 5000ms）断开兜底并按 getVideoElement 结果收敛。
   */
  public waitForVideoElement(timeoutMs: number = ReactiveDOMRegistry.DEFAULT_TIMEOUT_MS): Promise<HTMLVideoElement | null> {
    const immediate = this.getVideoElement();
    if (immediate) {
      return Promise.resolve(immediate);
    }

    return new Promise((resolve) => {
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let observer: MutationObserver | null = null;
      let currentRoot: HTMLElement | null = null;
      let currentRootKind: DiscoveryRootKind | null = null;

      const cleanup = (): void => {
        if (timeoutTimer !== null) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        currentRoot = null;
        currentRootKind = null;
      };

      const scopedHit = (root: HTMLElement, kind: MediaScopeKind): HTMLVideoElement | null => {
        const mediaRoot: HTMLElement | null = this.resolveMediaContentRoot(root);
        const video: HTMLVideoElement | null = mediaRoot ? this.queryVideoElement(mediaRoot) : null;
        if (mediaRoot && video && video.isConnected && mediaRoot.contains(video)) {
          this.videoCache = this.createScopedCache(video, { root, kind }, mediaRoot);
          return video;
        }
        return null;
      };

      const retargetRoot = (node: HTMLElement, kind: DiscoveryRootKind): void => {
        if (currentRoot === node && currentRootKind === kind) {
          return;
        }
        if (!observer) {
          observer = new MutationObserver(() => {
            advance();
          });
        } else {
          observer.disconnect();
        }
        const isShortsRoot: boolean =
          kind === "route-page" && node.matches(SHORTS_PAGE_CONTAINER_SELECTOR);
        const init: MutationObserverInit =
          kind === "page-manager"
            ? { childList: true, subtree: false, attributes: true, attributeFilter: [HIDDEN_ATTRIBUTE] }
            : isShortsRoot
              ? {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  attributeFilter: [SHORTS_ACTIVE_REEL_ATTRIBUTE]
                }
              : { childList: true, subtree: true };
        observer.observe(node, init);
        currentRoot = node;
        currentRootKind = kind;
      };

      const advance = (): void => {
        const pageRoot: HTMLElement | null = resolveRoutePageRoot();
        if (pageRoot) {
          const video: HTMLVideoElement | null = scopedHit(pageRoot, "route-page");
          if (video) {
            cleanup();
            resolve(video);
            return;
          }
          retargetRoot(pageRoot, "route-page");
          return;
        }
        const miniplayerHost: HTMLElement | null = resolveActiveMiniplayerHost();
        if (miniplayerHost) {
          const video: HTMLVideoElement | null = scopedHit(miniplayerHost, "miniplayer");
          if (video) {
            cleanup();
            resolve(video);
            return;
          }
          retargetRoot(miniplayerHost, "miniplayer");
          return;
        }
        if (typeof window !== "undefined" && detectRouteKind(window.location.pathname) !== "other") {
          const pageManager: HTMLElement | null = document.getElementById(PAGE_MANAGER_ID);
          if (pageManager) {
            retargetRoot(pageManager, "page-manager");
            return;
          }
        }
        if (observer) {
          observer.disconnect();
          observer = null;
          currentRoot = null;
          currentRootKind = null;
        }
      };

      timeoutTimer = setTimeout(() => {
        cleanup();
        resolve(this.getVideoElement());
      }, timeoutMs);

      advance();
    });
  }

}
