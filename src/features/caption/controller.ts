import { SUBTITLE_CONSTANTS } from "./constants";
import { TimedTextInterceptor } from "./interceptor";
import { CaptionStore } from "./store";
import { CaptionRenderer } from "./renderer";
import { ShortcutDispatcher } from "../../core/shortcuts";
import { PlaybackHUD } from "../../core/hud";
import { StorageUtil } from "../../core/storage";
import { Locale } from "../../i18n";
import type { CaptionOffsetState } from "./types";
import type { LanguageDefinition } from "../../types";

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
    CaptionRenderer.getInstance().init(() => this.getEffectiveOffsetMs());
    CaptionStore.getInstance().loadCurrentVideoCues();

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
    const configWrapper = document.createElement("div");
    configWrapper.className = "yt-subtitle-offset-config";

    const titleRow = document.createElement("div");
    titleRow.className = "yt-subtitle-offset-header";

    const titleEl = document.createElement("span");
    titleEl.className = "yt-subtitle-offset-title";
    titleEl.textContent = language.content.subtitle_global_offset_title || "全局默认基准偏移";

    const badgeEl = document.createElement("span");
    badgeEl.className = "yt-subtitle-offset-badge";
    badgeEl.textContent = "Alt+[ / Alt+] / Alt+\\";

    titleRow.appendChild(titleEl);
    titleRow.appendChild(badgeEl);
    configWrapper.appendChild(titleRow);

    const controlsRow = document.createElement("div");
    controlsRow.className = "yt-subtitle-offset-controls";

    const btnAdvance = document.createElement("button");
    btnAdvance.type = "button";
    btnAdvance.className = "yt-offset-btn yt-offset-btn-advance";
    btnAdvance.textContent = "-0.25s";

    const inputWrap = document.createElement("div");
    inputWrap.className = "yt-offset-input-wrap";

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.className = "yt-offset-input";
    numberInput.step = "0.05";
    numberInput.min = String(SUBTITLE_CONSTANTS.MIN_OFFSET_MS / 1000);
    numberInput.max = String(SUBTITLE_CONSTANTS.MAX_OFFSET_MS / 1000);
    numberInput.value = (this.getGlobalDefaultOffsetMs() / 1000).toFixed(2);

    const unitEl = document.createElement("span");
    unitEl.className = "yt-offset-unit";
    unitEl.textContent = language.content.subtitle_offset_unit || "秒";

    inputWrap.appendChild(numberInput);
    inputWrap.appendChild(unitEl);

    const btnDelay = document.createElement("button");
    btnDelay.type = "button";
    btnDelay.className = "yt-offset-btn yt-offset-btn-delay";
    btnDelay.textContent = "+0.25s";

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "yt-offset-btn yt-offset-btn-reset";
    btnReset.textContent = language.content.subtitle_offset_reset_btn || "重置为 0s";

    const updateInputValue = (offsetMs: number) => {
      numberInput.value = (offsetMs / 1000).toFixed(2);
    };

    numberInput.addEventListener("input", () => {
      const valSec = parseFloat(numberInput.value);
      if (!isNaN(valSec)) {
        const offsetMs = Math.round(valSec * 1000);
        this.setGlobalDefaultOffset(offsetMs);
      }
    });

    btnAdvance.addEventListener("click", () => {
      const current = this.getGlobalDefaultOffsetMs();
      const next = Math.max(SUBTITLE_CONSTANTS.MIN_OFFSET_MS, current - SUBTITLE_CONSTANTS.STEP_OFFSET_MS);
      this.setGlobalDefaultOffset(next);
      updateInputValue(next);
    });

    btnDelay.addEventListener("click", () => {
      const current = this.getGlobalDefaultOffsetMs();
      const next = Math.min(SUBTITLE_CONSTANTS.MAX_OFFSET_MS, current + SUBTITLE_CONSTANTS.STEP_OFFSET_MS);
      this.setGlobalDefaultOffset(next);
      updateInputValue(next);
    });

    btnReset.addEventListener("click", () => {
      this.setGlobalDefaultOffset(0);
      updateInputValue(0);
    });

    controlsRow.appendChild(btnAdvance);
    controlsRow.appendChild(inputWrap);
    controlsRow.appendChild(btnDelay);
    controlsRow.appendChild(btnReset);
    configWrapper.appendChild(controlsRow);

    const descEl = document.createElement("div");
    descEl.className = "yt-subtitle-offset-desc";
    descEl.textContent = language.content.subtitle_global_offset_desc || "新打开的视频将以此基准开始。播放中按 Alt+[ / Alt+] 仅对当前视频临时生效，切视频自动复位。";
    configWrapper.appendChild(descEl);

    container.appendChild(configWrapper);
  }

  private applyChange(isReset: boolean = false): void {
    CaptionRenderer.getInstance().renderCurrentFrame(true);
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
        CaptionStore.getInstance().clearCurrent();
        setTimeout(() => {
          CaptionStore.getInstance().loadCurrentVideoCues();
          CaptionRenderer.getInstance().renderCurrentFrame(true);
        }, 300);
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
    CaptionRenderer.getInstance().destroy();
    CaptionStore.getInstance().clearCurrent();
    TimedTextInterceptor.destroy();
    this.isInitialized = false;
  }
}
