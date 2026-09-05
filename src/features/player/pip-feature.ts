import { TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { createToolbarActionFeature, type FeatureFacade } from "./feature-factory";

export const PlayerPiPFeature: FeatureFacade = createToolbarActionFeature({
  name: "PlayerPiPFeature",
  shortcut: {
    key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.PIP.KEY,
    shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.PIP.SHIFT,
    description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.PIP.DESCRIPTION,
    handler: (): void => {
      PlayerController.getInstance().togglePictureInPicture().catch((err: unknown) => {
        console.error("[PlayerPiPFeature] Shortcut PiP error:", err);
      });
    }
  },
  action: {
    id: PLAYER_FEATURE_CONSTANTS.ACTIONS.PIP,
    slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    titleKey: PLAYER_FEATURE_CONSTANTS.I18N_KEYS.ACTION_PIP,
    defaultTitle: PLAYER_FEATURE_CONSTANTS.DEFAULT_TITLES.PIP,
    icon: PLAYER_FEATURE_CONSTANTS.ICONS.PIP,
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.PIP,
    dismissOnExecute: true,
    onClick: (): void => {
      PlayerController.getInstance().togglePictureInPicture().catch((err: unknown) => {
        console.error("[PlayerPiPFeature] Toolbar PiP error:", err);
      });
    }
  }
});
