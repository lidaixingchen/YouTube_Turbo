import { StyleEngine } from "./style-engine";
import { POLL_INTERVAL_MS, POLL_MAX_TIMEOUT_MS } from "./constants";
import type { VideoResolution } from "../types";

export const commonUtil = {
  onPageLoad(callback: () => void): void {
    if (document.readyState === "complete") {
      callback();
    } else {
      window.addEventListener("DOMContentLoaded", callback, { once: true });
      window.addEventListener("load", callback, { once: true });
    }
  },

  addStyle(style: string, id?: string): void {
    if (id) {
      StyleEngine.inject(id, style);
      return;
    }
    if (typeof GM_addStyle === "function") {
      GM_addStyle(style);
    } else {
      const el = document.createElement("style");
      el.textContent = style;
      (document.head || document.documentElement).appendChild(el);
    }
  },

  openInTab(url: string, options: { active?: boolean; insert?: boolean; setParent?: boolean } = { active: true, insert: true, setParent: true }): void {
    if (typeof GM_openInTab === "function") {
      GM_openInTab(url, options);
    } else if (typeof GM !== "undefined" && typeof (GM as any).openInTab === "function") {
      (GM as any).openInTab(url, options);
    } else {
      window.open(url, "_blank");
    }
  },

  waitForElementByInterval<T extends Element = HTMLElement>(
    selector: string,
    target: Element | Document = document.body || document.documentElement,
    allowEmpty: boolean = true,
    delay: number = POLL_INTERVAL_MS,
    maxDelay: number = POLL_MAX_TIMEOUT_MS
  ): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      let totalDelay = 0;
      let element = target.querySelector<T>(selector);
      let result = allowEmpty ? !!element : !!element && !!element.innerHTML;
      if (result && element) {
        resolve(element);
        return;
      }
      const elementInterval = setInterval(() => {
        if (totalDelay >= maxDelay) {
          clearInterval(elementInterval);
          resolve(null);
          return;
        }
        element = target.querySelector<T>(selector);
        result = allowEmpty ? !!element : !!element && !!element.innerHTML;
        if (result && element) {
          clearInterval(elementInterval);
          resolve(element);
        } else {
          totalDelay += delay;
        }
      }, delay);
    });
  }
};

export const YouTubeDOMAdapter = {
  getVideoElement(): HTMLVideoElement | null {
    return document.querySelector<HTMLVideoElement>("#movie_player video, video.video-stream, video");
  },

  getPlayerContainer(): HTMLElement | null {
    return (
      document.getElementById("movie_player") ||
      document.querySelector<HTMLElement>("#player-container-outer .html5-video-player")
    );
  },

  getCurrentTime(): number {
    const video = this.getVideoElement();
    return video ? video.currentTime : 0;
  },

  getDuration(): number {
    const video = this.getVideoElement();
    return video ? video.duration : 0;
  },

  getVideoTitle(): string {
    const titleEl = document.querySelector<HTMLElement>(
      "h1.title.ytd-video-primary-info-renderer, h1.ytd-watch-metadata, #title h1, h1.watch-title-container"
    );
    if (titleEl && titleEl.textContent) {
      return titleEl.textContent.trim();
    }
    return (document.title || "").replace(/- YouTube$/i, "").trim() || "video";
  },

  getVideoResolution(): VideoResolution {
    const video = this.getVideoElement();
    if (video) {
      return {
        width: video.videoWidth || video.clientWidth || 1920,
        height: video.videoHeight || video.clientHeight || 1080
      };
    }
    return { width: 1920, height: 1080 };
  },
  setPlaybackRate(rate: number): void {
    const video = this.getVideoElement();
    if (video) {
      video.playbackRate = rate;
    }
  },

  getPlaybackRate(): number {
    const video = this.getVideoElement();
    return video ? video.playbackRate : 1;
  },

  setLoop(loop: boolean): void {
    const video = this.getVideoElement();
    if (video) {
      if (loop) {
        video.setAttribute("loop", "true");
      } else {
        video.removeAttribute("loop");
      }
    }
  },

  isLoop(): boolean {
    const video = this.getVideoElement();
    return video ? video.hasAttribute("loop") : false;
  },

  requestPictureInPicture(): Promise<PictureInPictureWindow> {
    const video = this.getVideoElement();
    if (video && document.pictureInPictureEnabled && !document.pictureInPictureElement) {
      return video.requestPictureInPicture();
    }
    return Promise.reject(new Error("Picture in picture not available"));
  },

  exitPictureInPicture(): Promise<void> {
    if (document.pictureInPictureElement) {
      return document.exitPictureInPicture();
    }
    return Promise.resolve();
  },

  isPictureInPictureActive(): boolean {
    return !!document.pictureInPictureElement;
  }
};

