import { StyleEngine } from "./style-engine";
import { ReactiveDOMRegistry } from "./dom-registry";
import type { VideoResolution } from "../types";

export { ReactiveDOMRegistry };

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

  openInTab(
    url: string,
    options: { active?: boolean; insert?: boolean; setParent?: boolean } = { active: true, insert: true, setParent: true }
  ): void {
    if (typeof GM_openInTab === "function") {
      GM_openInTab(url, options);
    } else if (typeof GM !== "undefined" && typeof (GM as any).openInTab === "function") {
      (GM as any).openInTab(url, options);
    } else {
      window.open(url, "_blank");
    }
  },

  /**
   * 事件驱动元素等待（基于 MutationObserver 挂载，0 轮询）
   */
  waitForElement<T extends Element = HTMLElement>(
    selector: string,
    target: Element | Document = document.body || document.documentElement,
    timeoutMs?: number
  ): Promise<T | null> {
    return ReactiveDOMRegistry.getInstance().waitForElement<T>(selector, target, timeoutMs);
  },

  /**
   * @deprecated 请优先使用 ReactiveDOMRegistry.waitForElement() 或 waitForVideoElement()
   */
  waitForElementByInterval<T extends Element = HTMLElement>(
    selector: string,
    target: Element | Document = document.body || document.documentElement,
    _allowEmpty: boolean = true,
    _delay?: number,
    maxDelay?: number
  ): Promise<T | null> {
    return ReactiveDOMRegistry.getInstance().waitForElement<T>(selector, target, maxDelay);
  }
};

export const YouTubeDOMAdapter = {
  getVideoElement(): HTMLVideoElement | null {
    return ReactiveDOMRegistry.getInstance().getVideoElement();
  },

  getPlayerContainer(): HTMLElement | null {
    return ReactiveDOMRegistry.getInstance().getPlayerContainer();
  },

  getCurrentTime(): number {
    return ReactiveDOMRegistry.getInstance().getCurrentTime();
  },

  getDuration(): number {
    return ReactiveDOMRegistry.getInstance().getDuration();
  },

  getVideoTitle(): string {
    return ReactiveDOMRegistry.getInstance().getVideoTitle();
  },

  getVideoResolution(): VideoResolution {
    return ReactiveDOMRegistry.getInstance().getVideoResolution();
  },

  setPlaybackRate(rate: number): void {
    ReactiveDOMRegistry.getInstance().setPlaybackRate(rate);
  },

  getPlaybackRate(): number {
    return ReactiveDOMRegistry.getInstance().getPlaybackRate();
  },

  setLoop(loop: boolean): void {
    ReactiveDOMRegistry.getInstance().setLoop(loop);
  },

  isLoop(): boolean {
    return ReactiveDOMRegistry.getInstance().isLoop();
  },

  requestPictureInPicture(): Promise<PictureInPictureWindow> {
    return ReactiveDOMRegistry.getInstance().requestPictureInPicture();
  },

  exitPictureInPicture(): Promise<void> {
    return ReactiveDOMRegistry.getInstance().exitPictureInPicture();
  },

  isPictureInPictureActive(): boolean {
    return ReactiveDOMRegistry.getInstance().isPictureInPictureActive();
  }
};
