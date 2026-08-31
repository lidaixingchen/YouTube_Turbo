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
        row.className = "row-item";

        const topRow = document.createElement("div");
        topRow.className = "setting";

        const nameEl = document.createElement("div");
        nameEl.className = "setting-name";
        nameEl.textContent = language.content[feature.i18nKey] || feature.i18nKey;

        const switchEl = document.createElement("div");
        switchEl.className = "setting-switch";

        const inputId = "yt_feat_" + feature.id;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = inputId;
        const isFeatureEnabled = typeof states[feature.id] === "boolean" ? states[feature.id] : feature.defaultValue;
        input.checked = isFeatureEnabled;

        const label = document.createElement("label");
        label.className = "toggle";
        label.htmlFor = inputId;

        switchEl.appendChild(input);
        switchEl.appendChild(label);
        topRow.appendChild(nameEl);
        topRow.appendChild(switchEl);
        row.appendChild(topRow);

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
        .yt-settings-form input[type="checkbox"] {
          display: none;
        }
        .yt-settings-form .setting-extra-config {
          margin-top: 10px;
          transition: opacity 0.2s ease;
        }
        .yt-subtitle-offset-config {
          padding: 12px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          text-align: left;
        }
        .yt-subtitle-offset-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .yt-subtitle-offset-title {
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
        }
        .yt-subtitle-offset-badge {
          font-size: 11px;
          background: #e2e8f0;
          color: #475569;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-weight: 500;
        }
        .yt-subtitle-offset-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .yt-offset-input-wrap {
          display: inline-flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 2px 8px;
        }
        .yt-offset-input {
          width: 58px;
          border: none;
          outline: none;
          font-size: 13px;
          font-weight: 600;
          text-align: right;
          color: #0f172a;
          padding: 4px 2px;
          background: transparent;
        }
        .yt-offset-unit {
          font-size: 12px;
          color: #64748b;
          margin-left: 4px;
        }
        .yt-offset-btn {
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #334155;
          cursor: pointer;
          transition: all 0.15s ease;
          user-select: none;
        }
        .yt-offset-btn:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
          color: #0f172a;
        }
        .yt-offset-btn:active {
          background: #e2e8f0;
        }
        .yt-offset-btn-reset {
          color: #dc2626;
          border-color: #fecaca;
          background: #fef2f2;
        }
        .yt-offset-btn-reset:hover {
          background: #fee2e2;
          border-color: #f87171;
          color: #b91c1c;
        }
        .yt-subtitle-offset-desc {
          font-size: 12px;
          color: #64748b;
          line-height: 1.45;
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
