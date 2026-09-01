import { YouTubeDOMAdapter, ReactiveDOMRegistry } from "../../core/dom-adapter";
import { StorageUtil } from "../../core/storage";
import { PlaybackHUD } from "../../core/hud";
import { Locale } from "../../i18n";
import { Toolbar, TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import {
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_SCREENSHOT_FORMAT,
  DEFAULT_SCREENSHOT_QUALITY,
  DEFAULT_SPEED_STEP,
  MAX_PLAY_SPEED,
  MIN_PLAY_SPEED,
  PLAYBACK_RATE_EPSILON,
  SCREENSHOT_OBJECT_URL_REVOKE_DELAY_MS,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  VIDEO_RETRY_MAX_TIMEOUT_MS
} from "../../core/constants";

export interface PlayerState {
  speed: number;
  isLoop: boolean;
  isPiP: boolean;
  isReady: boolean;
  videoElement: HTMLVideoElement | null;
}

export interface ScreenshotOptions {
  format?: string;
  quality?: number;
  download?: boolean;
  customTitle?: string;
}

export interface ScreenshotResult {
  blob: Blob;
  dataUrl: string;
  filename: string;
}

export function sanitizeFileName(name: string, fallback: string = "YouTube_Video"): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

export class PlayerController {
  private static instance: PlayerController | null = null;

  private targetSpeed: number = DEFAULT_PLAYBACK_SPEED;
  private targetLoop: boolean = false;
  private readonly readyCallbacks: Set<(state: PlayerState) => void> = new Set();
  private readonly stateCallbacks: Set<(state: PlayerState) => void> = new Set();
  private boundVideo: HTMLVideoElement | null = null;
  private observer: MutationObserver | null = null;
  private observedContainer: HTMLElement | null = null;
  private isInitialized: boolean = false;
  private navigationToken: number = 0;
  private navigateHandler: (() => void) | null = null;

  private readonly handleRateChange = (): void => {
    const video = this.boundVideo || YouTubeDOMAdapter.getVideoElement();
    if (!video) return;
    if (Math.abs(video.playbackRate - this.targetSpeed) > PLAYBACK_RATE_EPSILON) {
      video.playbackRate = this.targetSpeed;
    }
    this.notifyStateChange();
  };

  private readonly handleEnded = (): void => {
    if (this.targetLoop) {
      const video = this.boundVideo || YouTubeDOMAdapter.getVideoElement();
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }
  };

  private readonly handleLoadedMetadata = (): void => {
    const video = this.boundVideo || YouTubeDOMAdapter.getVideoElement();
    if (!video) return;
    this.applyPlaybackSettings(video);
    this.notifyStateChange();
    this.notifyReady();
  };

  private constructor() {}

  public static getInstance(): PlayerController {
    if (!PlayerController.instance) {
      PlayerController.instance = new PlayerController();
    }
    return PlayerController.instance;
  }

  public getState(): PlayerState {
    return {
      speed: this.targetSpeed,
      isLoop: this.targetLoop,
      isPiP: YouTubeDOMAdapter.isPictureInPictureActive(),
      isReady: !!YouTubeDOMAdapter.getVideoElement(),
      videoElement: YouTubeDOMAdapter.getVideoElement()
    };
  }

  private notifyStateChange(): void {
    const state = this.getState();
    this.stateCallbacks.forEach((cb: (state: PlayerState) => void) => {
      try {
        cb(state);
      } catch (e: unknown) {
        console.error("[PlayerController] stateCallback error:", e);
      }
    });
  }

  private notifyReady(): void {
    const state = this.getState();
    this.readyCallbacks.forEach((cb: (state: PlayerState) => void) => {
      try {
        cb(state);
      } catch (e: unknown) {
        console.error("[PlayerController] readyCallback error:", e);
      }
    });
  }

  private applyPlaybackSettings(video: HTMLVideoElement): void {
    if (Math.abs(video.playbackRate - this.targetSpeed) > PLAYBACK_RATE_EPSILON) {
      video.playbackRate = this.targetSpeed;
    }
    if (this.targetLoop) {
      video.setAttribute("loop", "true");
    } else {
      video.removeAttribute("loop");
    }
  }

  private bindVideoListeners(video: HTMLVideoElement | null): void {
    if (this.boundVideo === video && video !== null) {
      this.applyPlaybackSettings(video);
      return;
    }
    if (this.boundVideo) {
      this.boundVideo.removeEventListener("ratechange", this.handleRateChange);
      this.boundVideo.removeEventListener("ended", this.handleEnded);
      this.boundVideo.removeEventListener("loadedmetadata", this.handleLoadedMetadata);
      this.boundVideo.removeEventListener("play", this.handleLoadedMetadata);
    }
    this.boundVideo = video;
    if (video) {
      video.addEventListener("ratechange", this.handleRateChange);
      video.addEventListener("ended", this.handleEnded);
      video.addEventListener("loadedmetadata", this.handleLoadedMetadata);
      video.addEventListener("play", this.handleLoadedMetadata);
      this.applyPlaybackSettings(video);
      this.notifyReady();
      this.notifyStateChange();
    }
  }

  private setupObserver(): void {
    const container =
      YouTubeDOMAdapter.getPlayerContainer() ||
      document.querySelector<HTMLElement>("ytd-player, #player, #player-container, #player-container-outer");
    if (!container) return;
    if (this.observedContainer === container && this.observer) return;

    if (this.observer) {
      this.observer.disconnect();
    }
    this.observedContainer = container;
    this.observer = new MutationObserver(() => {
      const video = YouTubeDOMAdapter.getVideoElement();
      if (video && video !== this.boundVideo) {
        this.bindVideoListeners(video);
      }
    });
    this.observer.observe(container, {
      childList: true,
      subtree: true
    });
  }

  private async syncVideoOnNavigate(): Promise<void> {
    const currentToken = ++this.navigationToken;
    const directVideo = YouTubeDOMAdapter.getVideoElement();
    if (directVideo) {
      this.bindVideoListeners(directVideo);
      this.setupObserver();
      return;
    }

    const video = await ReactiveDOMRegistry.getInstance().waitForVideoElement(VIDEO_RETRY_MAX_TIMEOUT_MS);

    if (currentToken !== this.navigationToken) {
      return;
    }

    if (video) {
      this.bindVideoListeners(video);
      this.setupObserver();
    }
  }

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    const savedSpeed = StorageUtil.getValue(StorageUtil.keys.youtube.videoPlaySpeed, DEFAULT_PLAYBACK_SPEED);
    this.targetSpeed = typeof savedSpeed === "number" ? savedSpeed : parseFloat(String(savedSpeed)) || DEFAULT_PLAYBACK_SPEED;
    this.targetLoop = Boolean(StorageUtil.getValue(StorageUtil.keys.youtube.videoLoop, false));

    Toolbar.registerActions([
      {
        id: "screenshot",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_screenshot",
        defaultTitle: "Screenshot",
        icon: "screenshot",
        order: 30,
        dismissOnExecute: true,
        onClick: () => {
          this.captureScreenshot();
        }
      },
      {
        id: "pip",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_pip",
        defaultTitle: "Picture to picture",
        icon: "pip",
        order: 40,
        dismissOnExecute: true,
        onClick: () => {
          this.togglePictureInPicture();
        }
      },
      {
        id: "loop",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_loop",
        defaultTitle: "Loop",
        icon: { normal: "loopOff", active: "loopOn" },
        order: 50,
        dismissOnExecute: false,
        isActive: () => this.isLoopEnabled(),
        onClick: (_e, ctx) => {
          this.toggleLoop();
          ctx.refresh();
        },
        onStateBind: (refresh) => {
          return this.onStateChange(refresh);
        }
      }
    ]);

    this.syncVideoOnNavigate().catch((err: unknown) => {
      console.error("[PlayerController] Initial video sync error:", err);
    });

    if (!this.navigateHandler) {
      this.navigateHandler = () => {
        this.syncVideoOnNavigate().catch((err: unknown) => {
          console.error("[PlayerController] Navigation sync error:", err);
        });
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler);
    }
  }

  public onReady(callback: (state: PlayerState) => void): () => void {
    this.readyCallbacks.add(callback);
    if (YouTubeDOMAdapter.getVideoElement()) {
      try {
        callback(this.getState());
      } catch (e: unknown) {
        console.error("[PlayerController] onReady callback error:", e);
      }
    }
    return () => this.readyCallbacks.delete(callback);
  }

  public onStateChange(callback: (state: PlayerState) => void): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  public setSpeed(rate: number, showToast: boolean = true): void {
    const clamped = Math.min(Math.max(rate, MIN_PLAY_SPEED), MAX_PLAY_SPEED);
    const normalized = Math.round(clamped * 100) / 100;
    this.targetSpeed = normalized;
    StorageUtil.setValue(StorageUtil.keys.youtube.videoPlaySpeed, normalized);
    const video = this.boundVideo || YouTubeDOMAdapter.getVideoElement();
    if (video) {
      video.playbackRate = normalized;
    }
    if (showToast) {
      this.showSpeedToast(`${normalized}×`);
    }
    this.notifyStateChange();
  }

  public getSpeed(): number {
    return this.targetSpeed;
  }

  public increaseSpeed(step: number = DEFAULT_SPEED_STEP, showToast: boolean = true): number {
    const current = this.getSpeed();
    const next = Math.min(Math.round((current + step) * 100) / 100, MAX_PLAY_SPEED);
    this.setSpeed(next, showToast);
    return next;
  }

  public decreaseSpeed(step: number = DEFAULT_SPEED_STEP, showToast: boolean = true): number {
    const current = this.getSpeed();
    const next = Math.max(Math.round((current - step) * 100) / 100, MIN_PLAY_SPEED);
    this.setSpeed(next, showToast);
    return next;
  }

  public resetSpeed(showToast: boolean = true): number {
    this.setSpeed(DEFAULT_PLAYBACK_SPEED, showToast);
    return DEFAULT_PLAYBACK_SPEED;
  }

  public toggleLoop(forceState?: boolean): boolean {
    this.targetLoop = typeof forceState === "boolean" ? forceState : !this.targetLoop;
    StorageUtil.setValue(StorageUtil.keys.youtube.videoLoop, this.targetLoop);
    YouTubeDOMAdapter.setLoop(this.targetLoop);
    PlaybackHUD.show(this.targetLoop ? Locale.t("hud_loop_enabled") : Locale.t("hud_loop_disabled"));
    this.notifyStateChange();
    return this.targetLoop;
  }

  public setLoop(enabled: boolean): void {
    this.toggleLoop(enabled);
  }

  public isLoopEnabled(): boolean {
    return this.targetLoop;
  }

  public async togglePictureInPicture(): Promise<boolean> {
    if (!document.pictureInPictureEnabled) return false;
    try {
      if (YouTubeDOMAdapter.isPictureInPictureActive()) {
        await YouTubeDOMAdapter.exitPictureInPicture();
        PlaybackHUD.show(Locale.t("hud_pip_disabled"));
        this.notifyStateChange();
        return false;
      } else {
        await YouTubeDOMAdapter.requestPictureInPicture();
        PlaybackHUD.show(Locale.t("hud_pip_enabled"));
        this.notifyStateChange();
        return true;
      }
    } catch (err: unknown) {
      console.warn("[PlayerController] PiP toggle error:", err);
      return false;
    }
  }

  public captureScreenshot(options: ScreenshotOptions = {}): Promise<ScreenshotResult | null> {
    return new Promise<ScreenshotResult | null>((resolve, reject) => {
      const video = YouTubeDOMAdapter.getVideoElement();
      if (!video) {
        return resolve(null);
      }
      try {
        const format = options.format || DEFAULT_SCREENSHOT_FORMAT;
        const quality = options.quality ?? DEFAULT_SCREENSHOT_QUALITY;
        const shouldDownload = options.download !== false;
        const extension = format.split("/")[1] || "png";
        const rawTitle = options.customTitle || YouTubeDOMAdapter.getVideoTitle();
        const title = sanitizeFileName(rawTitle);
        const currentTime = YouTubeDOMAdapter.getCurrentTime();

        const totalSeconds = Math.floor(currentTime);
        const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
        const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
        const seconds = totalSeconds % SECONDS_PER_MINUTE;

        const paddedMinutes = String(minutes).padStart(2, "0");
        const paddedSeconds = String(seconds).padStart(2, "0");
        const timeStr = hours > 0
          ? `${String(hours).padStart(2, "0")}-${paddedMinutes}-${paddedSeconds}`
          : `${paddedMinutes}-${paddedSeconds}`;

        const filename = `${title} ${timeStr} screenshot.${extension}`;

        const { width, height } = YouTubeDOMAdapter.getVideoResolution();
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(video, 0, 0, width, height);

        const dataUrl = canvas.toDataURL(format, quality);

        canvas.toBlob((blob: Blob | null) => {
          if (!blob) return resolve(null);

          if (shouldDownload) {
            const objectUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement("a");
            downloadLink.href = objectUrl;
            downloadLink.download = filename;
            downloadLink.click();
            setTimeout(() => {
              URL.revokeObjectURL(objectUrl);
            }, SCREENSHOT_OBJECT_URL_REVOKE_DELAY_MS);
            PlaybackHUD.show(Locale.t("hud_screenshot_saved"));
          }

          resolve({
            blob,
            dataUrl,
            filename
          });
        }, format, quality);
      } catch (err: unknown) {
        console.error("[PlayerController] Screenshot failed:", err);
        reject(err);
      }
    });
  }

  public showSpeedToast(text: string): void {
    PlaybackHUD.show(text);
  }

  public destroy(): void {
    this.navigationToken++;
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.observedContainer = null;
    if (this.navigateHandler) {
      window.removeEventListener("yt-navigate-finish", this.navigateHandler);
      this.navigateHandler = null;
    }
    if (this.boundVideo) {
      this.boundVideo.removeEventListener("ratechange", this.handleRateChange);
      this.boundVideo.removeEventListener("ended", this.handleEnded);
      this.boundVideo.removeEventListener("loadedmetadata", this.handleLoadedMetadata);
      this.boundVideo.removeEventListener("play", this.handleLoadedMetadata);
      this.boundVideo = null;
    }
    this.readyCallbacks.clear();
    this.stateCallbacks.clear();
    this.isInitialized = false;
    PlaybackHUD.destroy();
  }
}
