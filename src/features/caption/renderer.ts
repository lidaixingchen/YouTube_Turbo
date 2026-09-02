import { StyleEngine } from "../../core/style-engine";
import { ReactiveDOMRegistry } from "../../core/dom-registry";
import { SubtitleTimeline } from "./timeline";
import { SUBTITLE_CONSTANTS } from "./constants";
import type { YouTubePlayerElement, CaptionOffsetProvider } from "./types";

export class CaptionOverlayRenderer {
  private isLoopRunning: boolean = false;
  private animFrameId: number | null = null;
  private overlayEl: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private containerEl: HTMLElement | null = null;

  private isCCActive: boolean = false;
  private isPlaying: boolean = false;
  private isNativeCaptionsHidden: boolean = false;
  private lastRenderedText: string = "";
  private lastEffectiveOffsetMs: number = 0;

  private ccButtonObserver: MutationObserver | null = null;
  private observedCCButton: HTMLElement | null = null;
  private controlsObserver: MutationObserver | null = null;

  private readonly handleVideoPlay = (): void => {
    this.isPlaying = true;
    this.updateGateState();
  };

  private readonly handleVideoPause = (): void => {
    this.isPlaying = false;
    this.updateGateState();
  };

  private readonly handleVideoEnded = (): void => {
    this.isPlaying = false;
    this.updateGateState();
  };

  private readonly handleVideoSeeking = (): void => {
    this.updateGateState();
  };

  private readonly handleVideoSeeked = (): void => {
    this.timeline.resetPointer();
    this.renderCurrentFrame(true);
    this.updateGateState();
  };

  private readonly handleVideoRateChange = (): void => {
    this.updateGateState();
  };

  public constructor(
    private readonly offsetProvider: CaptionOffsetProvider,
    private readonly timeline: SubtitleTimeline
  ) {}

  public init(): void {
    this.injectStyles();
    const currentVideo = ReactiveDOMRegistry.getInstance().getVideoElement();
    const currentContainer = ReactiveDOMRegistry.getInstance().getPlayerContainer();
    this.attachVideo(currentVideo, currentContainer);
  }

  public attachVideo(video: HTMLVideoElement | null, container?: HTMLElement | null): void {
    const resolvedContainer =
      container ||
      (video ? (video.closest(SUBTITLE_CONSTANTS.SELECTOR_PLAYER_CONTAINER) as HTMLElement | null) : null) ||
      ReactiveDOMRegistry.getInstance().getPlayerContainer();

    const isButtonValid = Boolean(this.observedCCButton && this.observedCCButton.isConnected);
    const isContainerValid = Boolean(this.containerEl && this.containerEl.isConnected);

    if (this.videoEl === video && this.containerEl === resolvedContainer && isButtonValid && isContainerValid) {
      return;
    }

    this.detachVideoListeners();
    this.detachObservers();

    this.videoEl = video;
    this.containerEl = resolvedContainer;

    if (this.videoEl) {
      this.isPlaying = !this.videoEl.paused && !this.videoEl.ended;
      this.videoEl.addEventListener("play", this.handleVideoPlay, { passive: true });
      this.videoEl.addEventListener("pause", this.handleVideoPause, { passive: true });
      this.videoEl.addEventListener("ended", this.handleVideoEnded, { passive: true });
      this.videoEl.addEventListener("seeking", this.handleVideoSeeking, { passive: true });
      this.videoEl.addEventListener("seeked", this.handleVideoSeeked, { passive: true });
      this.videoEl.addEventListener("ratechange", this.handleVideoRateChange, { passive: true });
    } else {
      this.isPlaying = false;
    }

    if (this.overlayEl && this.overlayEl.parentNode && this.containerEl && this.overlayEl.parentNode !== this.containerEl) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
      this.overlayEl = null;
      this.textEl = null;
    }

    this.ensureOverlay();
    this.setupCCButtonObservation();
    this.syncCCState();
    this.updateGateState();
  }

  private detachVideoListeners(): void {
    if (this.videoEl) {
      this.videoEl.removeEventListener("play", this.handleVideoPlay);
      this.videoEl.removeEventListener("pause", this.handleVideoPause);
      this.videoEl.removeEventListener("ended", this.handleVideoEnded);
      this.videoEl.removeEventListener("seeking", this.handleVideoSeeking);
      this.videoEl.removeEventListener("seeked", this.handleVideoSeeked);
      this.videoEl.removeEventListener("ratechange", this.handleVideoRateChange);
    }
  }

  private detachObservers(): void {
    if (this.ccButtonObserver) {
      this.ccButtonObserver.disconnect();
      this.ccButtonObserver = null;
    }
    this.observedCCButton = null;

    if (this.controlsObserver) {
      this.controlsObserver.disconnect();
      this.controlsObserver = null;
    }
  }

  private setupCCButtonObservation(): void {
    const root = (this.containerEl && this.containerEl.isConnected ? this.containerEl : null) || document;
    const ccBtn = root.querySelector<HTMLElement>(SUBTITLE_CONSTANTS.SELECTOR_SUBTITLES_BUTTON);

    if (ccBtn) {
      this.bindCCButtonObserver(ccBtn);
      return;
    }

    // 仅针对底栏控制区进行局部监听，绝不挂载播放器容器整体的 subtree: true，无字幕视频不常驻
    const chromeBottom = root.querySelector<HTMLElement>(SUBTITLE_CONSTANTS.SELECTOR_CHROME_BOTTOM);
    if (chromeBottom) {
      this.controlsObserver = new MutationObserver(() => {
        const foundBtn = chromeBottom.querySelector<HTMLElement>(SUBTITLE_CONSTANTS.SELECTOR_SUBTITLES_BUTTON);
        if (foundBtn) {
          if (this.controlsObserver) {
            this.controlsObserver.disconnect();
            this.controlsObserver = null;
          }
          this.bindCCButtonObserver(foundBtn);
          this.syncCCState();
          this.updateGateState();
        }
      });
      this.controlsObserver.observe(chromeBottom, {
        childList: true,
        subtree: false
      });
    }
  }

  private bindCCButtonObserver(btn: HTMLElement): void {
    if (this.observedCCButton === btn && this.ccButtonObserver) {
      return;
    }
    this.observedCCButton = btn;
    if (this.ccButtonObserver) {
      this.ccButtonObserver.disconnect();
    }
    this.ccButtonObserver = new MutationObserver(() => {
      this.syncCCState();
      this.updateGateState();
    });
    this.ccButtonObserver.observe(btn, {
      attributes: true,
      attributeFilter: [SUBTITLE_CONSTANTS.ATTR_ARIA_PRESSED]
    });
  }

  public syncCCState(): void {
    if (this.observedCCButton) {
      if (this.observedCCButton.isConnected) {
        const pressed = this.observedCCButton.getAttribute(SUBTITLE_CONSTANTS.ATTR_ARIA_PRESSED);
        if (pressed !== null) {
          this.isCCActive = pressed === SUBTITLE_CONSTANTS.ATTR_ARIA_PRESSED_TRUE;
          return;
        }
      } else {
        // 幽灵节点失效处理
        if (this.ccButtonObserver) {
          this.ccButtonObserver.disconnect();
          this.ccButtonObserver = null;
        }
        this.observedCCButton = null;
      }
    }

    const player = ReactiveDOMRegistry.getInstance().getPlayerContainer() as YouTubePlayerElement | null;
    if (player && typeof player.isSubtitlesOn === "function") {
      try {
        this.isCCActive = Boolean(player.isSubtitlesOn());
        return;
      } catch {
        // Safe catch for internal player reflection
      }
    }
    this.isCCActive = false;
  }

  public updateGateState(): void {
    const { sessionOffsetMs } = this.offsetProvider();
    const shouldActivate = this.isPlaying && this.isCCActive && sessionOffsetMs !== 0;

    if (shouldActivate) {
      this.startLoop();
    } else {
      this.stopLoop();
      if (sessionOffsetMs === 0 || !this.isCCActive) {
        this.restoreNativeCaptions();
        this.clearOverlayText();
      }
    }
  }

  private startLoop(): void {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    const loop = (): void => {
      if (!this.isLoopRunning) return;
      this.renderCurrentFrame();
      if (this.isLoopRunning) {
        this.animFrameId = requestAnimationFrame(loop);
      }
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

  private hideNativeCaptions(): void {
    if (this.isNativeCaptionsHidden) return;
    const container = (this.containerEl && this.containerEl.isConnected ? this.containerEl : null) || ReactiveDOMRegistry.getInstance().getPlayerContainer();
    if (container) {
      container.classList.add(SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN);
      this.isNativeCaptionsHidden = true;
    }
  }

  private restoreNativeCaptions(): void {
    if (!this.isNativeCaptionsHidden) return;
    const container = (this.containerEl && this.containerEl.isConnected ? this.containerEl : null) || ReactiveDOMRegistry.getInstance().getPlayerContainer();
    if (container) {
      container.classList.remove(SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN);
      this.isNativeCaptionsHidden = false;
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
    const { sessionOffsetMs, effectiveOffsetMs } = this.offsetProvider();

    if (!this.videoEl || !this.isCCActive || sessionOffsetMs === 0) {
      this.stopLoop();
      this.restoreNativeCaptions();
      this.clearOverlayText();
      return;
    }

    if (!this.overlayEl || !this.textEl || !this.overlayEl.isConnected) {
      this.ensureOverlay();
      if (!this.textEl) return;
    }

    this.hideNativeCaptions();

    const currentMs = this.videoEl.currentTime * 1000;
    const targetQueryMs = currentMs - effectiveOffsetMs;

    const targetText = this.timeline.getActiveCueText(targetQueryMs);

    if (force || targetText !== this.lastRenderedText || effectiveOffsetMs !== this.lastEffectiveOffsetMs) {
      if (targetText.length > 0) {
        this.textEl.textContent = targetText;
        if (this.lastRenderedText.length === 0) {
          this.textEl.style.display = "inline-block";
        }
      } else {
        if (this.lastRenderedText.length > 0) {
          this.textEl.style.display = "none";
          this.textEl.textContent = "";
        }
      }
      this.lastRenderedText = targetText;
      this.lastEffectiveOffsetMs = effectiveOffsetMs;
    }
  }

  private injectStyles(): void {
    const css = `
      #${SUBTITLE_CONSTANTS.OVERLAY_ID} {
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
      .ytp-autohide #${SUBTITLE_CONSTANTS.OVERLAY_ID} {
        bottom: 6%;
      }
      .${SUBTITLE_CONSTANTS.BOX_CLASS} {
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
      .${SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN} .ytp-caption-window-bottom,
      .${SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN} .caption-window,
      .${SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN} .ytp-caption-window-rollup {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    StyleEngine.inject(SUBTITLE_CONSTANTS.STYLE_ID, css);
  }

  private ensureOverlay(): HTMLElement | null {
    if (this.overlayEl && this.overlayEl.isConnected) {
      return this.overlayEl;
    }

    const container =
      (this.containerEl && this.containerEl.isConnected ? this.containerEl : null) ||
      ReactiveDOMRegistry.getInstance().getPlayerContainer();
    if (!container) return null;

    let overlay = document.getElementById(SUBTITLE_CONSTANTS.OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = SUBTITLE_CONSTANTS.OVERLAY_ID;

      const box = document.createElement("span");
      box.className = SUBTITLE_CONSTANTS.BOX_CLASS;
      overlay.appendChild(box);

      this.textEl = box;
    } else {
      this.textEl = overlay.querySelector<HTMLElement>(`.${SUBTITLE_CONSTANTS.BOX_CLASS}`);
    }

    container.appendChild(overlay);
    this.overlayEl = overlay;
    return overlay;
  }

  public deactivate(): void {
    this.stopLoop();
    this.restoreNativeCaptions();
    this.clearOverlayText();
  }

  public activate(forceRender: boolean = true): void {
    this.syncCCState();
    this.updateGateState();
    if (forceRender) {
      this.renderCurrentFrame(true);
    }
  }

  public destroy(): void {
    this.stopLoop();
    this.restoreNativeCaptions();
    this.detachVideoListeners();
    this.detachObservers();

    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
    this.textEl = null;
    this.videoEl = null;
    this.containerEl = null;
    this.lastRenderedText = "";
    this.lastEffectiveOffsetMs = 0;
    this.isCCActive = false;
    this.isPlaying = false;
    this.isNativeCaptionsHidden = false;

    StyleEngine.remove(SUBTITLE_CONSTANTS.STYLE_ID);
  }
}
