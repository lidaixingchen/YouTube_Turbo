import { StyleEngine } from "../../core/style-engine";
import { YouTubeDOMAdapter } from "../../core/dom-adapter";
import { SubtitleTimeline } from "./timeline";
import type { YouTubePlayerElement, CaptionOffsetProvider } from "./types";

export class CaptionOverlayRenderer {
  private static instance: CaptionOverlayRenderer | null = null;
  private static readonly STYLE_ID = "yt-turbo-caption-renderer-style";
  private static readonly OVERLAY_ID = "yt-turbo-caption-overlay";

  private offsetProvider: CaptionOffsetProvider = () => ({ sessionOffsetMs: 0, effectiveOffsetMs: 0 });
  private isLoopRunning = false;
  private animFrameId: number | null = null;
  private overlayEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private containerEl: HTMLElement | null = null;
  private lastRenderedText: string = "";
  private lastEffectiveOffsetMs: number = 0;

  private readonly handleVideoEvent = (): void => {
    this.updateGateState();
  };

  private readonly handleSeeked = (): void => {
    this.renderCurrentFrame(true);
    this.updateGateState();
  };

  public static getInstance(): CaptionOverlayRenderer {
    if (!this.instance) {
      this.instance = new CaptionOverlayRenderer();
    }
    return this.instance;
  }

  public init(offsetProvider: CaptionOffsetProvider): void {
    this.offsetProvider = offsetProvider;
    this.injectStyles();
    const currentVideo = YouTubeDOMAdapter.getVideoElement();
    const currentContainer = YouTubeDOMAdapter.getPlayerContainer();
    this.attachVideo(currentVideo, currentContainer);
    this.updateGateState();
  }

  public setOffsetProvider(provider: CaptionOffsetProvider): void {
    this.offsetProvider = provider;
    this.updateGateState();
    this.renderCurrentFrame(true);
  }

  public attachVideo(video: HTMLVideoElement | null, container: HTMLElement | null): void {
    if (this.videoEl === video && this.containerEl === container) {
      return;
    }

    if (this.videoEl) {
      this.videoEl.removeEventListener("play", this.handleVideoEvent);
      this.videoEl.removeEventListener("pause", this.handleVideoEvent);
      this.videoEl.removeEventListener("ended", this.handleVideoEvent);
      this.videoEl.removeEventListener("seeking", this.handleVideoEvent);
      this.videoEl.removeEventListener("seeked", this.handleSeeked);
      this.videoEl.removeEventListener("ratechange", this.handleVideoEvent);
    }

    this.videoEl = video;
    this.containerEl = container || (video ? (video.closest(".html5-video-player") as HTMLElement | null) : null);

    if (this.videoEl) {
      this.videoEl.addEventListener("play", this.handleVideoEvent, { passive: true });
      this.videoEl.addEventListener("pause", this.handleVideoEvent, { passive: true });
      this.videoEl.addEventListener("ended", this.handleVideoEvent, { passive: true });
      this.videoEl.addEventListener("seeking", this.handleVideoEvent, { passive: true });
      this.videoEl.addEventListener("seeked", this.handleSeeked, { passive: true });
      this.videoEl.addEventListener("ratechange", this.handleVideoEvent, { passive: true });
    }

    if (this.overlayEl && this.overlayEl.parentNode && this.containerEl && this.overlayEl.parentNode !== this.containerEl) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
      this.overlayEl = null;
      this.textEl = null;
    }

    this.updateGateState();
  }

  private injectStyles(): void {
    const css = `
      #${CaptionOverlayRenderer.OVERLAY_ID} {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 12%;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: none;
        z-index: 26;
        transition: bottom 0.2s ease, opacity 0.15s ease;
      }
      .ytp-autohide #${CaptionOverlayRenderer.OVERLAY_ID} {
        bottom: 6%;
      }
      .yt-turbo-caption-box {
        background: rgba(8, 8, 8, 0.82);
        color: #ffffff;
        padding: 4px 12px;
        font-size: clamp(14px, 2.2vw, 24px);
        line-height: 1.35;
        border-radius: 4px;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
        font-family: "YouTube Noto", Roboto, "Arial Unicode Ms", Arial, Helvetica, sans-serif;
        font-weight: 500;
        max-width: 86%;
        text-align: center;
        white-space: pre-wrap;
        word-break: break-word;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
        display: none;
      }
      .yt-turbo-native-captions-hidden .ytp-caption-window-bottom,
      .yt-turbo-native-captions-hidden .caption-window,
      .yt-turbo-native-captions-hidden .ytp-caption-window-rollup {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    StyleEngine.inject(CaptionOverlayRenderer.STYLE_ID, css);
  }

  private ensureOverlay(): HTMLElement | null {
    if (this.overlayEl && document.body.contains(this.overlayEl)) {
      return this.overlayEl;
    }

    const container = this.containerEl || YouTubeDOMAdapter.getPlayerContainer();
    if (!container) return null;

    let overlay = document.getElementById(CaptionOverlayRenderer.OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = CaptionOverlayRenderer.OVERLAY_ID;

      const box = document.createElement("span");
      box.className = "yt-turbo-caption-box";
      overlay.appendChild(box);

      this.textEl = box;
    } else {
      this.textEl = overlay.querySelector<HTMLElement>(".yt-turbo-caption-box");
    }

    container.appendChild(overlay);
    this.overlayEl = overlay;
    return overlay;
  }

  public isSubtitlesEnabled(): boolean {
    const ccBtn = document.querySelector<HTMLElement>(".ytp-subtitles-button");
    if (ccBtn) {
      const pressed = ccBtn.getAttribute("aria-pressed");
      if (pressed !== null) {
        return pressed === "true";
      }
    }
    const player = (document.getElementById("movie_player") as YouTubePlayerElement | null) ||
      (document.querySelector("#player-container-outer .html5-video-player") as YouTubePlayerElement | null);
    if (player && typeof player.isSubtitlesOn === "function") {
      try {
        return Boolean(player.isSubtitlesOn());
      } catch {
        // Ignore internal reflection errors
      }
    }
    return false;
  }

  public updateGateState(): void {
    const video = this.videoEl || YouTubeDOMAdapter.getVideoElement();
    const isPlaying = Boolean(video && !video.paused && !video.ended);
    const isCC = this.isSubtitlesEnabled();
    const { sessionOffsetMs } = this.offsetProvider();

    const shouldActivateDynamicLoop = isPlaying && isCC && sessionOffsetMs !== 0;

    if (shouldActivateDynamicLoop) {
      this.startLoop();
    } else {
      this.stopLoop();
      if (sessionOffsetMs === 0 || !isCC) {
        this.restoreNativeCaptions();
        this.clearOverlayText();
      }
    }
  }

  private startLoop(): void {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    const loop = () => {
      if (!this.isLoopRunning) return;
      this.renderCurrentFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    this.isLoopRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private restoreNativeCaptions(): void {
    const container = this.containerEl || YouTubeDOMAdapter.getPlayerContainer();
    if (container && container.classList.contains("yt-turbo-native-captions-hidden")) {
      container.classList.remove("yt-turbo-native-captions-hidden");
    }
  }

  private hideNativeCaptions(): void {
    const container = this.containerEl || YouTubeDOMAdapter.getPlayerContainer();
    if (container && !container.classList.contains("yt-turbo-native-captions-hidden")) {
      container.classList.add("yt-turbo-native-captions-hidden");
    }
  }

  private clearOverlayText(): void {
    if (this.textEl && this.lastRenderedText !== "") {
      this.textEl.style.display = "none";
      this.textEl.textContent = "";
      this.lastRenderedText = "";
    }
  }

  public renderCurrentFrame(force: boolean = false): void {
    const video = this.videoEl || YouTubeDOMAdapter.getVideoElement();
    const { sessionOffsetMs, effectiveOffsetMs } = this.offsetProvider();
    const isCC = this.isSubtitlesEnabled();

    if (!video || !isCC || sessionOffsetMs === 0) {
      this.restoreNativeCaptions();
      this.clearOverlayText();
      return;
    }

    const overlay = this.ensureOverlay();
    if (!overlay || !this.textEl) return;

    this.hideNativeCaptions();

    const currentMs = video.currentTime * 1000;
    const targetQueryMs = currentMs - effectiveOffsetMs;

    const activeCues = SubtitleTimeline.getInstance().findActiveCues(targetQueryMs);
    const targetText = activeCues.map((c) => c.text).join("\n").trim();

    if (force || targetText !== this.lastRenderedText || effectiveOffsetMs !== this.lastEffectiveOffsetMs) {
      if (targetText.length > 0) {
        this.textEl.textContent = targetText;
        this.textEl.style.display = "inline-block";
      } else {
        this.textEl.style.display = "none";
        this.textEl.textContent = "";
      }
      this.lastRenderedText = targetText;
      this.lastEffectiveOffsetMs = effectiveOffsetMs;
    }
  }

  public deactivate(): void {
    this.stopLoop();
    this.restoreNativeCaptions();
    this.clearOverlayText();
  }

  public activate(forceRender: boolean = true): void {
    this.updateGateState();
    if (forceRender) {
      this.renderCurrentFrame(true);
    }
  }

  public destroy(): void {
    this.stopLoop();
    this.restoreNativeCaptions();
    if (this.videoEl) {
      this.videoEl.removeEventListener("play", this.handleVideoEvent);
      this.videoEl.removeEventListener("pause", this.handleVideoEvent);
      this.videoEl.removeEventListener("ended", this.handleVideoEvent);
      this.videoEl.removeEventListener("seeking", this.handleVideoEvent);
      this.videoEl.removeEventListener("seeked", this.handleSeeked);
      this.videoEl.removeEventListener("ratechange", this.handleVideoEvent);
      this.videoEl = null;
    }
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
    this.textEl = null;
    this.containerEl = null;
    this.lastRenderedText = "";
    StyleEngine.remove(CaptionOverlayRenderer.STYLE_ID);
  }
}

export const CaptionRenderer = CaptionOverlayRenderer;
