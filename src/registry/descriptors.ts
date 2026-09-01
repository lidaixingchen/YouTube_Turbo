import type { FeatureDescriptor } from "../types";
import { Tabview } from "../features/tabview";
import { FourColumnGrid } from "../features/grid";
import { ThemeProgressbar } from "../features/theme";
import { Toolbar, TOOLBAR_CONSTANTS } from "../ui/toolbar";
import { PlayerSpeedButtonView, PlayerShortcuts } from "../features/player";
import { MarkOrRemoveAd } from "../features/adblock";
import { CaptionController } from "../features/caption";

export const defaultFeatureDescriptors: FeatureDescriptor[] = [
  {
    id: "isOpenCommentTable",
    i18nKey: "function_is_comment_table_open",
    defaultValue: true,
    order: 10,
    requiresReload: true,
    setup: () => Tabview.setup(),
    teardown: () => Tabview.destroy()
  },
  {
    id: "isOpenFourColumnGrid",
    i18nKey: "function_is_four_column_grid_open",
    defaultValue: true,
    order: 20,
    setup: () => FourColumnGrid.run(),
    teardown: () => FourColumnGrid.destroy()
  },
  {
    id: "isOpenThemeProgressBar",
    i18nKey: "function_is_theme_progress_bar_open",
    defaultValue: true,
    order: 30,
    setup: () => ThemeProgressbar.start(),
    teardown: () => ThemeProgressbar.destroy()
  },
  {
    id: "isOpenYoutubedownloading",
    i18nKey: "function_is_youtube_downloading_open",
    defaultValue: true,
    order: 40,
    setup: () => {
      Toolbar.mount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
      Toolbar.mount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
    },
    teardown: () => {
      Toolbar.unmount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
      Toolbar.unmount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
    }
  },
  {
    id: "isOpenSpeedControl",
    i18nKey: "function_is_speed_control_open",
    defaultValue: true,
    order: 50,
    setup: () => {
      PlayerSpeedButtonView.mount();
      PlayerShortcuts.enable();
    },
    teardown: () => {
      PlayerSpeedButtonView.unmount();
      PlayerShortcuts.disable();
    }
  },
  {
    id: "isOpenMarkOrRemoveAd",
    i18nKey: "function_is_mark_or_remove_ad_open",
    defaultValue: true,
    order: 60,
    setup: () => MarkOrRemoveAd.run(),
    teardown: () => MarkOrRemoveAd.destroy()
  },
  {
    id: "isOpenSubtitleOffset",
    i18nKey: "function_is_subtitle_offset_open",
    defaultValue: true,
    order: 70,
    setup: () => CaptionController.getInstance().init(),
    teardown: () => CaptionController.getInstance().destroy(),
    renderExtraConfig: (container, language) => CaptionController.getInstance().renderSettingsConfig(container, language)
  }
];
