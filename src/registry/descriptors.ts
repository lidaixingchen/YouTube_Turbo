import type { FeatureDescriptor } from "../types";
import { Tabview } from "../features/tabview";
import { GridCoordinator } from "../features/grid";
import { ThemeController } from "../features/theme";
import { VideoDownloadService } from "../features/download";
import { PlayerController, PlayerSpeedButtonView } from "../features/player";
import { MarkOrRemoveAd } from "../features/adblock";
import { CaptionController, SUBTITLE_CONSTANTS } from "../features/caption";

export const defaultFeatureDescriptors: FeatureDescriptor[] = [
  {
    id: "isOpenCommentTable",
    i18nKey: "function_is_comment_table_open",
    titleI18nKey: "feature_comment_table_title",
    descI18nKey: "feature_comment_table_desc",
    defaultValue: true,
    order: 10,
    requiresReload: true,
    setup: () => Tabview.setup(),
    teardown: () => Tabview.destroy()
  },
  {
    id: "isOpenFourColumnGrid",
    i18nKey: "function_is_four_column_grid_open",
    titleI18nKey: "feature_four_column_grid_title",
    descI18nKey: "feature_four_column_grid_desc",
    defaultValue: true,
    order: 20,
    setup: () => GridCoordinator.getInstance().init(),
    teardown: () => GridCoordinator.getInstance().destroy()
  },
  {
    id: "isOpenThemeProgressBar",
    i18nKey: "function_is_theme_progress_bar_open",
    titleI18nKey: "feature_theme_progress_bar_title",
    descI18nKey: "feature_theme_progress_bar_desc",
    defaultValue: true,
    order: 30,
    setup: () => ThemeController.getInstance().enableProgressBar(),
    teardown: () => ThemeController.getInstance().disableProgressBar()
  },
  {
    id: "isOpenYoutubedownloading",
    i18nKey: "function_is_youtube_downloading_open",
    titleI18nKey: "feature_youtube_downloading_title",
    descI18nKey: "feature_youtube_downloading_desc",
    defaultValue: true,
    order: 40,
    setup: () => VideoDownloadService.enable(),
    teardown: () => VideoDownloadService.disable()
  },
  {
    id: "isOpenSpeedControl",
    i18nKey: "function_is_speed_control_open",
    titleI18nKey: "feature_speed_control_title",
    descI18nKey: "feature_speed_control_desc",
    defaultValue: true,
    order: 50,
    setup: () => {
      PlayerController.getInstance().enableSpeedControl();
      PlayerSpeedButtonView.mount();
    },
    teardown: () => {
      PlayerController.getInstance().disableSpeedControl();
      PlayerSpeedButtonView.unmount();
    }
  },
  {
    id: "isOpenMarkOrRemoveAd",
    i18nKey: "function_is_mark_or_remove_ad_open",
    titleI18nKey: "feature_mark_or_remove_ad_title",
    descI18nKey: "feature_mark_or_remove_ad_desc",
    defaultValue: true,
    order: 60,
    setup: () => MarkOrRemoveAd.run(),
    teardown: () => MarkOrRemoveAd.destroy()
  },
  {
    id: "isOpenSubtitleOffset",
    i18nKey: "function_is_subtitle_offset_open",
    titleI18nKey: "feature_subtitle_offset_title",
    descI18nKey: "feature_subtitle_offset_desc",
    defaultValue: true,
    order: 70,
    setup: () => CaptionController.getInstance().init(),
    teardown: () => CaptionController.getInstance().destroy(),
    extraFields: [
      {
        type: "stepper",
        key: "subtitleOffset",
        titleI18nKey: "subtitle_global_offset_title",
        descI18nKey: "subtitle_global_offset_desc",
        unitI18nKey: "subtitle_offset_unit",
        badgeText: "Alt+[ / ] / \\",
        step: SUBTITLE_CONSTANTS.STEP_OFFSET_MS,
        min: SUBTITLE_CONSTANTS.MIN_OFFSET_MS,
        max: SUBTITLE_CONSTANTS.MAX_OFFSET_MS,
        scale: SUBTITLE_CONSTANTS.MS_PER_SECOND,
        defaultValue: SUBTITLE_CONSTANTS.DEFAULT_OFFSET_MS,
        precision: SUBTITLE_CONSTANTS.DECIMAL_PRECISION,
        fallbackUnit: "s",
        resetI18nKey: "subtitle_offset_reset_btn",
        getValue: () => CaptionController.getInstance().getGlobalDefaultOffsetMs(),
        setValue: (offsetMs: number) => CaptionController.getInstance().setGlobalDefaultOffset(offsetMs)
      }
    ]
  }
];
