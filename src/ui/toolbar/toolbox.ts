import { Toolbar } from "./toolbar";
import { TOOLBAR_CONSTANTS } from "./constants";
import { FeatureRegistry } from "../../registry/feature-registry";

export const ToolBox = {
  getFunctionState: (): Record<string, boolean> => FeatureRegistry.getAllStates(),
  insertStyle: (): void => Toolbar.insertStyle(),
  genrateBox: (): void => Toolbar.mount(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS),
  genrateShorts: (): void => Toolbar.mount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS),
  genrateOuterBox: (): void => Toolbar.mount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA),
  downloadVideo: (): Promise<void> => Toolbar.downloadCurrentVideo(),
  showSettingDialog: (): void => FeatureRegistry.openSettingsModal(),
  run: (): Promise<void> => Toolbar.init()
};
