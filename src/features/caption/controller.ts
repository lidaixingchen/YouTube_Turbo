import { SUBTITLE_CONSTANTS } from "./constants";
import { TimedTextInterceptor } from "./interceptor";
import { CaptionReloader } from "./reloader";
import { ShortcutDispatcher } from "../../core/shortcuts";
import { PlaybackHUD } from "../../core/hud";
import { StorageUtil } from "../../core/storage";
import { Locale } from "../../i18n";
import type { CaptionOffsetState } from "./types";

export class CaptionController {
  private static instance: CaptionController | null = null;
  private globalDefaultOffsetMs: number = SUBTITLE_CONSTANTS.DEFAULT_OFFSET_MS;
  private sessionOffsetMs: number = 0;
  private shortcutCleanups: Array<() => void> = [];
  private navigateHandler: (() => void) | null = null;
  private isInitialized = false;

  public static getInstance(): CaptionController {
    if (!this.instance) {
      this.instance = new CaptionController();
    }
    return this.instance;
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

    TimedTextInterceptor.install(() => this.getEffectiveOffsetMs());

    this.bindShortcuts();
    this.bindNavigation();
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

  public setGlobalDefaultOffset(offsetMs: number): void {
    const clamped = Math.max(
      SUBTITLE_CONSTANTS.MIN_OFFSET_MS,
      Math.min(SUBTITLE_CONSTANTS.MAX_OFFSET_MS, offsetMs)
    );
    this.globalDefaultOffsetMs = clamped;
    StorageUtil.setValue(SUBTITLE_CONSTANTS.STORAGE_KEY_OFFSET, clamped);
    this.applyChange();
  }

  private applyChange(isReset: boolean = false): void {
    CaptionReloader.reload();
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
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler);
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
    TimedTextInterceptor.destroy();
    this.isInitialized = false;
  }
}
