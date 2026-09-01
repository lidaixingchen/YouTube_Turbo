import { setupConfigHacks } from "./core/config-hacks";
import { Toolbar, TOOLBAR_CONSTANTS } from "./ui/toolbar";
import { FeatureRegistry, defaultFeatureDescriptors } from "./registry";
import { PlayerController } from "./features/player";
import { ThemeController } from "./features/theme";
import { VideoDownloadService } from "./features/download";
import "./core/trusted-types";

setupConfigHacks();

(async () => {
  if (!/youtube\.com/.test(window.location.host)) {
    return;
  }
  PlayerController.getInstance().init();
  ThemeController.getInstance().init();
  VideoDownloadService.init();

  Toolbar.registerAction({
    id: "setting",
    slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    titleKey: "action_setting",
    defaultTitle: "Setting",
    icon: "setting",
    order: 10,
    onClick: () => {
      FeatureRegistry.openSettingsModal();
    }
  });

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Setting", () => {
      FeatureRegistry.openSettingsModal();
    });
  }

  Toolbar.init();
  FeatureRegistry.registerAll(defaultFeatureDescriptors);
  await FeatureRegistry.initAll();
})();
