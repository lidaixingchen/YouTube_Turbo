import { APPLICATION_STARTUP_CONSTANTS } from "./constants";
import { setupConfigHacks } from "./config-hacks";
import { FeatureRegistry, defaultFeatureDescriptors } from "../registry";
import { Locale } from "../i18n";
import { ThemeController } from "../features/theme";
import { Toolbar, TOOLBAR_CONSTANTS } from "../ui/toolbar";
import "./trusted-types";

export async function bootstrapApplication(): Promise<void> {
  setupConfigHacks();

  if (!/youtube\.com/.test(window.location.host)) {
    return;
  }

  const openSettings = (): void => {
    FeatureRegistry.openSettingsModal();
  };
  const settingsLabel: string = Locale.t("action_setting");

  Toolbar.registerAction({
    id: APPLICATION_STARTUP_CONSTANTS.SETTINGS_ACTION_ID,
    slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    titleKey: "action_setting",
    defaultTitle: settingsLabel,
    icon: APPLICATION_STARTUP_CONSTANTS.SETTINGS_ACTION_ICON,
    order: APPLICATION_STARTUP_CONSTANTS.SETTINGS_ACTION_ORDER,
    dismissOnExecute: true,
    onClick: openSettings
  });

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand(settingsLabel, openSettings);
  }

  ThemeController.getInstance().init();
  Toolbar.init();
  FeatureRegistry.registerAll(defaultFeatureDescriptors);
  await FeatureRegistry.initAll();
}
