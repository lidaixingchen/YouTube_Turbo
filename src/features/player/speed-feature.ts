import { PlayerController } from "./controller";
import { PlayerSpeedButtonView } from "./speed-button-view";

let isEnabled: boolean = false;

function teardownSafely(): void {
  try {
    PlayerSpeedButtonView.unmount();
  } catch (error: unknown) {
    console.error("[PlayerSpeedFeature] Failed to unmount speed view:", error);
  }

  try {
    PlayerController.getInstance().disableSpeedControl();
  } catch (error: unknown) {
    console.error("[PlayerSpeedFeature] Failed to disable speed control:", error);
  }
}

export const PlayerSpeedFeature: Readonly<{
  readonly enable: () => void;
  readonly disable: () => void;
  readonly isActive: () => boolean;
}> = Object.freeze({
  enable(): void {
    if (isEnabled) {
      return;
    }

    try {
      PlayerController.getInstance().enableSpeedControl();
      PlayerSpeedButtonView.mount();
      isEnabled = true;
    } catch (error: unknown) {
      isEnabled = false;
      teardownSafely();
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
