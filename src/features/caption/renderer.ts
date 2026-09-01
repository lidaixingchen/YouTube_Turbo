import { StyleEngine } from "../../core/style-engine";
import { YouTubeDOMAdapter } from "../../core/dom-adapter";
import { SubtitleTimeline } from "./timeline";
import type { YouTubePlayerElement } from "./types";

export class CaptionRenderer {
  private static instance: CaptionRenderer | null = null;
  private static readonly STYLE_ID = "yt-turbo-caption-renderer-style";
  private static readonly OVERLAY_ID = "yt-turbo-caption-overlay";

  private offsetProvider: () => number = () => 0;
  private isRunning = false;
  private animFrameId: number | null = null;
  private overlayEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private lastRenderedText: string = "";
  private lastOffsetMs: number = 0;

  public static getInstance(): CaptionRenderer {
    if (!this.instance) {
      this.instance = new CaptionRenderer();
    }
    return this.instance;
  }

  public init(offsetProvider: () => number): void {
    this.offsetProvider = offsetProvider;
    this.injectStyles();
    this.ensureOverlay();
    this.startLoop();
  }

  public setOffsetProvider(provider: () => number): void {
    this.offsetProvider = provider;
    this.renderCurrentFrame(true);
  }

  private injectStyles(): void {
    const css = `
      #${CaptionRenderer.OVERLAY_ID} {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 10%;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: none;
        z-index: 26;
        transition: bottom 0.2s ease, opacity 0.15s ease;
      }
      .yt-turbo-caption-box {
        background: rgba(8, 8, 8, 0.78);
        color: #ffffff;
        padding: 4px 10px;
        font-size: clamp(14px, 2.4vw, 24px);
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
    StyleEngine.inject(CaptionRenderer.STYLE_ID, css);
  }

  private ensureOverlay(): HTMLElement | null {
    if (this.overlayEl && document.body.contains(this.overlayEl)) {
      return this.overlayEl;
    }

    const playerContainer = YouTubeDOMAdapter.getPlayerContainer();
    if (!playerContainer) return null;

    let overlay = document.getElementById(CaptionRenderer.OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = CaptionRenderer.OVERLAY_ID;

      const box = document.createElement("span");
      box.className = "yt-turbo-caption-box";
      overlay.appendChild(box);

      this.textEl = box;
    } else {
      this.textEl = overlay.querySelector<HTMLElement>(".yt-turbo-caption-box");
    }

    playerContainer.appendChild(overlay);
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
        // Ignore internal query errors
      }
    }
    return false;
  }

  private startLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const loop = () => {
      if (!this.isRunning) return;
      this.renderCurrentFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public renderCurrentFrame(force: boolean = false): void {
    const overlay = this.ensureOverlay();
    const playerContainer = YouTubeDOMAdapter.getPlayerContainer();
    const video = YouTubeDOMAdapter.getVideoElement();

    if (!overlay || !playerContainer || !video) {
      return;
    }

    const isCC = this.isSubtitlesEnabled();
    const offsetMs = this.offsetProvider();

    if (!isCC || offsetMs === 0) {
      if (playerContainer.classList.contains("yt-turbo-native-captions-hidden")) {
        playerContainer.classList.remove("yt-turbo-native-captions-hidden");
      }
      if (this.textEl && this.lastRenderedText !== "") {
        this.textEl.style.display = "none";
        this.textEl.textContent = "";
        this.lastRenderedText = "";
      }
      return;
    }

    if (!playerContainer.classList.contains("yt-turbo-native-captions-hidden")) {
      playerContainer.classList.add("yt-turbo-native-captions-hidden");
    }

    const currentMs = video.currentTime * 1000;
    const effectiveMs = currentMs - offsetMs;

    const activeCues = SubtitleTimeline.getInstance().findActiveCues(effectiveMs);
    const targetText = activeCues.map((c) => c.text).join("\n").trim();

    if (this.textEl && (force || targetText !== this.lastRenderedText || offsetMs !== this.lastOffsetMs)) {
      if (targetText.length > 0) {
        this.textEl.textContent = targetText;
        this.textEl.style.display = "inline-block";
      } else {
        this.textEl.style.display = "none";
        this.textEl.textContent = "";
      }
      this.lastRenderedText = targetText;
      this.lastOffsetMs = offsetMs;
    }
  }

  public destroy(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    const playerContainer = YouTubeDOMAdapter.getPlayerContainer();
    if (playerContainer) {
      playerContainer.classList.remove("yt-turbo-native-captions-hidden");
    }
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
    this.textEl = null;
    this.lastRenderedText = "";
    StyleEngine.remove(CaptionRenderer.STYLE_ID);
  }
}
