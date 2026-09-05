import { TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { createToolbarActionFeature, type FeatureFacade } from "./feature-factory";

export const PlayerLoopFeature: FeatureFacade = createToolbarActionFeature({
  name: "PlayerLoopFeature",
  shortcut: {
    key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.LOOP.KEY,
    shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.LOOP.SHIFT,
    description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.LOOP.DESCRIPTION,
    handler: (): void => {
      PlayerController.getInstance().toggleLoop();
    }
  },
  action: {
    id: PLAYER_FEATURE_CONSTANTS.ACTIONS.LOOP,
    slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    titleKey: PLAYER_FEATURE_CONSTANTS.I18N_KEYS.ACTION_LOOP,
    defaultTitle: PLAYER_FEATURE_CONSTANTS.DEFAULT_TITLES.LOOP,
    icon: PLAYER_FEATURE_CONSTANTS.ICONS.LOOP,
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.LOOP,
    dismissOnExecute: false,
    isActive: (): boolean => PlayerController.getInstance().isLoopEnabled(),
    onClick: (): void => {
      PlayerController.getInstance().toggleLoop();
    },
    onStateBind: (refresh: () => void): (() => void) => {
      return PlayerController.getInstance().onStateChange(refresh);
    }
  },
  onDisable: (): void => {
    PlayerController.getInstance().setLoop(false);
  }
});
