import { PlayerController, type ScreenshotOptions } from "./controller";

export const Screenshot = {
  start(options?: ScreenshotOptions): Promise<Blob | null> {
    return PlayerController.captureScreenshot(options);
  }
};
