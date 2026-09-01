import { StorageUtil } from "../core/storage";
import { StyleEngine } from "../core/style-engine";
import { LangueUtil } from "../i18n";
import { Modal } from "../ui/modal/modal";
import type { FeatureDescriptor } from "../types";
import settingsCss from "./settings.css?raw";

const SETTINGS_STYLE_ID = "yt-improvements-settings-style";

export const FeatureRegistry = (() => {
  const descriptors = new Map<string, FeatureDescriptor>();
  let isInitialized = false;

  const getStoredStates = (): Record<string, boolean> => {
    const defaultState: Record<string, boolean> = {};
    descriptors.forEach((desc, id) => {
      defaultState[id] = desc.defaultValue;
    });
    const stored = StorageUtil.getValue<Record<string, boolean>>(
      StorageUtil.keys.youtube.functionState,
      defaultState
    );
    return { ...defaultState, ...(stored || {}) };
  };

  const saveStoredStates = (states: Record<string, boolean>): void => {
    StorageUtil.setValue(StorageUtil.keys.youtube.functionState, states);
  };

  return {
    register(descriptor: FeatureDescriptor): void {
      descriptors.set(descriptor.id, descriptor);
    },

    registerAll(descList: FeatureDescriptor[]): void {
      descList.forEach((d) => descriptors.set(d.id, d));
    },

    getDefaultStates(): Record<string, boolean> {
      const defaults: Record<string, boolean> = {};
      descriptors.forEach((desc, id) => {
        defaults[id] = desc.defaultValue;
      });
      return defaults;
    },

    getAllStates(): Record<string, boolean> {
      return getStoredStates();
    },

    isEnabled(id: string): boolean {
      const states = getStoredStates();
      return typeof states[id] === "boolean" ? states[id] : (descriptors.get(id)?.defaultValue ?? true);
    },

    async setEnabled(id: string, enabled: boolean): Promise<void> {
      const states = getStoredStates();
      const prev = states[id];
      states[id] = enabled;
      saveStoredStates(states);
      const desc = descriptors.get(id);
      if (desc && isInitialized && prev !== enabled) {
        if (enabled) {
          try {
            await desc.setup();
          } catch (err) {
            console.error(`[FeatureRegistry] Error enabling ${id}:`, err);
          }
        } else if (desc.teardown) {
          try {
            await desc.teardown();
          } catch (err) {
            console.error(`[FeatureRegistry] Error disabling ${id}:`, err);
          }
        }
      }
    },

    async initAll(): Promise<void> {
      if (!/youtube\.com/.test(window.location.host)) {
        return;
      }
      const sorted = Array.from(descriptors.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
      const states = getStoredStates();
      for (const feature of sorted) {
        const enabled = typeof states[feature.id] === "boolean" ? states[feature.id] : feature.defaultValue;
        if (enabled) {
          try {
            await feature.setup();
          } catch (err) {
            console.error(`[FeatureRegistry] Failed to initialize ${feature.id}:`, err);
          }
        }
      }
      isInitialized = true;
    },

    openSettingsModal(): void {
      StyleEngine.inject(SETTINGS_STYLE_ID, settingsCss);

      const language = LangueUtil.getLanguage();
      const states = getStoredStates();
      let requiresReloadOnClose = false;

      const container = document.createElement("div");
      container.className = "yt-settings-form";

      const sorted = Array.from(descriptors.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

      sorted.forEach((feature) => {
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

        const inputId = `yt_feat_${feature.id}`;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = inputId;
        input.className = "switch-input";
        input.setAttribute("aria-label", titleText);
        const isFeatureEnabled = typeof states[feature.id] === "boolean" ? states[feature.id] : feature.defaultValue;
        input.checked = isFeatureEnabled;

        const track = document.createElement("span");
        track.className = "switch-track";

        switchEl.appendChild(input);
        switchEl.appendChild(track);

        header.appendChild(infoEl);
        header.appendChild(switchEl);
        row.appendChild(header);

        let extraContainer: HTMLElement | null = null;
        if (typeof feature.renderExtraConfig === "function") {
          extraContainer = document.createElement("div");
          extraContainer.className = "setting-extra-config";
          if (!isFeatureEnabled) {
            extraContainer.style.opacity = "0.5";
            extraContainer.style.pointerEvents = "none";
          }
          feature.renderExtraConfig(extraContainer, language);
          row.appendChild(extraContainer);
        }

        input.addEventListener("change", async (e: Event) => {
          const isChecked = (e.target as HTMLInputElement).checked;
          states[feature.id] = isChecked;
          saveStoredStates(states);
          if (extraContainer) {
            extraContainer.style.opacity = isChecked ? "1" : "0.5";
            extraContainer.style.pointerEvents = isChecked ? "auto" : "none";
          }
          if (feature.requiresReload) {
            requiresReloadOnClose = true;
          } else if (feature.teardown) {
            if (isChecked) {
              try {
                await feature.setup();
              } catch (err) {
                console.error(err);
              }
            } else {
              try {
                await feature.teardown();
              } catch (err) {
                console.error(err);
              }
            }
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
          if (requiresReloadOnClose) {
            location.reload();
          }
        }
      });
    }
  };
})();
