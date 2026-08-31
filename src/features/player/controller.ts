import { YouTubeDOMAdapter, commonUtil } from "../../core/dom-adapter";
import { StorageUtil } from "../../core/storage";
import { PlaybackHUD } from "../../core/hud";
import {
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_SCREENSHOT_FORMAT,
  DEFAULT_SCREENSHOT_QUALITY,
  PLAYBACK_RATE_EPSILON,
  SCREENSHOT_OBJECT_URL_REVOKE_DELAY_MS,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  VIDEO_RETRY_INTERVAL_MS,
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
}

export const PlayerController = (() => {
  let targetSpeed: number = DEFAULT_PLAYBACK_SPEED;
  let targetLoop: boolean = false;
  const readyCallbacks = new Set<(state: PlayerState) => void>();
  const stateCallbacks = new Set<(state: PlayerState) => void>();
  let boundVideo: HTMLVideoElement | null = null;
  let observer: MutationObserver | null = null;
  let observedContainer: HTMLElement | null = null;
  let isInitialized: boolean = false;
  let navigationToken: number = 0;
  let navigateHandler: (() => void) | null = null;

  const getState = (): PlayerState => ({
    speed: targetSpeed,
    isLoop: targetLoop,
    isPiP: YouTubeDOMAdapter.isPictureInPictureActive(),
    isReady: !!YouTubeDOMAdapter.getVideoElement(),
    videoElement: YouTubeDOMAdapter.getVideoElement()
  });

  const notifyStateChange = (): void => {
    const state = getState();
    stateCallbacks.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        console.error("[PlayerController] stateCallback error:", e);
      }
    });
  };

  const notifyReady = (): void => {
    const state = getState();
    readyCallbacks.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        console.error("[PlayerController] readyCallback error:", e);
      }
    });
  };

  const applyPlaybackSettings = (video: HTMLVideoElement): void => {
    if (Math.abs(video.playbackRate - targetSpeed) > PLAYBACK_RATE_EPSILON) {
      video.playbackRate = targetSpeed;
    }
    if (targetLoop) {
      video.setAttribute("loop", "true");
    } else {
      video.removeAttribute("loop");
    }
  };

  const handleRateChange = (): void => {
    const video = boundVideo || YouTubeDOMAdapter.getVideoElement();
    if (!video) return;
    if (Math.abs(video.playbackRate - targetSpeed) > PLAYBACK_RATE_EPSILON) {
      video.playbackRate = targetSpeed;
    }
    notifyStateChange();
  };

  const handleEnded = (): void => {
    if (targetLoop) {
      const video = boundVideo || YouTubeDOMAdapter.getVideoElement();
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }
  };

  const handleLoadedMetadata = (): void => {
    const video = boundVideo || YouTubeDOMAdapter.getVideoElement();
    if (!video) return;
    applyPlaybackSettings(video);
    notifyStateChange();
    notifyReady();
  };

  const bindVideoListeners = (video: HTMLVideoElement | null): void => {
    if (boundVideo === video && video !== null) {
      applyPlaybackSettings(video);
      return;
    }
    if (boundVideo) {
      boundVideo.removeEventListener("ratechange", handleRateChange);
      boundVideo.removeEventListener("ended", handleEnded);
      boundVideo.removeEventListener("loadedmetadata", handleLoadedMetadata);
      boundVideo.removeEventListener("play", handleLoadedMetadata);
    }
    boundVideo = video;
    if (video) {
      video.addEventListener("ratechange", handleRateChange);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("play", handleLoadedMetadata);
      applyPlaybackSettings(video);
      notifyReady();
      notifyStateChange();
    }
  };

  const setupObserver = (): void => {
    const container =
      YouTubeDOMAdapter.getPlayerContainer() ||
      document.querySelector<HTMLElement>("ytd-player, #player, #player-container, #player-container-outer");
    if (!container) return;
    if (observedContainer === container && observer) return;

    if (observer) {
      observer.disconnect();
    }
    observedContainer = container;
    observer = new MutationObserver(() => {
      const video = YouTubeDOMAdapter.getVideoElement();
      if (video && video !== boundVideo) {
        bindVideoListeners(video);
      }
    });
    observer.observe(container, {
      childList: true,
      subtree: true
    });
  };

  const syncVideoOnNavigate = async (): Promise<void> => {
    const currentToken = ++navigationToken;
    const directVideo = YouTubeDOMAdapter.getVideoElement();
    if (directVideo) {
      bindVideoListeners(directVideo);
      setupObserver();
      return;
    }

    const video = await commonUtil.waitForElementByInterval<HTMLVideoElement>(
      "#movie_player video, video.video-stream, video",
      document.body,
      true,
      VIDEO_RETRY_INTERVAL_MS,
      VIDEO_RETRY_MAX_TIMEOUT_MS
    );

    if (currentToken !== navigationToken) {
      return;
    }

    if (video) {
      bindVideoListeners(video);
      setupObserver();
    }
  };

  return {
    init(): void {
      if (isInitialized) return;
      isInitialized = true;
      const savedSpeed = StorageUtil.getValue(StorageUtil.keys.youtube.videoPlaySpeed, DEFAULT_PLAYBACK_SPEED);
      targetSpeed = typeof savedSpeed === "number" ? savedSpeed : parseFloat(String(savedSpeed)) || DEFAULT_PLAYBACK_SPEED;
      targetLoop = Boolean(StorageUtil.getValue(StorageUtil.keys.youtube.videoLoop, false));

      syncVideoOnNavigate().catch((err: unknown) => {
        console.error("[PlayerController] Initial video sync error:", err);
      });

      if (!navigateHandler) {
        navigateHandler = () => {
          syncVideoOnNavigate().catch((err: unknown) => {
            console.error("[PlayerController] Navigation sync error:", err);
          });
        };
        window.addEventListener("yt-navigate-finish", navigateHandler);
      }
    },

    onReady(callback: (state: PlayerState) => void): () => void {
      readyCallbacks.add(callback);
      if (YouTubeDOMAdapter.getVideoElement()) {
        try {
          callback(getState());
        } catch (e) {
          console.error("[PlayerController] onReady callback error:", e);
        }
      }
      return () => readyCallbacks.delete(callback);
    },

    onStateChange(callback: (state: PlayerState) => void): () => void {
      stateCallbacks.add(callback);
      return () => stateCallbacks.delete(callback);
    },

    setSpeed(rate: number, showToast: boolean = true): void {
      targetSpeed = rate;
      StorageUtil.setValue(StorageUtil.keys.youtube.videoPlaySpeed, rate);
      const video = boundVideo || YouTubeDOMAdapter.getVideoElement();
      if (video) {
        video.playbackRate = rate;
      }
      if (showToast) {
        this.showSpeedToast(`${rate}×`);
      }
      notifyStateChange();
    },

    getSpeed(): number {
      return targetSpeed;
    },

    toggleLoop(forceState?: boolean): boolean {
      targetLoop = typeof forceState === "boolean" ? forceState : !targetLoop;
      StorageUtil.setValue(StorageUtil.keys.youtube.videoLoop, targetLoop);
      YouTubeDOMAdapter.setLoop(targetLoop);
      notifyStateChange();
      return targetLoop;
    },

    isLoopEnabled(): boolean {
      return targetLoop;
    },

    async togglePictureInPicture(): Promise<boolean> {
      if (!document.pictureInPictureEnabled) return false;
      try {
        if (YouTubeDOMAdapter.isPictureInPictureActive()) {
          await YouTubeDOMAdapter.exitPictureInPicture();
          notifyStateChange();
          return false;
        } else {
          await YouTubeDOMAdapter.requestPictureInPicture();
          notifyStateChange();
          return true;
        }
      } catch (err: unknown) {
        console.warn("[PlayerController] PiP toggle error:", err);
        return false;
      }
    },

    captureScreenshot(options: ScreenshotOptions = {}): Promise<Blob | null> {
      return new Promise<Blob | null>((resolve, reject) => {
        const video = YouTubeDOMAdapter.getVideoElement();
        if (!video) {
          return resolve(null);
        }
        try {
          const format = options.format || DEFAULT_SCREENSHOT_FORMAT;
          const quality = options.quality ?? DEFAULT_SCREENSHOT_QUALITY;
          const extension = format.split("/")[1] || "png";
          const title = YouTubeDOMAdapter.getVideoTitle();
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

          canvas.toBlob((blob: Blob | null) => {
            if (!blob) return resolve(null);
            const objectUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement("a");
            downloadLink.href = objectUrl;
            downloadLink.download = filename;
            downloadLink.click();
            setTimeout(() => {
              URL.revokeObjectURL(objectUrl);
            }, SCREENSHOT_OBJECT_URL_REVOKE_DELAY_MS);
            resolve(blob);
          }, format, quality);
        } catch (err: unknown) {
          console.error("[PlayerController] Screenshot failed:", err);
          reject(err);
        }
      });
    },

    showSpeedToast(text: string): void {
      PlaybackHUD.show(text);
    },

    getState,

    destroy(): void {
      navigationToken++;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      observedContainer = null;
      if (navigateHandler) {
        window.removeEventListener("yt-navigate-finish", navigateHandler);
        navigateHandler = null;
      }
      if (boundVideo) {
        boundVideo.removeEventListener("ratechange", handleRateChange);
        boundVideo.removeEventListener("ended", handleEnded);
        boundVideo.removeEventListener("loadedmetadata", handleLoadedMetadata);
        boundVideo.removeEventListener("play", handleLoadedMetadata);
        boundVideo = null;
      }
      readyCallbacks.clear();
      stateCallbacks.clear();
      isInitialized = false;
      PlaybackHUD.destroy();
    }
  };
})();
