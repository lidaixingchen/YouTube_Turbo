import {
  DEFAULT_VIDEO_WIDTH,
  DEFAULT_VIDEO_HEIGHT,
  HIDDEN_ATTRIBUTE,
  PAGE_MANAGER_ID
} from "./constants";
import {
  detectRouteKind,
  resolveActiveMiniplayerHost,
  resolveRoutePageRoot
} from "./scoped-discovery";
import type { VideoResolution } from "../types";

type DiscoveryRootKind = "route-page" | "miniplayer" | "page-manager";

export class ReactiveDOMRegistry {
  private static instance: ReactiveDOMRegistry | null = null;

  private videoRef: WeakRef<HTMLVideoElement> | null = null;
  private playerRef: WeakRef<HTMLElement> | null = null;
  private titleRef: WeakRef<HTMLElement> | null = null;
  private isNavigationBound: boolean = false;

  private static readonly SELECTORS = {
    VIDEO_ALTERNATIVES: [
      "ytd-reel-video-renderer[is-active] video",
      "#movie_player video",
      "video.video-stream",
      "video"
    ],
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
    this.videoRef = null;
    this.playerRef = null;
    this.titleRef = null;
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
    const cached = this.videoRef?.deref();
    if (cached && cached.isConnected) {
      return cached;
    }

    const queried = this.queryVideoElement(document);
    if (queried) {
      this.videoRef = new WeakRef(queried);
      return queried;
    }

    this.videoRef = null;
    return null;
  }

  public getPlayerContainer(scope?: HTMLElement): HTMLElement | null {
    if (!scope) {
      const cached = this.playerRef?.deref();
      if (cached && cached.isConnected) {
        return cached;
      }

      const queried =
        document.getElementById("movie_player") ||
        document.querySelector<HTMLElement>(ReactiveDOMRegistry.SELECTORS.PLAYER_CONTAINER);

      if (queried) {
        this.playerRef = new WeakRef(queried);
        return queried;
      }

      this.playerRef = null;
      return null;
    }

    const cached = this.playerRef?.deref();
    if (cached && cached.isConnected && (cached === scope || scope.contains(cached))) {
      return cached;
    }

    const queried = scope.matches(ReactiveDOMRegistry.SELECTORS.PLAYER_CONTAINER)
      ? scope
      : scope.querySelector<HTMLElement>(ReactiveDOMRegistry.SELECTORS.PLAYER_CONTAINER);

    return queried && queried.isConnected ? queried : null;
  }

  public getVideoTitleElement(): HTMLElement | null {
    const cached = this.titleRef?.deref();
    if (cached && cached.isConnected) {
      return cached;
    }

    const queried = document.querySelector<HTMLElement>(ReactiveDOMRegistry.SELECTORS.VIDEO_TITLE);
    if (queried) {
      this.titleRef = new WeakRef(queried);
      return queried;
    }

    this.titleRef = null;
    return null;
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

      const scopedHit = (root: HTMLElement): HTMLVideoElement | null => {
        const video: HTMLVideoElement | null = this.queryVideoElement(root);
        if (video && video.isConnected) {
          this.videoRef = new WeakRef(video);
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
        const init: MutationObserverInit =
          kind === "page-manager"
            ? { childList: true, subtree: false, attributes: true, attributeFilter: [HIDDEN_ATTRIBUTE] }
            : { childList: true, subtree: true };
        observer.observe(node, init);
        currentRoot = node;
        currentRootKind = kind;
      };

      const advance = (): void => {
        const pageRoot: HTMLElement | null = resolveRoutePageRoot();
        if (pageRoot) {
          const video: HTMLVideoElement | null = scopedHit(pageRoot);
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
          const video: HTMLVideoElement | null = scopedHit(miniplayerHost);
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
