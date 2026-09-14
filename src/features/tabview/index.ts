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
  TabviewCloseReason,
  TabviewControlAction
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
let inFlightDestroyPromise: Promise<void> | null = null;
let readyTimeoutId: ReturnType<typeof setTimeout> | null = null;
let readyRejecterFn: ((reason: unknown) => void) | null = null;
let lastTeardownAck: (TabviewControlAction & { type: "teardown-ack" }) | null = null;
let teardownAckResolver: ((ack: TabviewControlAction & { type: "teardown-ack" }) => void) | null = null;
let teardownAckRejecter: ((reason: unknown) => void) | null = null;

function rollback(reason: TabviewCloseReason): void {
  featureState = "idle";
  inFlightSetupPromise = null;
  readyRejecterFn = null;
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
    lastTeardownAck = null;
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

    readyRejecterFn = readyRejecter;
    inFlightSetupPromise = readyPromise;

    // 步骤 4：先建立 sandbox session 监听器（Listener-before-injection 不变量）
    currentSession = createTabviewSession<"sandbox">({
      role: "sandbox",
      bootstrap,
      receive: (notice: TabviewSessionNotice<"sandbox">): void => {
        if (notice.kind === "control" && notice.action.type === "teardown-ack") {
          lastTeardownAck = notice.action;
          if (teardownAckResolver) {
            teardownAckResolver(notice.action);
            teardownAckResolver = null;
            teardownAckRejecter = null;
          }
          if (notice.action.initFailed) {
            if (readyTimeoutId !== null) {
              clearTimeout(readyTimeoutId);
              readyTimeoutId = null;
            }
            const closedError = new Error(
              "[Tabview] Session closed during setup: page-init-failed"
            );
            readyRejecter?.(closedError);
            rollback("page-init-failed");
          }
        } else if (notice.kind === "message" && notice.message.type === "ready") {
          try {
            document.documentElement.setAttribute("tabview-loaded", "icp");
            const styledCSS: string =
              tabviewCss.trim() +
              "\n\n/*# sourceURL=" +
              TABVIEW_CONSTANTS.SOURCE_URL_CSS +
              " */\n";
            StyleEngine.inject(TABVIEW_CONSTANTS.STYLE_ID_MAIN, styledCSS);
            if (readyTimeoutId !== null) {
              clearTimeout(readyTimeoutId);
              readyTimeoutId = null;
            }
            featureState = "ready";
            readyResolver?.();
          } catch (err: unknown) {
            if (readyTimeoutId !== null) {
              clearTimeout(readyTimeoutId);
              readyTimeoutId = null;
            }
            readyRejecter?.(err);
            rollback("ready-post-process-failed");
          }
        } else if (notice.kind === "closed") {
          if (teardownAckRejecter) {
            teardownAckRejecter(new Error(`[Tabview] Session closed before teardown ack: ${notice.reason}`));
            teardownAckResolver = null;
            teardownAckRejecter = null;
          }
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

    return readyPromise;
  },

  destroy(): Promise<void> {
    if (featureState === "idle" && !currentSession && !inFlightDestroyPromise) {
      return Promise.resolve();
    }

    if (inFlightDestroyPromise) {
      return inFlightDestroyPromise;
    }

    featureState = "stopping";
    if (readyTimeoutId !== null) {
      clearTimeout(readyTimeoutId);
      readyTimeoutId = null;
    }
    if (inFlightSetupPromise && readyRejecterFn) {
      readyRejecterFn(new Error("[Tabview] Setup cancelled by teardown"));
      inFlightSetupPromise = null;
      readyRejecterFn = null;
    }

    const localErrors: unknown[] = [];
    document.documentElement.removeAttribute("tabview-loaded");
    try {
      StyleEngine.remove(TABVIEW_CONSTANTS.STYLE_ID_MAIN);
    } catch (err: unknown) {
      localErrors.push(err);
    }

    const sessionToClean = currentSession;
    currentSession = null;

    if (!sessionToClean || sessionToClean.isClosed()) {
      const ack = lastTeardownAck;
      lastTeardownAck = null;
      featureState = "idle";
      const earlyErrors: unknown[] = [...localErrors];
      if (ack && !ack.success) {
        earlyErrors.unshift(new Error("[Tabview] Page teardown failed"));
      }
      if (earlyErrors.length === 1) {
        return Promise.reject(earlyErrors[0]);
      }
      if (earlyErrors.length > 1) {
        return Promise.reject(new AggregateError(earlyErrors, "[Tabview] Teardown failed across sandbox and page"));
      }
      return Promise.resolve();
    }

    const destroyPromise = (async (): Promise<void> => {
      let ack = lastTeardownAck;
      if (!ack) {
        let timer: ReturnType<typeof setTimeout> | null = null;
        try {
          ack = await new Promise<TabviewControlAction & { type: "teardown-ack" }>((resolve, reject) => {
            teardownAckResolver = resolve;
            teardownAckRejecter = reject;
            timer = setTimeout(() => {
              teardownAckResolver = null;
              teardownAckRejecter = null;
              reject(new Error(`[Tabview] Teardown timeout after ${TABVIEW_CONSTANTS.TEARDOWN_TIMEOUT_MS}ms`));
            }, TABVIEW_CONSTANTS.TEARDOWN_TIMEOUT_MS);
            sessionToClean.dispatchControl({ type: "teardown-request" });
          });
        } catch (err: unknown) {
          if (timer !== null) {
            clearTimeout(timer);
          }
          sessionToClean.close("teardown-timeout");
          throw err;
        } finally {
          if (timer !== null) {
            clearTimeout(timer);
          }
        }
      }

      sessionToClean.close(ack && ack.success ? "feature-disabled" : "teardown-failed");

      const allErrors: unknown[] = [...localErrors];
      if (!ack || !ack.success) {
        allErrors.unshift(new Error("[Tabview] Page teardown failed"));
      }
      if (allErrors.length === 1) {
        throw allErrors[0];
      }
      if (allErrors.length > 1) {
        throw new AggregateError(allErrors, "[Tabview] Teardown failed across sandbox and page");
      }
    })().finally(() => {
      featureState = "idle";
      inFlightDestroyPromise = null;
      lastTeardownAck = null;
      teardownAckResolver = null;
      teardownAckRejecter = null;
    });

    inFlightDestroyPromise = destroyPromise;
    return destroyPromise;
  }
};
