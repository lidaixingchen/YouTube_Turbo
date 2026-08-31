import progressBarCss from "./progress-bar.css?raw";
import { StyleEngine } from "../../core/style-engine";

export const ThemeProgressbar = {
  start(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    StyleEngine.inject("theme-progressbar", progressBarCss);
  },

  destroy(): void {
    StyleEngine.remove("theme-progressbar");
  }
};
