export const TABVIEW_CONSTANTS = {
  VAL_ROUNDED_A1: 12,
  SOURCE_URL_SCRIPT: "debug://tabview-youtube/tabview.page.js",
  SOURCE_URL_CSS: "debug://tabview-youtube/tabview.main.css",
  STYLE_ID_MAIN: "tabview-main",
  STORAGE_KEY_ACTIVE_TAB: "tabview.activeTab",
  STORAGE_KEY_FONT_SIZES: "tabview.fontSizes",
  PROTOCOL_NAMESPACE: "youtube-turbo.tabview",
  PROTOCOL_VERSION: "1.2.0",
  CHANNEL_EVENT_NAME: "__YTI_TABVIEW_CHANNEL_EVENT__",
  READY_TIMEOUT_MS: 5000,
  QUEUE_CAPACITY_LIMIT: 100,
  INITIAL_SEQUENCE: 1,
  FONT_SIZE_MIN: 10,
  FONT_SIZE_MAX: 24
} as const;
