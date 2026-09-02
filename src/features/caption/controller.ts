import { SUBTITLE_CONSTANTS } from "./constants";
import { TimedTextInterceptor } from "./interceptor";
import { SubtitleTimeline } from "./timeline";
import { CaptionOverlayRenderer } from "./renderer";
import { CaptionSettingsView } from "./settings-view";
import { ShortcutDispatcher } from "../../core/shortcuts";
import { PlaybackHUD } from "../../core/hud";
import { StorageUtil } from "../../core/storage";
import { Locale } from "../../i18n";
import { PlayerController, type PlayerState } from "../player";
import type { CaptionOffsetState } from "./types";
import type { LanguageDefinition } from "../../types";

export class CaptionController {
  private static instance: CaptionController | null = null;

  private readonly timeline: SubtitleTimeline;
  private readonly renderer: CaptionOverlayRenderer;
  private readonly interceptor: TimedTextInterceptor;

  private globalDefaultOffsetMs: number = SUBTITLE_CONSTANTS.DEFAULT_OFFSET_MS;
  private sessionOffsetMs: number = 0;
  private shortcutCleanups: Array<() => void> = [];
  private playerReadyCleanup: (() => void) | null = null;
  private playerStateCleanup: (() => void) | null = null;
  private navigateHandler: (() => void) | null = null;
  private isInitialized: boolean = false;

  private constructor() {
    this.timeline = new SubtitleTimeline();

    this.renderer = new CaptionOverlayRenderer(
      () => ({
        sessionOffsetMs: this.sessionOffsetMs,
        effectiveOffsetMs: this.getEffectiveOffsetMs()
      }),
      this.timeline
    );

    this.interceptor = new TimedTextInterceptor(
      () => this.globalDefaultOffsetMs,
      (key: string, rawText: string) => {
        this.timeline.ingest(key, rawText);
        if (this.sessionOffsetMs !== 0) {
          this.renderer.renderCurrentFrame(true);
        }
      }
    );
  }

  public static getInstance(): CaptionController {
    if (!CaptionController.instance) {
      CaptionController.instance = new CaptionController();
    }
    return CaptionController.instance;
  }

  public init(): void {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    this.globalDefaultOffsetMs = StorageUtil.getValue<number>(
      SUBTITLE_CONSTANTS.STORAGE_KEY_OFFSET,
      SUBTITLE_CONSTANTS.DEFAULT_OFFSET_MS
    );
    this.sessionOffsetMs = 0;

    this.interceptor.install();
    this.renderer.init();

    this.bindPlayerEvents();
    this.bindShortcuts();
    this.bindNavigation();
  }

  private bindPlayerEvents(): void {
    const playerCtrl = PlayerController.getInstance();

    this.playerReadyCleanup = playerCtrl.onReady((state: PlayerState) => {
      this.renderer.attachVideo(state.videoElement);
    });

    this.playerStateCleanup = playerCtrl.onStateChange((state: PlayerState) => {
      this.renderer.attachVideo(state.videoElement);
    });
  }

  public getState(): CaptionOffsetState {
    return {
      globalDefaultOffsetMs: this.globalDefaultOffsetMs,
      sessionOffsetMs: this.sessionOffsetMs,
      effectiveOffsetMs: this.getEffectiveOffsetMs()
    };
  }

  public getEffectiveOffsetMs(): number {
    return this.globalDefaultOffsetMs + this.sessionOffsetMs;
  }

  public advance(stepMs: number = SUBTITLE_CONSTANTS.STEP_OFFSET_MS): void {
    const current = this.getEffectiveOffsetMs();
    const next = Math.max(SUBTITLE_CONSTANTS.MIN_OFFSET_MS, current - stepMs);
    this.sessionOffsetMs = next - this.globalDefaultOffsetMs;
    this.applyChange();
  }

  public delay(stepMs: number = SUBTITLE_CONSTANTS.STEP_OFFSET_MS): void {
    const current = this.getEffectiveOffsetMs();
    const next = Math.min(SUBTITLE_CONSTANTS.MAX_OFFSET_MS, current + stepMs);
    this.sessionOffsetMs = next - this.globalDefaultOffsetMs;
    this.applyChange();
  }

  public reset(): void {
    this.sessionOffsetMs = 0;
    this.applyChange(true);
  }

  public getGlobalDefaultOffsetMs(): number {
    return this.globalDefaultOffsetMs;
  }

  public setGlobalDefaultOffset(offsetMs: number): void {
    const clamped = Math.max(
      SUBTITLE_CONSTANTS.MIN_OFFSET_MS,
      Math.min(SUBTITLE_CONSTANTS.MAX_OFFSET_MS, offsetMs)
    );
    this.globalDefaultOffsetMs = clamped;
    StorageUtil.setValue(SUBTITLE_CONSTANTS.STORAGE_KEY_OFFSET, clamped);
    this.applyChange();
  }

  public renderSettingsConfig(container: HTMLElement, language: LanguageDefinition): void {
    CaptionSettingsView.render(container, language, this);
  }

  private applyChange(isReset: boolean = false): void {
    if (this.sessionOffsetMs === 0) {
      this.renderer.deactivate();
    } else {
      this.renderer.activate(true);
    }
    this.showHUD(isReset);
  }

  private formatOffsetString(offsetMs: number): string {
    const sec = (offsetMs / 1000).toFixed(2);
    const sign = offsetMs > 0 ? "+" : "";
    return `${sign}${sec}s`;
  }

  private showHUD(isReset: boolean = false): void {
    const effective = this.getEffectiveOffsetMs();
    const formatted = this.formatOffsetString(effective);
    const label = Locale.t("subtitle_offset_label") || "字幕时间轴";

    let message = `${label}: ${formatted}`;
    if (isReset && effective === 0) {
      const resetSuffix = Locale.t("subtitle_offset_reset_suffix") || "(已重置)";
      message = `${label}: ${formatted} ${resetSuffix}`;
    }

    PlaybackHUD.show(message);
  }

  private bindShortcuts(): void {
    this.clearShortcuts();

    const unbindAdvance = ShortcutDispatcher.register({
      key: SUBTITLE_CONSTANTS.SHORTCUT_ADVANCE_KEY,
      altKey: true,
      description: "Advance subtitles timing (-0.25s)",
      handler: () => {
        this.advance();
      }
    });

    const unbindDelay = ShortcutDispatcher.register({
      key: SUBTITLE_CONSTANTS.SHORTCUT_DELAY_KEY,
      altKey: true,
      description: "Delay subtitles timing (+0.25s)",
      handler: () => {
        this.delay();
      }
    });

    const unbindReset = ShortcutDispatcher.register({
      key: SUBTITLE_CONSTANTS.SHORTCUT_RESET_KEY,
      altKey: true,
      description: "Reset subtitles timing to default",
      handler: () => {
        this.reset();
      }
    });

    this.shortcutCleanups.push(unbindAdvance, unbindDelay, unbindReset);
  }

  private clearShortcuts(): void {
    this.shortcutCleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (err) {
        console.error("[CaptionController] Shortcut cleanup error:", err);
      }
    });
    this.shortcutCleanups = [];
  }

  private bindNavigation(): void {
    if (!this.navigateHandler) {
      this.navigateHandler = () => {
        this.sessionOffsetMs = 0;
        this.timeline.clearCurrent();
        this.renderer.deactivate();
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler, { passive: true });
    }
  }

  private unbindNavigation(): void {
    if (this.navigateHandler) {
      window.removeEventListener("yt-navigate-finish", this.navigateHandler);
      this.navigateHandler = null;
    }
  }

  public destroy(): void {
    this.clearShortcuts();
    this.unbindNavigation();
    if (this.playerReadyCleanup) {
      this.playerReadyCleanup();
      this.playerReadyCleanup = null;
    }
    if (this.playerStateCleanup) {
      this.playerStateCleanup();
      this.playerStateCleanup = null;
    }
    this.renderer.destroy();
    this.interceptor.destroy();
    this.timeline.clear();
    this.isInitialized = false;
  }
}
