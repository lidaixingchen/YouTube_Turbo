import { TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { StorageUtil } from "../../core/storage";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { createToolbarActionFeature, type FeatureFacade } from "./feature-factory";

let ownsLoopState: boolean = false;

const loopFeature: FeatureFacade = createToolbarActionFeature({
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
    if (!ownsLoopState) {
      return;
    }
    ownsLoopState = false;
    PlayerController.getInstance().setLoop(false);
  }
});

export const PlayerLoopFeature: FeatureFacade = Object.freeze({
  enable(): void {
    if (loopFeature.isActive()) {
      return;
    }

    const savedLoop: boolean = Boolean(
      StorageUtil.getValue(StorageUtil.keys.youtube.videoLoop, false)
    );
    const controller: PlayerController = PlayerController.getInstance();
    controller.init();
    const previousLoop: boolean = controller.isLoopEnabled();

    try {
      controller.restoreLoopState(savedLoop);
      loopFeature.enable();
      ownsLoopState = true;
    } catch (error: unknown) {
      try {
        controller.restoreLoopState(previousLoop);
      } catch (cleanupError: unknown) {
        throw new AggregateError([error, cleanupError], "[PlayerLoopFeature] Setup and rollback failed");
      }
      throw error;
    }
  },

  disable(): void {
    loopFeature.disable();
  },

  isActive(): boolean {
    return loopFeature.isActive();
  }
});
