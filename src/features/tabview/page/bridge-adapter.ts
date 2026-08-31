import { RuntimeBridge, type BridgeInstance } from "../../../core/bridge";
import { TABVIEW_CONSTANTS } from "../constants";
import type { TabKey, LocaleSnapshot } from "../types";

export interface PageBridgeHandlers {
  onSetActiveTab?: (tabKey: TabKey) => void;
  onSetFontSize?: (tabKey: TabKey, fontSize: number) => void;
  onLocaleUpdated?: (snapshot: LocaleSnapshot) => void;
  onTeardown?: () => void;
}

export class PageBridgeAdapter {
  private bridge: BridgeInstance | null = null;
  private cleanups: Array<() => void> = [];

  constructor(communicationKey: string, handlers: PageBridgeHandlers) {
    this.bridge = RuntimeBridge.create(communicationKey, "page");
    window.__YTI_PAGE_BRIDGE__ = this.bridge;

    if (handlers.onSetActiveTab) {
      const cleanup = this.bridge.on<{ tabKey: TabKey }>(
        TABVIEW_CONSTANTS.BRIDGE_MSG_SET_TAB,
        (payload) => {
          if (payload && payload.tabKey) {
            handlers.onSetActiveTab?.(payload.tabKey);
          }
        }
      );
      this.cleanups.push(cleanup);
    }

    if (handlers.onSetFontSize) {
      const cleanup = this.bridge.on<{ tabKey: TabKey; fontSize: number }>(
        TABVIEW_CONSTANTS.BRIDGE_MSG_SET_FONT_SIZE,
        (payload) => {
          if (payload && payload.tabKey && typeof payload.fontSize === "number") {
            handlers.onSetFontSize?.(payload.tabKey, payload.fontSize);
          }
        }
      );
      this.cleanups.push(cleanup);
    }

    if (handlers.onLocaleUpdated) {
      const cleanup = this.bridge.on<{ snapshot: LocaleSnapshot }>(
        TABVIEW_CONSTANTS.BRIDGE_MSG_LOCALE_UPDATED,
        (payload) => {
          if (payload && payload.snapshot) {
            handlers.onLocaleUpdated?.(payload.snapshot);
          }
        }
      );
      this.cleanups.push(cleanup);
    }

    if (handlers.onTeardown) {
      const cleanup = this.bridge.on(TABVIEW_CONSTANTS.BRIDGE_MSG_TEARDOWN, () => {
        handlers.onTeardown?.();
      });
      this.cleanups.push(cleanup);
    }
  }

  public notifyReady(version: string = "1.0.0"): void {
    this.bridge?.emit(TABVIEW_CONSTANTS.BRIDGE_MSG_READY, { version });
  }

  public notifyTabChanged(tabKey: TabKey): void {
    this.bridge?.emit(TABVIEW_CONSTANTS.BRIDGE_MSG_TAB_CHANGED, { tabKey });
  }

  public notifyFontSizeChanged(tabKey: TabKey, fontSize: number): void {
    this.bridge?.emit(TABVIEW_CONSTANTS.BRIDGE_MSG_FONT_SIZE_CHANGED, { tabKey, fontSize });
  }

  public destroy(): void {
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch (err) {
        console.warn("[PageBridgeAdapter] Error cleaning up bridge listener:", err);
      }
    }
    this.cleanups = [];
    this.bridge = null;
  }
}
