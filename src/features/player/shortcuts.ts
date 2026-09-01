import { PlayerController } from "./controller";
import { ShortcutDispatcher } from "../../core/shortcuts";

export class PlayerShortcuts {
  private static shortcutCleanups: (() => void)[] = [];
  private static isEnabled: boolean = false;

  public static enable(): void {
    if (this.isEnabled) {
      return;
    }
    this.disable();
    this.isEnabled = true;

    const player = PlayerController.getInstance();

    const unbindSpeedUp = ShortcutDispatcher.register({
      key: ">",
      shiftKey: true,
      description: "Increase playback speed",
      handler: () => {
        player.increaseSpeed();
      }
    });

    const unbindSpeedDown = ShortcutDispatcher.register({
      key: "<",
      shiftKey: true,
      description: "Decrease playback speed",
      handler: () => {
        player.decreaseSpeed();
      }
    });

    const unbindResetSpeed = ShortcutDispatcher.register({
      key: "r",
      shiftKey: true,
      description: "Reset playback speed to 1.0x",
      handler: () => {
        player.resetSpeed();
      }
    });

    const unbindScreenshot = ShortcutDispatcher.register({
      key: "s",
      shiftKey: true,
      description: "Capture screenshot",
      handler: () => {
        player.captureScreenshot().catch((err: unknown) => {
          console.error("[PlayerShortcuts] Screenshot error:", err);
        });
      }
    });

    const unbindPiP = ShortcutDispatcher.register({
      key: "p",
      shiftKey: true,
      description: "Toggle Picture-in-Picture",
      handler: () => {
        player.togglePictureInPicture().catch((err: unknown) => {
          console.error("[PlayerShortcuts] PiP error:", err);
        });
      }
    });

    const unbindLoop = ShortcutDispatcher.register({
      key: "l",
      shiftKey: true,
      description: "Toggle Loop playback",
      handler: () => {
        player.toggleLoop();
      }
    });

    this.shortcutCleanups.push(
      unbindSpeedUp,
      unbindSpeedDown,
      unbindResetSpeed,
      unbindScreenshot,
      unbindPiP,
      unbindLoop
    );
  }

  public static disable(): void {
    this.isEnabled = false;
    this.shortcutCleanups.forEach((cleanup: () => void) => {
      try {
        cleanup();
      } catch (e: unknown) {
        console.error("[PlayerShortcuts] cleanup error:", e);
      }
    });
    this.shortcutCleanups = [];
  }
}
