import { ShortcutDispatcher } from "../../core/shortcuts";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { type FeatureFacade } from "./feature-factory";
import { PlayerSpeedButtonView } from "./speed-button-view";

let isEnabled: boolean = false;
let shortcutCleanups: Array<() => void> = [];

function teardownSafely(): void {
  try {
    PlayerSpeedButtonView.unmount();
  } catch (error: unknown) {
    console.error("[PlayerSpeedFeature] Failed to unmount speed view:", error);
  }

  for (let i = shortcutCleanups.length - 1; i >= 0; i--) {
    try {
      shortcutCleanups[i]();
    } catch (err: unknown) {
      console.error("[PlayerSpeedFeature] Shortcut cleanup error:", err);
    }
  }
  shortcutCleanups = [];
}

export const PlayerSpeedFeature: FeatureFacade = Object.freeze({
  enable(): void {
    if (isEnabled) {
      return;
    }

    const acquiredCleanups: Array<() => void> = [];

    try {
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_UP.KEY,
          shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_UP.SHIFT,
          description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_UP.DESCRIPTION,
          handler: (): void => {
            PlayerController.getInstance().increaseSpeed();
          }
        })
      );
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_DOWN.KEY,
          shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_DOWN.SHIFT,
          description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_DOWN.DESCRIPTION,
          handler: (): void => {
            PlayerController.getInstance().decreaseSpeed();
          }
        })
      );
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_RESET.KEY,
          shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_RESET.SHIFT,
          description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_RESET.DESCRIPTION,
          handler: (): void => {
            PlayerController.getInstance().resetSpeed();
          }
        })
      );

      PlayerSpeedButtonView.mount();
      shortcutCleanups = acquiredCleanups;
      isEnabled = true;
    } catch (error: unknown) {
      try {
        PlayerSpeedButtonView.unmount();
      } catch (e: unknown) {
        console.error("[PlayerSpeedFeature] Rollback view unmount error:", e);
      }
      for (let i = acquiredCleanups.length - 1; i >= 0; i--) {
        try {
          acquiredCleanups[i]();
        } catch (e: unknown) {
          console.error("[PlayerSpeedFeature] Rollback shortcut cleanup error:", e);
        }
      }
      isEnabled = false;
      throw error;
    }
  },

  disable(): void {
    if (!isEnabled) {
      return;
    }

    isEnabled = false;
    teardownSafely();
  },

  isActive(): boolean {
    return isEnabled;
  }
});
