import { SUBTITLE_CONSTANTS } from "./constants";
import type { LanguageDefinition } from "../../types";

export interface CaptionOffsetController {
  getGlobalDefaultOffsetMs(): number;
  setGlobalDefaultOffset(offsetMs: number): void;
}

export class CaptionSettingsView {
  private static readonly INPUT_STEP_SEC = "0.05";

  public static render(
    container: HTMLElement,
    language: LanguageDefinition,
    controller: CaptionOffsetController
  ): void {
    const configWrapper = document.createElement("div");
    configWrapper.className = "yt-subtitle-offset-config";

    const titleRow = document.createElement("div");
    titleRow.className = "yt-subtitle-offset-header";

    const titleEl = document.createElement("span");
    titleEl.className = "yt-subtitle-offset-title";
    titleEl.textContent = language.content.subtitle_global_offset_title || "全局默认基准偏移";

    const badgeEl = document.createElement("kbd");
    badgeEl.className = "yt-turbo-kbd";
    badgeEl.textContent = "Alt+[ / ] / \\";

    titleRow.appendChild(titleEl);
    titleRow.appendChild(badgeEl);
    configWrapper.appendChild(titleRow);

    const controlsRow = document.createElement("div");
    controlsRow.className = "yt-subtitle-offset-controls";

    const stepSecStr = (SUBTITLE_CONSTANTS.STEP_OFFSET_MS / 1000).toFixed(2);

    const btnAdvance = document.createElement("button");
    btnAdvance.type = "button";
    btnAdvance.className = "yt-offset-btn yt-offset-btn-advance";
    btnAdvance.textContent = `-${stepSecStr}s`;

    const inputWrap = document.createElement("div");
    inputWrap.className = "yt-offset-input-wrap";

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.className = "yt-offset-input";
    numberInput.step = CaptionSettingsView.INPUT_STEP_SEC;
    numberInput.min = String(SUBTITLE_CONSTANTS.MIN_OFFSET_MS / 1000);
    numberInput.max = String(SUBTITLE_CONSTANTS.MAX_OFFSET_MS / 1000);
    numberInput.value = (controller.getGlobalDefaultOffsetMs() / 1000).toFixed(2);

    const unitEl = document.createElement("span");
    unitEl.className = "yt-offset-unit";
    unitEl.textContent = language.content.subtitle_offset_unit || "秒";

    inputWrap.appendChild(numberInput);
    inputWrap.appendChild(unitEl);

    const btnDelay = document.createElement("button");
    btnDelay.type = "button";
    btnDelay.className = "yt-offset-btn yt-offset-btn-delay";
    btnDelay.textContent = `+${stepSecStr}s`;

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "yt-offset-btn yt-offset-btn-reset";
    btnReset.textContent = language.content.subtitle_offset_reset_btn || "重置为 0s";

    const updateInputValue = (offsetMs: number): void => {
      numberInput.value = (offsetMs / 1000).toFixed(2);
    };

    numberInput.addEventListener("input", (): void => {
      const valSec = parseFloat(numberInput.value);
      if (Number.isFinite(valSec)) {
        const offsetMs = Math.round(valSec * 1000);
        controller.setGlobalDefaultOffset(offsetMs);
      }
    });

    btnAdvance.addEventListener("click", (): void => {
      const current = controller.getGlobalDefaultOffsetMs();
      const next = Math.max(SUBTITLE_CONSTANTS.MIN_OFFSET_MS, current - SUBTITLE_CONSTANTS.STEP_OFFSET_MS);
      controller.setGlobalDefaultOffset(next);
      updateInputValue(next);
    });

    btnDelay.addEventListener("click", (): void => {
      const current = controller.getGlobalDefaultOffsetMs();
      const next = Math.min(SUBTITLE_CONSTANTS.MAX_OFFSET_MS, current + SUBTITLE_CONSTANTS.STEP_OFFSET_MS);
      controller.setGlobalDefaultOffset(next);
      updateInputValue(next);
    });

    btnReset.addEventListener("click", (): void => {
      controller.setGlobalDefaultOffset(0);
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
}
