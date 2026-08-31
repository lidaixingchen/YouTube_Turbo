import { NavigationCoordinator } from "./coordinator";
import { PageBridgeAdapter } from "./bridge-adapter";
import type { LocaleSnapshot } from "../types";

function initTrustedTypesPolicy(): void {
  if (typeof window !== "undefined" && typeof window.trustedTypes !== "undefined") {
    try {
      window.trustedTypes.createPolicy("yt-tabview-policy", {
        createHTML: (s: string) => s,
        createScriptURL: (s: string) => s,
        createScript: (s: string) => s
      });
    } catch {
      // 忽略已存在或受限的策略创建异常
    }
  }
}

export function main(communicationKey: string, initialLocaleData: LocaleSnapshot): void {
  initTrustedTypesPolicy();

  const coordinator = NavigationCoordinator.getInstance();

  const bridgeAdapter = new PageBridgeAdapter(communicationKey, {
    onSetActiveTab: (tabKey) => {
      coordinator.setActiveTab(tabKey);
    },
    onSetFontSize: (tabKey, fontSize) => {
      coordinator.setFontSize(tabKey, fontSize);
    },
    onLocaleUpdated: (snapshot) => {
      coordinator.setLocale(snapshot);
    },
    onTeardown: () => {
      coordinator.destroy();
      bridgeAdapter.destroy();
    }
  });

  coordinator.init(initialLocaleData, {
    onTabChanged: (tabKey) => {
      bridgeAdapter.notifyTabChanged(tabKey);
    },
    onFontSizeChanged: (tabKey, fontSize) => {
      bridgeAdapter.notifyFontSizeChanged(tabKey, fontSize);
    }
  });

  bridgeAdapter.notifyReady("1.2.0");
}

if (typeof window !== "undefined") {
  (window as any).__YTI_TABVIEW_MAIN__ = main;
}

export default main;
