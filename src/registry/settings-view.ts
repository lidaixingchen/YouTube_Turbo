import { StyleEngine } from "../core/style-engine";
import { LangueUtil } from "../i18n";
import { Modal } from "../ui/modal/modal";
import { FeatureRegistry } from "./feature-registry";
import type { StepperConfigField } from "../types";
import settingsCss from "./settings.css?raw";

const SETTINGS_STYLE_ID = "yt-improvements-settings-style";
const DEFAULT_SCALE = 1;
const DEFAULT_PRECISION = 0;
const STYLE_OPACITY_ENABLED = "1";
const STYLE_OPACITY_DISABLED = "0.5";

export class SettingsModalView {
  public static show(): void {
    StyleEngine.inject(SETTINGS_STYLE_ID, settingsCss);

    const language = LangueUtil.getLanguage();
    const registry = FeatureRegistry.getInstance();
    const descriptors = registry.getAllDescriptors();
    const initialStates: Record<string, boolean> = { ...registry.getAllStates() };

    const container = document.createElement("div");
    container.className = "yt-settings-form";

    descriptors.forEach((feature) => {
      const row = document.createElement("div");
      row.className = "row-item";

      const header = document.createElement("div");
      header.className = "setting-header";

      const infoEl = document.createElement("div");
      infoEl.className = "setting-info";

      const titleText =
        (feature.titleI18nKey && language.content[feature.titleI18nKey]) ||
        language.content[feature.i18nKey] ||
        feature.i18nKey;

      const titleEl = document.createElement("div");
      titleEl.className = "setting-title";
      titleEl.textContent = titleText;
      infoEl.appendChild(titleEl);

      const descText = feature.descI18nKey && language.content[feature.descI18nKey];
      if (descText) {
        const descEl = document.createElement("div");
        descEl.className = "setting-desc";
        descEl.textContent = descText;
        infoEl.appendChild(descEl);
      }

      const switchEl = document.createElement("div");
      switchEl.className = "setting-switch";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `yt_feat_${feature.id}`;
      input.className = "switch-input";
      input.setAttribute("aria-label", titleText);
      const isFeatureEnabled = registry.isEnabled(feature.id);
      input.checked = isFeatureEnabled;

      const track = document.createElement("span");
      track.className = "switch-track";

      switchEl.appendChild(input);
      switchEl.appendChild(track);
      header.appendChild(infoEl);
      header.appendChild(switchEl);
      row.appendChild(header);

      let extraContainer: HTMLElement | null = null;
      if (feature.extraFields && feature.extraFields.length > 0) {
        extraContainer = document.createElement("div");
        extraContainer.className = "setting-extra-config";
        this.updateFieldAvailability(extraContainer, isFeatureEnabled);

        feature.extraFields.forEach((field) => {
          if (field.type === "stepper") {
            extraContainer?.appendChild(this.renderStepperField(field, language));
          }
        });
        row.appendChild(extraContainer);
      }

      input.addEventListener("change", async (e: Event) => {
        const isChecked = (e.target as HTMLInputElement).checked;
        await registry.setEnabled(feature.id, isChecked);
        if (extraContainer) {
          this.updateFieldAvailability(extraContainer, isChecked);
        }
      });

      container.appendChild(row);
    });

    Modal.open({
      size: "medium",
      title: language.content.function_setting_title || "Setting",
      content: container,
      direction: language.direction,
      onClose: () => {
        const currentStates = registry.getAllStates();
        const shouldReload = descriptors.some(
          (desc) => desc.requiresReload && initialStates[desc.id] !== currentStates[desc.id]
        );
        if (shouldReload && typeof location !== "undefined") {
          location.reload();
        }
      }
    });
  }

  private static updateFieldAvailability(container: HTMLElement, enabled: boolean): void {
    container.style.opacity = enabled ? STYLE_OPACITY_ENABLED : STYLE_OPACITY_DISABLED;
    container.style.pointerEvents = enabled ? "auto" : "none";
  }

  private static renderStepperField(
    field: StepperConfigField,
    language: ReturnType<typeof LangueUtil.getLanguage>
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "yt-subtitle-offset-config yt-stepper-config";

    const titleRow = document.createElement("div");
    titleRow.className = "yt-subtitle-offset-header yt-stepper-header";

    const titleEl = document.createElement("span");
    titleEl.className = "yt-subtitle-offset-title yt-stepper-title";
    titleEl.textContent = language.content[field.titleI18nKey] || field.titleI18nKey;
    titleRow.appendChild(titleEl);

    if (field.badgeText) {
      const badgeEl = document.createElement("kbd");
      badgeEl.className = "yt-turbo-kbd";
      badgeEl.textContent = field.badgeText;
      titleRow.appendChild(badgeEl);
    }
    wrapper.appendChild(titleRow);

    const controlsRow = document.createElement("div");
    controlsRow.className = "yt-subtitle-offset-controls yt-stepper-controls";

    const scale = field.scale ?? DEFAULT_SCALE;
    const precision = field.precision ?? DEFAULT_PRECISION;
    const stepStr = (field.step / scale).toFixed(precision);
    const unitStr = (field.unitI18nKey && language.content[field.unitI18nKey]) || field.fallbackUnit || "";

    const btnAdvance = document.createElement("button");
    btnAdvance.type = "button";
    btnAdvance.className = "yt-offset-btn yt-offset-btn-advance yt-stepper-btn yt-stepper-btn-advance";
    btnAdvance.textContent = `-${stepStr}${unitStr}`;

    const inputWrap = document.createElement("div");
    inputWrap.className = "yt-offset-input-wrap yt-stepper-input-wrap";

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.className = "yt-offset-input yt-stepper-input";
    numberInput.step = String(field.step / scale);
    numberInput.min = String(field.min / scale);
    numberInput.max = String(field.max / scale);
    numberInput.value = (field.getValue() / scale).toFixed(precision);

    const unitEl = document.createElement("span");
    unitEl.className = "yt-offset-unit yt-stepper-unit";
    unitEl.textContent = unitStr;

    inputWrap.appendChild(numberInput);
    inputWrap.appendChild(unitEl);

    const btnDelay = document.createElement("button");
    btnDelay.type = "button";
    btnDelay.className = "yt-offset-btn yt-offset-btn-delay yt-stepper-btn yt-stepper-btn-delay";
    btnDelay.textContent = `+${stepStr}${unitStr}`;

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "yt-offset-btn yt-offset-btn-reset yt-stepper-btn yt-stepper-btn-reset";
    btnReset.textContent =
      (field.resetI18nKey && language.content[field.resetI18nKey]) ||
      language.content.action_reset ||
      "Reset";

    const clamp = (val: number): number => Math.max(field.min, Math.min(field.max, val));

    const syncInput = (value: number): void => {
      numberInput.value = (value / scale).toFixed(precision);
    };

    numberInput.addEventListener("input", (): void => {
      const parsed = parseFloat(numberInput.value);
      if (Number.isFinite(parsed)) {
        const raw = Math.round(parsed * scale);
        const clamped = clamp(raw);
        field.setValue(clamped);
      }
    });

    numberInput.addEventListener("blur", (): void => {
      syncInput(field.getValue());
    });

    btnAdvance.addEventListener("click", (): void => {
      const next = clamp(field.getValue() - field.step);
      field.setValue(next);
      syncInput(next);
    });

    btnDelay.addEventListener("click", (): void => {
      const next = clamp(field.getValue() + field.step);
      field.setValue(next);
      syncInput(next);
    });

    btnReset.addEventListener("click", (): void => {
      const defaultTarget = clamp(field.defaultValue ?? 0);
      field.setValue(defaultTarget);
      syncInput(defaultTarget);
    });

    controlsRow.appendChild(btnAdvance);
    controlsRow.appendChild(inputWrap);
    controlsRow.appendChild(btnDelay);
    controlsRow.appendChild(btnReset);
    wrapper.appendChild(controlsRow);

    if (field.descI18nKey && language.content[field.descI18nKey]) {
      const descEl = document.createElement("div");
      descEl.className = "yt-subtitle-offset-desc yt-stepper-desc";
      descEl.textContent = language.content[field.descI18nKey];
      wrapper.appendChild(descEl);
    }

    return wrapper;
  }
}
