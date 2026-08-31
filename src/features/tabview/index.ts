import tabviewCss from "./tabview.css?raw";
import executionScriptRaw from "./execution.js?raw";
import { TABVIEW_CONSTANTS } from "./constants";
import { Locale } from "../../i18n";
import { RuntimeBridge } from "../../core/bridge";
import { StyleEngine } from "../../core/style-engine";

export const Tabview = {
  async setup(): Promise<void> {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    const communicationKey = "ck-" + Date.now() + "-" + Math.floor(Math.random() * 314159265359 + 314159265359).toString(36);

    if (!document.documentElement) {
      while (!document.documentElement) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    const activeLocaleData = Locale.exportActiveSnapshot();
    const sandboxBridge = RuntimeBridge.create(communicationKey, "sandbox");
    window.__YTI_SANDBOX_BRIDGE__ = sandboxBridge;

    const scriptToRun = `(${executionScriptRaw})("${communicationKey}", ${JSON.stringify(activeLocaleData)});\n\n//# sourceURL=${TABVIEW_CONSTANTS.SOURCE_URL_SCRIPT}\n`;

    if (typeof GM_addElement === "function") {
      GM_addElement(document.head || document.documentElement, "script", { textContent: scriptToRun });
    } else {
      const scriptEl = document.createElement("script");
      scriptEl.textContent = scriptToRun;
      (document.head || document.documentElement).appendChild(scriptEl);
    }

    const styledCSS = tabviewCss.trim() + "\n\n/*# sourceURL=" + TABVIEW_CONSTANTS.SOURCE_URL_CSS + " */\n";
    StyleEngine.inject("tabview-main", styledCSS);
  },

  destroy(): void {
    StyleEngine.remove("tabview-main");
  }
};
