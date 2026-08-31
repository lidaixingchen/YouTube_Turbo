import { StorageUtil } from "../core/storage";
import { LangueUtil } from "../i18n";
import { Modal } from "../ui/modal/modal";
import type { FeatureDescriptor } from "../types";

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
      const language = LangueUtil.getLanguage();
      const states = getStoredStates();
      let requiresReloadOnClose = false;

      const container = document.createElement("div");
      container.className = "yt-settings-form";

      const sorted = Array.from(descriptors.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

      sorted.forEach((feature) => {
        const row = document.createElement("div");
        row.className = "row-item setting";

        const nameEl = document.createElement("div");
        nameEl.className = "setting-name";
        nameEl.textContent = language.content[feature.i18nKey] || feature.i18nKey;

        const switchEl = document.createElement("div");
        switchEl.className = "setting-switch";

        const inputId = "yt_feat_" + feature.id;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = inputId;
        input.checked = typeof states[feature.id] === "boolean" ? states[feature.id] : feature.defaultValue;

        const label = document.createElement("label");
        label.className = "toggle";
        label.htmlFor = inputId;

        input.addEventListener("change", async (e: Event) => {
          const isChecked = (e.target as HTMLInputElement).checked;
          states[feature.id] = isChecked;
          saveStoredStates(states);
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

        switchEl.appendChild(input);
        switchEl.appendChild(label);
        row.appendChild(nameEl);
        row.appendChild(switchEl);
        container.appendChild(row);
      });

      const styleSheet = `
        .yt-settings-form .row-item {
          background: #ffffff;
          padding: 14px 16px;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
          margin-bottom: 10px;
        }
        .yt-settings-form .setting {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .yt-settings-form .setting-name {
          flex: 1;
          text-align: left;
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }
        .yt-settings-form .setting-switch {
          width: 56px;
          display: flex;
          justify-content: flex-end;
        }
        .yt-settings-form .toggle {
          width: 48px;
          height: 24px;
          background-color: #ccc;
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          transition: background-color 0.25s;
          display: inline-block;
        }
        .yt-settings-form .toggle:before {
          content: "";
          position: absolute;
          width: 18px;
          height: 18px;
          background-color: white;
          border-radius: 50%;
          top: 50%;
          left: 3px;
          transform: translateY(-50%);
          transition: transform 0.25s;
        }
        .yt-settings-form input:checked + .toggle {
          background-color: #4CAF50;
        }
        .yt-settings-form input:checked + .toggle:before {
          transform: translate(24px, -50%);
        }
        .yt-settings-form input {
          display: none;
        }
      `;

      Modal.open({
        title: language.content.function_setting_title,
        content: container,
        styleSheet,
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
