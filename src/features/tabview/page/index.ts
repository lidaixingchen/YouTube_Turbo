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

  const session: TabviewSession<"page"> = createTabviewSession({
    role: "page",
    bootstrap,
    receive: (notice: TabviewSessionNotice<"page">): void => {
      if (notice.kind === "message") {
        applyCommand(coordinator, notice.message);
      } else if (notice.kind === "closed") {
        coordinator.destroy();
      }
    }
  });

  try {
    coordinator.init(bootstrap.initialLocale, {
      onTabChanged: (tabKey: TabKey): void => {
        session.dispatch({ type: "tab-changed", tabKey });
      },
      onFontSizeChanged: (tabKey: TabKey, fontSize: number): void => {
        session.dispatch({ type: "font-size-changed", tabKey, fontSize });
      }
    });
  } catch (err: unknown) {
    console.error("[Tabview:Page] Coordinator init error:", err);
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
