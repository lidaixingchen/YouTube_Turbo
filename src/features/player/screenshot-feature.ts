import { TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { createToolbarActionFeature, type FeatureFacade } from "./feature-factory";

export const PlayerScreenshotFeature: FeatureFacade = createToolbarActionFeature({
  name: "PlayerScreenshotFeature",
  shortcut: {
    key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SCREENSHOT.KEY,
    shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SCREENSHOT.SHIFT,
    description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SCREENSHOT.DESCRIPTION,
    handler: (): void => {
      PlayerController.getInstance().captureScreenshot().catch((err: unknown) => {
        console.error("[PlayerScreenshotFeature] Shortcut screenshot error:", err);
      });
    }
  },
  action: {
    id: PLAYER_FEATURE_CONSTANTS.ACTIONS.SCREENSHOT,
    slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    titleKey: PLAYER_FEATURE_CONSTANTS.I18N_KEYS.ACTION_SCREENSHOT,
    defaultTitle: PLAYER_FEATURE_CONSTANTS.DEFAULT_TITLES.SCREENSHOT,
    icon: PLAYER_FEATURE_CONSTANTS.ICONS.SCREENSHOT,
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.SCREENSHOT,
    dismissOnExecute: true,
    onClick: (): void => {
      PlayerController.getInstance().captureScreenshot().catch((err: unknown) => {
        console.error("[PlayerScreenshotFeature] Toolbar screenshot error:", err);
      });
    }
  }
});
