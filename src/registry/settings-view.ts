import { StyleEngine } from "../core/style-engine";
import { LangueUtil } from "../i18n";
import { Modal } from "../ui/modal/modal";
import { FeatureRegistry } from "./feature-registry";
import { FEATURE_REGISTRY_CONSTANTS } from "./constants";
import type { FeatureStateSnapshot } from "./types";
import type { FeatureDescriptor, StepperConfigField } from "../types";
import settingsCss from "./settings.css?raw";

interface FeatureControls {
  input: HTMLInputElement;
  statusEl: HTMLElement;
  extraContainer: HTMLElement | null;
  stepperControls: StepperFieldControl[];
}

interface StepperFieldControl {
  element: HTMLElement;
  syncValue: () => void;
}

export class SettingsModalView {
  private static isOpen: boolean = false;

  public static show(): void {
    if (this.isOpen) {
      return;
    }
    this.isOpen = true;

    StyleEngine.inject(FEATURE_REGISTRY_CONSTANTS.STYLES.SETTINGS_STYLE_ID, settingsCss);

    const language = LangueUtil.getLanguage();
    const registry = FeatureRegistry.getInstance();
    if (!registry.hasInitialized) {
      this.showInitializationGate(registry, language);
      return;
    }
    const descriptors = registry.getAllDescriptors();
    const initialStates: Record<string, boolean> = { ...registry.getAllStates() };

    const container = document.createElement("div");
    container.className = "yt-settings-form";

    const isSessionMode = descriptors.some(
      (desc: FeatureDescriptor): boolean => registry.getState(desc.id).persistence === "session"
    );
    if (isSessionMode) {
      const notice = document.createElement("div");
      notice.className = "yt-settings-notice yt-settings-notice-session";
      notice.textContent = language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.NOTICE_SESSION_ONLY] || "";
      container.appendChild(notice);
    }

    const featureControlsMap = new Map<string, FeatureControls>();
    let isDisposed: boolean = false;

    descriptors.forEach((feature: FeatureDescriptor): void => {
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

      const statusEl = document.createElement("div");
      statusEl.className = "setting-status";
      statusEl.setAttribute("role", "status");
      statusEl.setAttribute("aria-live", "polite");
      infoEl.appendChild(statusEl);

      const switchEl = document.createElement("div");
      switchEl.className = "setting-switch";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `yt_feat_${feature.id}`;
      input.className = "switch-input";
      input.setAttribute("role", "switch");
      input.setAttribute("aria-label", titleText);
      input.checked = registry.isEnabled(feature.id);

      const track = document.createElement("span");
      track.className = "switch-track";

      switchEl.appendChild(input);
      switchEl.appendChild(track);
      header.appendChild(infoEl);
      header.appendChild(switchEl);
      row.appendChild(header);

      let extraContainer: HTMLElement | null = null;
      const stepperControls: StepperFieldControl[] = [];
      if (feature.extraFields && feature.extraFields.length > 0) {
        extraContainer = document.createElement("div");
        extraContainer.className = "setting-extra-config";

        feature.extraFields.forEach((field: StepperConfigField): void => {
          if (field.type === "stepper") {
            const stepperControl: StepperFieldControl = SettingsModalView.renderStepperField(field, language);
            extraContainer?.appendChild(stepperControl.element);
            stepperControls.push(stepperControl);
          }
        });
        SettingsModalView.updateFieldAvailability(extraContainer, false);
        row.appendChild(extraContainer);
      }

      featureControlsMap.set(feature.id, {
        input,
        statusEl,
        extraContainer,
        stepperControls
      });

      input.addEventListener("change", async (e: Event): Promise<void> => {
        const isChecked = (e.target as HTMLInputElement).checked;
        try {
          await registry.setEnabled(feature.id, isChecked);
        } catch {
          if (isDisposed) return;
          const currentSnapshot = registry.getState(feature.id);
          input.checked = currentSnapshot.enabled;
        }
      });

      container.appendChild(row);
    });

    const updateFeatureRow = (snapshot: FeatureStateSnapshot): void => {
      const controls = featureControlsMap.get(snapshot.id);
      if (!controls) return;
      const { input, statusEl, extraContainer } = controls;

      input.checked = snapshot.enabled;
      input.disabled = snapshot.runtime === "reload-required";

      if (snapshot.runtime === "starting" || snapshot.runtime === "stopping") {
        input.setAttribute("aria-busy", "true");
      } else {
        input.removeAttribute("aria-busy");
      }

      statusEl.textContent = "";
      statusEl.className = "setting-status";

      if (snapshot.runtime === "starting") {
        statusEl.classList.add("setting-status-starting");
        statusEl.textContent =
          language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.STATUS_STARTING] || "";
      } else if (snapshot.runtime === "stopping") {
        statusEl.classList.add("setting-status-stopping");
        statusEl.textContent =
          language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.STATUS_STOPPING] || "";
      } else if (snapshot.runtime === "reload-required") {
        statusEl.classList.add("setting-status-reload-required");
        const textNode = document.createElement("span");
        textNode.textContent =
          language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.STATUS_RELOAD_REQUIRED] || "";
        statusEl.appendChild(textNode);

        const reloadBtn = document.createElement("button");
        reloadBtn.type = "button";
        reloadBtn.className = "yt-settings-btn-action";
        reloadBtn.textContent =
          language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ACTION_RELOAD] || "";
        reloadBtn.addEventListener("click", (): void => {
          if (typeof location !== "undefined") {
            location.reload();
          }
        });
        statusEl.appendChild(reloadBtn);
      } else if (snapshot.runtime === "error" || snapshot.error?.stage === "storage") {
        statusEl.classList.add("setting-status-error");
        const textNode = document.createElement("span");
        const errorLabel =
          language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.STATUS_ERROR] || "";
        let stageDetail = "";
        if (snapshot.error) {
          const stageKeyMap: Record<string, string> = {
            storage: FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ERROR_STAGE_STORAGE,
            setup: FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ERROR_STAGE_SETUP,
            teardown: FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ERROR_STAGE_TEARDOWN,
            cleanup: FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ERROR_STAGE_CLEANUP
          };
          const stageKey = stageKeyMap[snapshot.error.stage];
          stageDetail = (stageKey && language.content[stageKey]) || snapshot.error.stage;
        }
        textNode.textContent = stageDetail ? `${errorLabel} (${stageDetail})` : errorLabel;
        statusEl.appendChild(textNode);

        if (snapshot.error?.stage !== "storage" && snapshot.error?.retryable) {
          const retryBtn = document.createElement("button");
          retryBtn.type = "button";
          retryBtn.className = "yt-settings-btn-action";
          retryBtn.textContent =
            language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ACTION_RETRY] || "";
          retryBtn.addEventListener("click", (): void => {
            registry.setEnabled(snapshot.id, snapshot.enabled).catch((): void => {
              // Handled by snapshot listener
            });
          });
          statusEl.appendChild(retryBtn);
        } else if (snapshot.error?.stage !== "storage") {
          const reloadBtn = document.createElement("button");
          reloadBtn.type = "button";
          reloadBtn.className = "yt-settings-btn-action";
          reloadBtn.textContent =
            language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ACTION_RELOAD] || "";
          reloadBtn.addEventListener("click", (): void => {
            if (typeof location !== "undefined") {
              location.reload();
            }
          });
          statusEl.appendChild(reloadBtn);
        }
      }

      if (extraContainer) {
        const isAvailable: boolean = snapshot.enabled && snapshot.runtime === "enabled";
        SettingsModalView.updateFieldAvailability(
          extraContainer,
          isAvailable
        );
        if (isAvailable) {
          controls.stepperControls.forEach((stepperControl: StepperFieldControl): void => {
            stepperControl.syncValue();
          });
        }
      }
    };

    const unsubscribe = registry.subscribe((snapshot: FeatureStateSnapshot): void => {
      if (isDisposed) return;
      updateFeatureRow(snapshot);
    });

    Modal.open({
      size: "medium",
      title: language.content.function_setting_title || "",
      content: container,
      direction: language.direction,
      onClose: (): void => {
        SettingsModalView.isOpen = false;
        isDisposed = true;
        unsubscribe();

        const isSession = descriptors.some(
          (desc: FeatureDescriptor): boolean => registry.getState(desc.id).persistence === "session"
        );
        if (!isSession) {
          const currentStates = registry.getAllStates();
          const shouldReload = descriptors.some(
            (desc: FeatureDescriptor): boolean => desc.requiresReload === true && initialStates[desc.id] !== currentStates[desc.id]
          );
          if (shouldReload && typeof location !== "undefined") {
            location.reload();
          }
        }
      }
    });
  }

  private static showInitializationGate(
    registry: FeatureRegistry,
    language: ReturnType<typeof LangueUtil.getLanguage>
  ): void {
    const container: HTMLDivElement = document.createElement("div");
    container.className = "yt-settings-form";

    const statusEl: HTMLDivElement = document.createElement("div");
    statusEl.className = "setting-status";
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");
    container.appendChild(statusEl);

    const retryButton: HTMLButtonElement = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "yt-settings-btn-action";
    retryButton.textContent = language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ACTION_RETRY] || "";
    container.appendChild(retryButton);

    let isDisposed: boolean = false;
    let isLoading: boolean = false;
    const modal: ReturnType<typeof Modal.open> = Modal.open({
      size: "medium",
      title: language.content.function_setting_title || "",
      content: container,
      direction: language.direction,
      onClose: (): void => {
        isDisposed = true;
        SettingsModalView.isOpen = false;
      }
    });

    const loadSettings = (): void => {
      if (isDisposed || isLoading) {
        return;
      }
      isLoading = true;
      retryButton.disabled = true;
      statusEl.setAttribute("aria-busy", "true");
      statusEl.className = "setting-status setting-status-starting";
      statusEl.textContent = language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.STATUS_LOADING_SETTINGS] || "";

      void registry.initAll().then((): void => {
        if (isDisposed) {
          return;
        }
        modal.close();
        SettingsModalView.show();
      }, (err: unknown): void => {
        if (isDisposed) {
          return;
        }
        console.error("[SettingsModalView] Feature initialization failed:", err);
        isLoading = false;
        retryButton.disabled = false;
        statusEl.removeAttribute("aria-busy");
        statusEl.className = "setting-status setting-status-error";
        statusEl.textContent = language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.STATUS_SETTINGS_LOAD_FAILED] || "";
      });
    };

    retryButton.addEventListener("click", loadSettings);
    loadSettings();
  }

  private static updateFieldAvailability(container: HTMLElement, available: boolean): void {
    container.classList.toggle("is-disabled", !available);
    const formControls = container.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button");
    formControls.forEach((el: HTMLInputElement | HTMLButtonElement): void => {
      el.disabled = !available;
    });
  }

  private static renderStepperField(
    field: StepperConfigField,
    language: ReturnType<typeof LangueUtil.getLanguage>
  ): StepperFieldControl {
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

    const scale = field.scale ?? FEATURE_REGISTRY_CONSTANTS.STEPPER.DEFAULT_SCALE;
    const precision = field.precision ?? FEATURE_REGISTRY_CONSTANTS.STEPPER.DEFAULT_PRECISION;
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
    numberInput.setAttribute("aria-label", language.content[field.titleI18nKey] || field.titleI18nKey);
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
      "";

    const clamp = (val: number): number => Math.max(field.min, Math.min(field.max, val));

    const syncInput = (value: number): void => {
      numberInput.value = (value / scale).toFixed(precision);
    };

    let pendingValue: number | null = null;
    const statusEl: HTMLDivElement = document.createElement("div");
    statusEl.className = "setting-status setting-status-error";
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");

    const statusText: HTMLSpanElement = document.createElement("span");
    const retryButton: HTMLButtonElement = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "yt-settings-btn-action";
    retryButton.textContent = language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ACTION_RETRY] || "";

    const clearFailure: () => void = (): void => {
      pendingValue = null;
      statusEl.remove();
    };

    const showFailure: () => void = (): void => {
      const errorLabel: string =
        language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.STATUS_ERROR] || "";
      const storageLabel: string =
        language.content[FEATURE_REGISTRY_CONSTANTS.I18N_KEYS.ERROR_STAGE_STORAGE] || "";
      statusText.textContent = storageLabel ? `${errorLabel} (${storageLabel})` : errorLabel;
      statusEl.replaceChildren(statusText, retryButton);
      if (statusEl.parentElement !== wrapper) {
        wrapper.appendChild(statusEl);
      }
    };

    const commitValue: (value: number) => boolean = (value: number): boolean => {
      pendingValue = value;
      try {
        field.setValue(value);
        clearFailure();
        return true;
      } catch {
        showFailure();
        return false;
      }
    };

    retryButton.addEventListener("click", (): void => {
      if (pendingValue !== null && commitValue(pendingValue)) {
        syncInput(field.getValue());
      }
    });

    numberInput.addEventListener("input", (): void => {
      const parsed = parseFloat(numberInput.value);
      if (Number.isFinite(parsed)) {
        const raw = Math.round(parsed * scale);
        const clamped = clamp(raw);
        commitValue(clamped);
      }
    });

    numberInput.addEventListener("blur", (): void => {
      if (pendingValue === null) {
        syncInput(field.getValue());
      }
    });

    btnAdvance.addEventListener("click", (): void => {
      const next = clamp(field.getValue() - field.step);
      if (commitValue(next)) {
        syncInput(field.getValue());
      }
    });

    btnDelay.addEventListener("click", (): void => {
      const next = clamp(field.getValue() + field.step);
      if (commitValue(next)) {
        syncInput(field.getValue());
      }
    });

    btnReset.addEventListener("click", (): void => {
      const defaultTarget = clamp(field.defaultValue ?? 0);
      if (commitValue(defaultTarget)) {
        syncInput(field.getValue());
      }
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

    return {
      element: wrapper,
      syncValue: (): void => {
        if (pendingValue !== null || document.activeElement === numberInput) {
          return;
        }
        syncInput(field.getValue());
      }
    };
  }
}
