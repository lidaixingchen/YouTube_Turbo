import tabviewCss from "./tabview.css?raw";
import pageBundleCode from "virtual:tabview-page-bundle";
import { TABVIEW_CONSTANTS } from "./constants";
import { Locale } from "../../i18n";
import { StyleEngine } from "../../core/style-engine";
import { createScript } from "../../core/trusted-types";
import { createSessionId } from "./protocol";
import { createTabviewSession } from "./session";
import type {
  TabviewBootstrap,
  TabviewSession,
  TabviewSessionNotice,
  TabviewCloseReason
} from "./types";

type FeatureState = "idle" | "starting" | "ready" | "stopping";

interface PageInjectionAdapter {
  inject(source: string): void;
}

const defaultInjectionAdapter: PageInjectionAdapter = {
  inject(source: string): void {
    const injectTarget: HTMLElement | null =
      document.head || document.documentElement || document.body;
    if (!injectTarget) {
      throw new Error("[Tabview] No valid injection target element found");
    }

    let injected = false;
    if (typeof GM_addElement === "function") {
      try {
        GM_addElement(injectTarget, "script", { textContent: source });
        injected = true;
      } catch {
        // fallback to native element
      }
    }

    if (!injected) {
      const scriptEl: HTMLScriptElement = document.createElement("script");
      try {
        scriptEl.textContent = createScript(source);
      } catch {
        scriptEl.textContent = source;
      }
      injectTarget.appendChild(scriptEl);
    }
  }
};

let featureState: FeatureState = "idle";
let currentSession: TabviewSession<"sandbox"> | null = null;
let inFlightSetupPromise: Promise<void> | null = null;
let readyTimeoutId: ReturnType<typeof setTimeout> | null = null;

function rollback(reason: TabviewCloseReason): void {
  featureState = "idle";
  inFlightSetupPromise = null;
  if (readyTimeoutId !== null) {
    clearTimeout(readyTimeoutId);
    readyTimeoutId = null;
  }
  if (currentSession) {
    const sessionToClose = currentSession;
    currentSession = null;
    sessionToClose.close(reason);
  }
  document.documentElement.removeAttribute("tabview-loaded");
  StyleEngine.remove(TABVIEW_CONSTANTS.STYLE_ID_MAIN);
}

export const Tabview = {
  setup(): Promise<void> {
    if (!/youtube\.com/.test(window.location.host)) {
      return Promise.resolve();
    }

    // Setup dedupe
    if (featureState === "ready") {
      return Promise.resolve();
    }
    if (featureState === "starting" && inFlightSetupPromise) {
      return inFlightSetupPromise;
    }

    featureState = "starting";
    const sessionId = createSessionId();
    const bootstrap: TabviewBootstrap = {
      namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
      protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
      sessionId,
      initialLocale: Locale.exportActiveSnapshot()
    };

    let readyResolver!: () => void;
    let readyRejecter!: (reason: unknown) => void;

    const readyPromise = new Promise<void>((resolve, reject) => {
      readyResolver = resolve;
      readyRejecter = reject;
    });

    inFlightSetupPromise = readyPromise;

    // 步骤 4：先建立 sandbox session 监听器（Listener-before-injection 不变量）
    currentSession = createTabviewSession<"sandbox">({
      role: "sandbox",
      bootstrap,
      receive: (notice: TabviewSessionNotice<"sandbox">): void => {
        if (notice.kind === "message" && notice.message.type === "ready") {
          if (readyTimeoutId !== null) {
            clearTimeout(readyTimeoutId);
            readyTimeoutId = null;
          }
          featureState = "ready";
          document.documentElement.setAttribute("tabview-loaded", "icp");
          const styledCSS: string =
            tabviewCss.trim() +
            "\n\n/*# sourceURL=" +
            TABVIEW_CONSTANTS.SOURCE_URL_CSS +
            " */\n";
          StyleEngine.inject(TABVIEW_CONSTANTS.STYLE_ID_MAIN, styledCSS);
          readyResolver?.();
        } else if (notice.kind === "closed") {
          const closedError = new Error(
            `[Tabview] Session closed during setup: ${notice.reason}`
          );
          readyRejecter?.(closedError);
          rollback(notice.reason);
        }
      }
    });

    // 步骤 5：启动单次 READY 超时
    readyTimeoutId = setTimeout(() => {
      readyTimeoutId = null;
      const timeoutError = new Error(
        `[Tabview] Ready barrier timeout after ${TABVIEW_CONSTANTS.READY_TIMEOUT_MS}ms`
      );
      readyRejecter?.(timeoutError);
      rollback("setup-timeout");
    }, TABVIEW_CONSTANTS.READY_TIMEOUT_MS);

    // 步骤 6：安全序列化 bootstrap 注入页面
    const scriptToRun: string = `(function(){\n${pageBundleCode}\nif (typeof window.__YTI_TABVIEW_MAIN__ === "function") {\n  window.__YTI_TABVIEW_MAIN__(${JSON.stringify(bootstrap)});\n}\n})();\n\n//# sourceURL=${TABVIEW_CONSTANTS.SOURCE_URL_SCRIPT}\n`;

    try {
      defaultInjectionAdapter.inject(scriptToRun);
    } catch (err: unknown) {
      readyRejecter?.(err);
      rollback("injection-failed");
    }

    return inFlightSetupPromise;
  },

  destroy(): void {
    if (featureState === "idle" || featureState === "stopping") {
      return;
    }
    featureState = "stopping";
    if (readyTimeoutId !== null) {
      clearTimeout(readyTimeoutId);
      readyTimeoutId = null;
    }
    if (currentSession) {
      currentSession.close("feature-disabled");
      currentSession = null;
    }
    document.documentElement.removeAttribute("tabview-loaded");
    StyleEngine.remove(TABVIEW_CONSTANTS.STYLE_ID_MAIN);
    featureState = "idle";
    inFlightSetupPromise = null;
  }
};
