import { ShortcutDispatcher } from "../../core/shortcuts";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { type FeatureFacade } from "./feature-factory";
import { PlayerSpeedButtonView } from "./speed-button-view";

let isEnabled: boolean = false;
let isViewMounted: boolean = false;
let shortcutCleanups: Array<() => void> = [];

function teardownResources(): void {
  const errors: unknown[] = [];

  if (isViewMounted) {
    try {
      PlayerSpeedButtonView.unmount();
      isViewMounted = false;
    } catch (error: unknown) {
      errors.push(error);
    }
  }

  const remainingCleanups: Array<() => void> = [];
  for (let i: number = shortcutCleanups.length - 1; i >= 0; i--) {
    try {
      shortcutCleanups[i]();
    } catch (err: unknown) {
      errors.push(err);
      remainingCleanups.unshift(shortcutCleanups[i]);
    }
  }
  shortcutCleanups = remainingCleanups;

  if (errors.length > 0) {
    throw new AggregateError(errors, "[PlayerSpeedFeature] Teardown failed");
  }
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

      isViewMounted = true;
      PlayerSpeedButtonView.mount();
      shortcutCleanups = acquiredCleanups;
      isEnabled = true;
    } catch (error: unknown) {
      isEnabled = false;
      shortcutCleanups = acquiredCleanups;
      try {
        teardownResources();
      } catch (teardownErr: unknown) {
        throw new AggregateError([error, teardownErr], "[PlayerSpeedFeature] Setup failed and rollback also failed");
      }
      throw error;
    }
  },

  disable(): void {
    if (!isEnabled && !isViewMounted && shortcutCleanups.length === 0) {
      return;
    }

    try {
      teardownResources();
      isEnabled = false;
    } catch (err: unknown) {
      isEnabled = false;
      throw err;
    }
  },

  isActive(): boolean {
    return isEnabled;
  }
});
