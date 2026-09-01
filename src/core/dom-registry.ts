import {
  DEFAULT_VIDEO_WIDTH,
  DEFAULT_VIDEO_HEIGHT
} from "./constants";
import type { VideoResolution } from "../types";

export class ReactiveDOMRegistry {
  private static instance: ReactiveDOMRegistry | null = null;

  private videoRef: WeakRef<HTMLVideoElement> | null = null;
  private playerRef: WeakRef<HTMLElement> | null = null;
  private titleRef: WeakRef<HTMLElement> | null = null;
  private isNavigationBound: boolean = false;

  private static readonly SELECTORS = {
    VIDEO: "#movie_player video, video.video-stream, video",
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

  public getVideoElement(): HTMLVideoElement | null {
    const cached = this.videoRef?.deref();
    if (cached && cached.isConnected) {
      return cached;
    }

    const queried = document.querySelector<HTMLVideoElement>(ReactiveDOMRegistry.SELECTORS.VIDEO);
    if (queried) {
      this.videoRef = new WeakRef(queried);
      return queried;
    }

    this.videoRef = null;
    return null;
  }

  public getPlayerContainer(): HTMLElement | null {
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

  public setPlaybackRate(rate: number): void {
    const video = this.getVideoElement();
    if (video) {
      video.playbackRate = rate;
    }
  }

  public getPlaybackRate(): number {
    const video = this.getVideoElement();
    return video ? video.playbackRate : 1.0;
  }

  public setLoop(loop: boolean): void {
    const video = this.getVideoElement();
    if (video) {
      if (loop) {
        video.setAttribute("loop", "true");
      } else {
        video.removeAttribute("loop");
      }
    }
  }

  public isLoop(): boolean {
    const video = this.getVideoElement();
    return video ? video.hasAttribute("loop") : false;
  }

  public requestPictureInPicture(): Promise<PictureInPictureWindow> {
    const video = this.getVideoElement();
    if (video && document.pictureInPictureEnabled && !document.pictureInPictureElement) {
      return video.requestPictureInPicture();
    }
    return Promise.reject(new Error("Picture in picture not available"));
  }

  public exitPictureInPicture(): Promise<void> {
    if (document.pictureInPictureElement) {
      return document.exitPictureInPicture();
    }
    return Promise.resolve();
  }

  public isPictureInPictureActive(): boolean {
    return Boolean(document.pictureInPictureElement);
  }

  /**
   * 响应式等待 Video 节点就绪：
   * - 静态命中则立即 resolve；
   * - 否则在播放器容器上挂载 Scoped MutationObserver，Video 插入即刻 resolve 并断开 Observer；
   * - 超时（默认 5000ms）后自动断开兜底。
   */
  public waitForVideoElement(timeoutMs: number = ReactiveDOMRegistry.DEFAULT_TIMEOUT_MS): Promise<HTMLVideoElement | null> {
    const immediate = this.getVideoElement();
    if (immediate) {
      return Promise.resolve(immediate);
    }

    return new Promise((resolve) => {
      const container =
        this.getPlayerContainer() ||
        document.querySelector<HTMLElement>("ytd-player, #player, #player-container, #player-container-outer, #content") ||
        document.body;

      if (!container) {
        resolve(null);
        return;
      }

      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let observer: MutationObserver | null = null;

      const cleanup = (): void => {
        if (timeoutTimer !== null) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      };

      observer = new MutationObserver(() => {
        const video = this.getVideoElement();
        if (video) {
          cleanup();
          resolve(video);
        }
      });

      timeoutTimer = setTimeout(() => {
        cleanup();
        resolve(this.getVideoElement());
      }, timeoutMs);

      observer.observe(container, {
        childList: true,
        subtree: true
      });
    });
  }

  /**
   * 纯事件驱动元素等待（基于 MutationObserver，0 轮询）
   */
  public waitForElement<T extends Element = HTMLElement>(
    selector: string,
    root: Element | Document = document.body || document.documentElement,
    timeoutMs: number = ReactiveDOMRegistry.DEFAULT_TIMEOUT_MS
  ): Promise<T | null> {
    const targetElement = root instanceof Document ? root.documentElement : root;
    const immediate = targetElement?.querySelector<T>(selector);
    if (immediate) {
      return Promise.resolve(immediate);
    }

    if (!targetElement) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let observer: MutationObserver | null = null;

      const cleanup = (): void => {
        if (timeoutTimer !== null) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      };

      observer = new MutationObserver(() => {
        const found = targetElement.querySelector<T>(selector);
        if (found) {
          cleanup();
          resolve(found);
        }
      });

      timeoutTimer = setTimeout(() => {
        cleanup();
        resolve(targetElement.querySelector<T>(selector));
      }, timeoutMs);

      observer.observe(targetElement, {
        childList: true,
        subtree: true
      });
    });
  }
}
