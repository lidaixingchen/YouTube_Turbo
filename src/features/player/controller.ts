import { YouTubeDOMAdapter } from "../../core/dom-adapter";
import { StorageUtil } from "../../core/storage";
import { PlaybackHUD } from "../../core/hud";

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
  let targetSpeed = 1;
  let targetLoop = false;
  const readyCallbacks = new Set<(state: PlayerState) => void>();
  const stateCallbacks = new Set<(state: PlayerState) => void>();
  let boundVideo: HTMLVideoElement | null = null;
  let observer: MutationObserver | null = null;
  let isInitialized = false;

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
      try { cb(state); } catch (e) { console.error(e); }
    });
  };

  const notifyReady = (): void => {
    const state = getState();
    readyCallbacks.forEach((cb) => {
      try { cb(state); } catch (e) { console.error(e); }
    });
  };

  const handleRateChange = (): void => {
    const video = YouTubeDOMAdapter.getVideoElement();
    if (!video) return;
    if (Math.abs(video.playbackRate - targetSpeed) > 0.01) {
      video.playbackRate = targetSpeed;
    }
    notifyStateChange();
  };

  const handleEnded = (): void => {
    if (targetLoop) {
      const video = YouTubeDOMAdapter.getVideoElement();
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }
  };

  const handleLoadedMetadata = (): void => {
    const video = YouTubeDOMAdapter.getVideoElement();
    if (!video) return;
    video.playbackRate = targetSpeed;
    if (targetLoop) {
      video.setAttribute("loop", "true");
    } else {
      video.removeAttribute("loop");
    }
    notifyStateChange();
    notifyReady();
  };

  const bindVideoListeners = (video: HTMLVideoElement | null): void => {
    if (boundVideo === video) return;
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
      video.playbackRate = targetSpeed;
      if (targetLoop) {
        video.setAttribute("loop", "true");
      }
      notifyReady();
      notifyStateChange();
    }
  };

  const setupObserver = (): void => {
    if (observer) return;
    observer = new MutationObserver(() => {
      const video = YouTubeDOMAdapter.getVideoElement();
      if (video && video !== boundVideo) {
        bindVideoListeners(video);
      }
    });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  };

  return {
    init(): void {
      if (isInitialized) return;
      isInitialized = true;
      const savedSpeed = StorageUtil.getValue(StorageUtil.keys.youtube.videoPlaySpeed, 1);
      targetSpeed = typeof savedSpeed === "number" ? savedSpeed : parseFloat(String(savedSpeed)) || 1;
      targetLoop = !!StorageUtil.getValue(StorageUtil.keys.youtube.videoLoop, false);
      setupObserver();
      const video = YouTubeDOMAdapter.getVideoElement();
      if (video) {
        bindVideoListeners(video);
      }
      window.addEventListener("yt-navigate-finish", () => {
        const v = YouTubeDOMAdapter.getVideoElement();
        if (v) {
          bindVideoListeners(v);
        }
      });
    },

    onReady(callback: (state: PlayerState) => void): () => void {
      readyCallbacks.add(callback);
      if (YouTubeDOMAdapter.getVideoElement()) {
        try { callback(getState()); } catch (e) { console.error(e); }
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
      const video = YouTubeDOMAdapter.getVideoElement();
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
      } catch (err) {
        console.warn("PiP toggle error:", err);
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
          const format = options.format || "image/png";
          const quality = options.quality ?? 0.95;
          const extension = format.split("/")[1] || "png";
          const title = YouTubeDOMAdapter.getVideoTitle();
          const currentTime = YouTubeDOMAdapter.getCurrentTime();
          const minutes = Math.floor(currentTime / 60);
          const seconds = Math.floor(currentTime % 60);
          const timeStr = `${String(minutes).padStart(2, "0")}-${String(seconds).padStart(2, "0")}`;
          const filename = `${title} ${timeStr} screenshot.${extension}`;

          const { width, height } = YouTubeDOMAdapter.getVideoResolution();
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(video, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (!blob) return resolve(null);
            const objectUrl = URL.createObjectURL(blob);
            const downloadLink = document.createElement("a");
            downloadLink.href = objectUrl;
            downloadLink.download = filename;
            downloadLink.click();
            setTimeout(() => {
              URL.revokeObjectURL(objectUrl);
            }, 1000);
            resolve(blob);
          }, format, quality);
        } catch (err) {
          console.error("Screenshot failed:", err);
          reject(err);
        }
      });
    },

    showSpeedToast(text: string): void {
      PlaybackHUD.show(text);
    },

    getState,

    destroy(): void {
      if (observer) {
        observer.disconnect();
        observer = null;
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
