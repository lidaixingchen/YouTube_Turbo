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

interface PageSessionOwner {
  sessionId: string;
}

const PAGE_SESSION_OWNER_SYMBOL: symbol = Symbol.for(
  TABVIEW_CONSTANTS.PAGE_SESSION_OWNER_KEY
);

function claimPageSession(sessionId: string): boolean {
  const pageGlobal: Record<PropertyKey, unknown> = window as unknown as Record<PropertyKey, unknown>;
  const currentOwner: PageSessionOwner | undefined = pageGlobal[PAGE_SESSION_OWNER_SYMBOL] as
    | PageSessionOwner
    | undefined;
  if (currentOwner?.sessionId === sessionId) {
    return false;
  }
  if (currentOwner) {
    currentOwner.sessionId = sessionId;
  } else {
    const newOwner: PageSessionOwner = { sessionId };
    Object.defineProperty(pageGlobal, PAGE_SESSION_OWNER_SYMBOL, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: newOwner
    });
  }
  return true;
}

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
  if (!claimPageSession(bootstrap.sessionId)) {
    return;
  }

  setupConfigHacks(window);
  initTrustedTypesPolicy();

  const coordinator: TabviewLifecycleCoordinator = TabviewLifecycleCoordinator.getInstance();
  let sessionClosed = false;
  let coordinatorDestroyed = false;
  const destroyCoordinator = (): boolean => {
    if (coordinatorDestroyed) {
      return true;
    }
    coordinatorDestroyed = true;
    try {
      coordinator.destroy();
      return true;
    } catch (err: unknown) {
      console.error("[Tabview:Page] Coordinator destroy error:", err);
      return false;
    }
  };

  const session: TabviewSession<"page"> = createTabviewSession({
    role: "page",
    bootstrap,
    receive: (notice: TabviewSessionNotice<"page">): void => {
      if (notice.kind === "message") {
        applyCommand(coordinator, notice.message);
      } else if (notice.kind === "control" && notice.action.type === "teardown-request") {
        sessionClosed = true;
        const success: boolean = destroyCoordinator();
        session.dispatchControl({
          type: "teardown-ack",
          success,
          errorStage: success ? undefined : "coordinator"
        });
        session.close("feature-disabled");
      } else if (notice.kind === "closed") {
        if (sessionClosed) {
          return;
        }
        sessionClosed = true;
        destroyCoordinator();
      }
    }
  });

  const finishWithoutReady = (): void => {
    sessionClosed = true;
    const success: boolean = destroyCoordinator();
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
