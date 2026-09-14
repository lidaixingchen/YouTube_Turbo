import { setupConfigHacks } from "../../../core/config-hacks";
import { TabviewLifecycleCoordinator } from "./coordinator";
import { TABVIEW_CONSTANTS } from "../constants";
import { validateTabviewBootstrap } from "../protocol";
import { createTabviewSession } from "../session";
import type {
  TabKey,
  TabviewCommand,
  TabviewSession,
  TabviewSessionNotice
} from "../types";

function initTrustedTypesPolicy(): void {
  if (typeof window !== "undefined" && typeof window.trustedTypes !== "undefined" && window.trustedTypes.defaultPolicy === null) {
    try {
      window.trustedTypes.createPolicy("default", {
        createHTML: (s: string) => s,
        createScriptURL: (s: string) => s,
        createScript: (s: string) => s
      });
    } catch {
      // ignore
    }
  }
}

function applyCommand(
  coordinator: TabviewLifecycleCoordinator,
  command: TabviewCommand
): void {
  switch (command.type) {
    case "set-active-tab":
      coordinator.setActiveTab(command.tabKey);
      break;
    case "set-font-size":
      coordinator.setFontSize(command.tabKey, command.fontSize);
      break;
    case "update-locale":
      coordinator.setLocale(command.snapshot);
      break;
  }
}

export function main(bootstrapInput: unknown): void {
  const validationResult = validateTabviewBootstrap(bootstrapInput);
  if (!validationResult.ok) {
    console.error("[Tabview:Page] Invalid bootstrap data:", validationResult.error);
    return;
  }
  const bootstrap = validationResult.value;

  setupConfigHacks(window);
  initTrustedTypesPolicy();

  const coordinator: TabviewLifecycleCoordinator = TabviewLifecycleCoordinator.getInstance();
  let sessionClosed = false;

  const session: TabviewSession<"page"> = createTabviewSession({
    role: "page",
    bootstrap,
    receive: (notice: TabviewSessionNotice<"page">): void => {
      if (notice.kind === "message") {
        applyCommand(coordinator, notice.message);
      } else if (notice.kind === "control" && notice.action.type === "teardown-request") {
        sessionClosed = true;
        let success: boolean = true;
        try {
          coordinator.destroy();
        } catch (err: unknown) {
          success = false;
          console.error("[Tabview:Page] Coordinator destroy error:", err);
        }
        session.dispatchControl({
          type: "teardown-ack",
          success,
          errorStage: success ? undefined : "coordinator"
        });
        session.close("feature-disabled");
      } else if (notice.kind === "closed") {
        sessionClosed = true;
        try {
          coordinator.destroy();
        } catch (err: unknown) {
          console.error("[Tabview:Page] Coordinator destroy error on close:", err);
        }
      }
    }
  });

  const finishWithoutReady = (): void => {
    let success: boolean = true;
    try {
      coordinator.destroy();
    } catch (err: unknown) {
      success = false;
      console.error("[Tabview:Page] Coordinator cleanup error:", err);
    }
    session.dispatchControl({
      type: "teardown-ack",
      success,
      initFailed: true,
      errorStage: success ? undefined : "coordinator"
    });
    session.close("page-init-failed");
  };

  try {
    const committed: boolean = coordinator.init(bootstrap.initialLocale, {
      onTabChanged: (tabKey: TabKey): void => {
        session.dispatch({ type: "tab-changed", tabKey });
      },
      onFontSizeChanged: (tabKey: TabKey, fontSize: number): void => {
        session.dispatch({ type: "font-size-changed", tabKey, fontSize });
      }
    });
    if (!committed || sessionClosed) {
      finishWithoutReady();
      return;
    }
  } catch (err: unknown) {
    console.error("[Tabview:Page] Coordinator init error:", err);
    finishWithoutReady();
    return;
  }

  session.dispatch({
    type: "ready",
    protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION
  });
}

if (typeof window !== "undefined") {
  (window as unknown as { __YTI_TABVIEW_MAIN__?: (input: unknown) => void }).__YTI_TABVIEW_MAIN__ = main;
}

export default main;
