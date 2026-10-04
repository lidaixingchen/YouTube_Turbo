export const TTP_POLICY_NAME = "passthrough";
export const POLL_INTERVAL_MS = 10;
export const POLL_MAX_TIMEOUT_MS = 10000;

export const DEFAULT_SPEED_STEP = 0.25;
export const MIN_PLAY_SPEED = 0.05;
export const MAX_PLAY_SPEED = 16.0;
export const DEFAULT_PLAYBACK_SPEED = 1.0;
export const PLAYBACK_RATE_EPSILON = 0.01;

export const VIDEO_RETRY_INTERVAL_MS = 50;
export const VIDEO_RETRY_MAX_TIMEOUT_MS = 3000;

export const SHORTS_ROUTE_PREFIX = "/shorts";
export const WATCH_ROUTE_PREFIX = "/watch";
export const WATCH_PAGE_CONTAINER_SELECTOR = "ytd-watch-flexy";
export const SHORTS_PAGE_CONTAINER_SELECTOR = "ytd-shorts";
export const SHORTS_ACTIVE_REEL_ATTRIBUTE = "is-active";
export const SHORTS_ACTIVE_REEL_SELECTOR = `ytd-reel-video-renderer[${SHORTS_ACTIVE_REEL_ATTRIBUTE}]`;
export const MINIPLAYER_HOST_SELECTOR = "ytd-miniplayer";
export const RETAINED_PAGE_EXCLUSION = ":not([hidden])";
export const PAGE_MANAGER_ID = "page-manager";
export const HIDDEN_ATTRIBUTE = "hidden";
export const FEATURE_STATE_STORAGE_KEY = "yt/functionState_01";

export const APPLICATION_STARTUP_CONSTANTS = {
  SETTINGS_ACTION_ID: "setting",
  SETTINGS_ACTION_ICON: "setting",
  SETTINGS_ACTION_ORDER: 10
} as const;

export const DEFAULT_VIDEO_WIDTH = 1920;
export const DEFAULT_VIDEO_HEIGHT = 1080;

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;

export const DEFAULT_SCREENSHOT_FORMAT = "image/png";
export const DEFAULT_SCREENSHOT_QUALITY = 0.95;
export const SCREENSHOT_OBJECT_URL_REVOKE_DELAY_MS = 1000;
