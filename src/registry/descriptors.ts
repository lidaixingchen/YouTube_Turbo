import type { FeatureDescriptor } from "../types";
import { Tabview } from "../features/tabview";
import { GridCoordinator } from "../features/grid";
import { ThemeController } from "../features/theme";
import { VideoDownloadService } from "../features/download";
import { PlayerController } from "../features/player";
import { MarkOrRemoveAd } from "../features/adblock";
import { CaptionController } from "../features/caption";

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
    setup: () => PlayerController.getInstance().enableSpeedControl(),
    teardown: () => PlayerController.getInstance().disableSpeedControl()
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
    renderExtraConfig: (container, language) => CaptionController.getInstance().renderSettingsConfig(container, language)
  }
];
