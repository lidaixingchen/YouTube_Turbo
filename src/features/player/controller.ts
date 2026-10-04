import { ReactiveDOMRegistry } from "../../core/dom-registry";
import { StorageUtil } from "../../core/storage";
import { PlaybackHUD } from "../../core/hud";
import { Locale } from "../../i18n";
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
  includeDataUrl?: boolean;
}

export interface ScreenshotResult {
  blob: Blob;
  dataUrl?: string;
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
  private isInitialized: boolean = false;
  private navigationToken: number = 0;
  private navigateHandler: (() => void) | null = null;
  private globalPlayHandler: ((event: Event) => void) | null = null;

  private ensureActiveVideo(): HTMLVideoElement | null {
    if (!this.boundVideo || !this.boundVideo.isConnected) {
      const direct = ReactiveDOMRegistry.getInstance().getVideoElement();
      if (direct && direct !== this.boundVideo) {
        this.bindVideoListeners(direct);
      } else if (!direct && this.boundVideo) {
        this.bindVideoListeners(null);
      }
    }
    return this.boundVideo;
  }

  private readonly handleRateChange = (): void => {
    const video = this.boundVideo;
    if (!video || !video.isConnected) return;
    if (Math.abs(video.playbackRate - this.targetSpeed) > PLAYBACK_RATE_EPSILON) {
      video.playbackRate = this.targetSpeed;
    }
    this.notifyStateChange();
  };

  private readonly handleEnded = (): void => {
    if (this.targetLoop) {
      const video = this.boundVideo;
      if (video && video.isConnected) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }
  };

  private readonly handleLoadedMetadata = (): void => {
    const video = this.boundVideo;
    if (!video || !video.isConnected) return;
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
    const video = this.ensureActiveVideo();
    return {
      speed: this.targetSpeed,
      isLoop: this.targetLoop,
      isPiP: Boolean(document.pictureInPictureElement),
      isReady: Boolean(video),
      videoElement: video
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
    video.loop = this.targetLoop;
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

  private async syncVideoOnNavigate(): Promise<void> {
    const currentToken = ++this.navigationToken;
    ReactiveDOMRegistry.getInstance().invalidateCache();
    const directVideo = ReactiveDOMRegistry.getInstance().getVideoElement();
    if (directVideo) {
      this.bindVideoListeners(directVideo);
      return;
    }

    const video = await ReactiveDOMRegistry.getInstance().waitForVideoElement(VIDEO_RETRY_MAX_TIMEOUT_MS);

    if (currentToken !== this.navigationToken) {
      return;
    }

    if (video) {
      this.bindVideoListeners(video);
    }
  }

  public init(): void {
    if (this.isInitialized) return;
    const savedSpeed = StorageUtil.getValue(StorageUtil.keys.youtube.videoPlaySpeed, DEFAULT_PLAYBACK_SPEED);
    const targetSpeed: number = typeof savedSpeed === "number"
      ? savedSpeed
      : parseFloat(String(savedSpeed)) || DEFAULT_PLAYBACK_SPEED;
    let addedNavigateHandler: boolean = false;
    let addedGlobalPlayHandler: boolean = false;

    try {
      if (!this.navigateHandler) {
        const navigateHandler: () => void = (): void => {
          this.syncVideoOnNavigate().catch((err: unknown) => {
            console.error("[PlayerController] Navigation sync error:", err);
          });
        };
        window.addEventListener("yt-navigate-finish", navigateHandler);
        this.navigateHandler = navigateHandler;
        addedNavigateHandler = true;
      }

      if (!this.globalPlayHandler) {
        const globalPlayHandler: (event: Event) => void = (event: Event): void => {
          const target = event.target;
          if (target instanceof HTMLVideoElement && target !== this.boundVideo && target.isConnected) {
            this.bindVideoListeners(target);
          }
        };
        document.addEventListener("play", globalPlayHandler, true);
        this.globalPlayHandler = globalPlayHandler;
        addedGlobalPlayHandler = true;
      }

      this.targetSpeed = targetSpeed;
      this.isInitialized = true;
    } catch (error: unknown) {
      const cleanupErrors: unknown[] = [];
      if (addedGlobalPlayHandler && this.globalPlayHandler) {
        try {
          document.removeEventListener("play", this.globalPlayHandler, true);
          this.globalPlayHandler = null;
        } catch (cleanupError: unknown) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (addedNavigateHandler && this.navigateHandler) {
        try {
          window.removeEventListener("yt-navigate-finish", this.navigateHandler);
          this.navigateHandler = null;
        } catch (cleanupError: unknown) {
          cleanupErrors.push(cleanupError);
        }
      }
      this.isInitialized = false;
      this.navigationToken++;
      if (cleanupErrors.length > 0) {
        throw new AggregateError([error, ...cleanupErrors], "[PlayerController] Initialization and cleanup failed");
      }
      throw error;
    }

    this.syncVideoOnNavigate().catch((err: unknown) => {
      console.error("[PlayerController] Initial video sync error:", err);
    });
  }

  public onReady(callback: (state: PlayerState) => void): () => void {
    this.readyCallbacks.add(callback);
    if (this.ensureActiveVideo()) {
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
    const video = this.ensureActiveVideo();
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

  public toggleLoop(forceState?: boolean, showToast: boolean = true): boolean {
    const nextState = typeof forceState === "boolean" ? forceState : !this.targetLoop;
    if (typeof forceState === "boolean" && this.targetLoop === forceState) {
      return this.targetLoop;
    }
    this.targetLoop = nextState;
    StorageUtil.setValue(StorageUtil.keys.youtube.videoLoop, this.targetLoop);
    const video = this.ensureActiveVideo();
    if (video) {
      if (this.targetLoop) {
        video.setAttribute("loop", "true");
      } else {
        video.removeAttribute("loop");
      }
    }
    if (showToast) {
      PlaybackHUD.show(this.targetLoop ? Locale.t("hud_loop_enabled") : Locale.t("hud_loop_disabled"));
    }
    this.notifyStateChange();
    return this.targetLoop;
  }

  public setLoop(enabled: boolean, showToast: boolean = false): void {
    this.toggleLoop(enabled, showToast);
  }

  public restoreLoopState(enabled: boolean): void {
    this.targetLoop = enabled;
    const video: HTMLVideoElement | null = this.ensureActiveVideo();
    if (video) {
      this.applyPlaybackSettings(video);
    }
    this.notifyStateChange();
  }

  public isLoopEnabled(): boolean {
    return this.targetLoop;
  }

  public async togglePictureInPicture(): Promise<boolean> {
    if (!document.pictureInPictureEnabled) return false;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        PlaybackHUD.show(Locale.t("hud_pip_disabled"));
        this.notifyStateChange();
        return false;
      } else {
        const video = this.ensureActiveVideo();
        if (video) {
          await video.requestPictureInPicture();
          PlaybackHUD.show(Locale.t("hud_pip_enabled"));
          this.notifyStateChange();
          return true;
        }
        return false;
      }
    } catch (err: unknown) {
      console.warn("[PlayerController] PiP toggle error:", err);
      return false;
    }
  }

  public captureScreenshot(options: ScreenshotOptions = {}): Promise<ScreenshotResult | null> {
    return new Promise<ScreenshotResult | null>((resolve, reject) => {
      const video = this.ensureActiveVideo();
      if (!video) {
        return resolve(null);
      }
      let canvas: HTMLCanvasElement | null = null;
      try {
        const format = options.format || DEFAULT_SCREENSHOT_FORMAT;
        const quality = options.quality ?? DEFAULT_SCREENSHOT_QUALITY;
        const shouldDownload = options.download !== false;
        const extension = format.split("/")[1] || "png";
        const rawTitle = options.customTitle || ReactiveDOMRegistry.getInstance().getVideoTitle();
        const title = sanitizeFileName(rawTitle);
        const currentTime = video.currentTime;

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

        const { width, height } = ReactiveDOMRegistry.getInstance().getVideoResolution();
        canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          canvas.width = 0;
          canvas.height = 0;
          return resolve(null);
        }
        ctx.drawImage(video, 0, 0, width, height);

        const dataUrl = options.includeDataUrl ? canvas.toDataURL(format, quality) : undefined;
        const activeCanvas = canvas;

        activeCanvas.toBlob((blob: Blob | null) => {
          activeCanvas.width = 0;
          activeCanvas.height = 0;

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
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
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
    if (this.navigateHandler) {
      window.removeEventListener("yt-navigate-finish", this.navigateHandler);
      this.navigateHandler = null;
    }
    if (this.globalPlayHandler) {
      document.removeEventListener("play", this.globalPlayHandler, true);
      this.globalPlayHandler = null;
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
