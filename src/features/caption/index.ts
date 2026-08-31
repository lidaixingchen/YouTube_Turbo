import { CaptionController } from "./controller";

export const SubtitleOffset = {
  run(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    CaptionController.getInstance().init();
  },

  destroy(): void {
    CaptionController.getInstance().destroy();
  },

  renderSettingsConfig(container: HTMLElement, language: any): void {
    CaptionController.getInstance().renderSettingsConfig(container, language);
  }
};

export * from "./constants";
export * from "./types";
export * from "./interceptor";
export * from "./reloader";
export * from "./controller";
