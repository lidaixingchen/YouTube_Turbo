import tabviewCss from "./tabview.css?raw";
import pageBundleCode from "virtual:tabview-page-bundle";
import { TABVIEW_CONSTANTS } from "./constants";
import { Locale } from "../../i18n";
import { RuntimeBridge, type BridgeInstance } from "../../core/bridge";
import { StyleEngine } from "../../core/style-engine";
import { createScript } from "../../core/trusted-types";

let sandboxBridge: BridgeInstance | null = null;

export const Tabview = {
  async setup(): Promise<void> {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    const communicationKey = `ck-${Date.now()}-${Math.floor(Math.random() * 1e12).toString(36)}`;
    document.documentElement.setAttribute("tabview-loaded", "icp");

    const activeLocaleData = Locale.exportActiveSnapshot();
    sandboxBridge = RuntimeBridge.create(communicationKey, "sandbox");
    window.__YTI_SANDBOX_BRIDGE__ = sandboxBridge;

    const scriptToRun = `(function(){\n${pageBundleCode}\nif (typeof window.__YTI_TABVIEW_MAIN__ === "function") {\n  window.__YTI_TABVIEW_MAIN__("${communicationKey}", ${JSON.stringify(activeLocaleData)});\n}\n})();\n\n//# sourceURL=${TABVIEW_CONSTANTS.SOURCE_URL_SCRIPT}\n`;

    const injectTarget = document.head || document.documentElement || document.body;
    let injected = false;

    if (typeof GM_addElement === "function" && injectTarget) {
      try {
        GM_addElement(injectTarget, "script", { textContent: scriptToRun });
        injected = true;
      } catch {
        // fallback
      }
    }

    if (!injected && injectTarget) {
      const scriptEl = document.createElement("script");
      try {
        scriptEl.textContent = scriptToRun;
      } catch {
        scriptEl.textContent = createScript(scriptToRun);
      }
      injectTarget.appendChild(scriptEl);
    }

    const styledCSS = tabviewCss.trim() + "\n\n/*# sourceURL=" + TABVIEW_CONSTANTS.SOURCE_URL_CSS + " */\n";
    StyleEngine.inject(TABVIEW_CONSTANTS.STYLE_ID_MAIN, styledCSS);
  },

  destroy(): void {
    if (sandboxBridge) {
      sandboxBridge.emit(TABVIEW_CONSTANTS.BRIDGE_MSG_TEARDOWN, {});
      sandboxBridge = null;
    }
    document.documentElement.removeAttribute("tabview-loaded");
    StyleEngine.remove(TABVIEW_CONSTANTS.STYLE_ID_MAIN);
  }
};
