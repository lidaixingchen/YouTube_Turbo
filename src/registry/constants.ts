export const DEFAULT_FEATURE_ORDER = 100;

export const FEATURE_REGISTRY_CONSTANTS = {
  DEFAULT_ORDER: DEFAULT_FEATURE_ORDER,
  STORAGE_RETRY_LIMIT: 1,
  VISIBILITY: {
    CHANGE_EVENT: "visibilitychange",
    VISIBLE_STATE: "visible"
  },
  I18N_KEYS: {
    STATUS_STARTING: "status_starting",
    STATUS_STOPPING: "status_stopping",
    STATUS_ENABLED: "status_enabled",
    STATUS_DISABLED: "status_disabled",
    STATUS_ERROR: "status_error",
    STATUS_LOADING_SETTINGS: "status_loading_settings",
    STATUS_SETTINGS_LOAD_FAILED: "status_settings_load_failed",
    STATUS_RELOAD_REQUIRED: "status_reload_required",
    ERROR_STAGE_STORAGE: "error_stage_storage",
    ERROR_STAGE_SETUP: "error_stage_setup",
    ERROR_STAGE_TEARDOWN: "error_stage_teardown",
    ERROR_STAGE_CLEANUP: "error_stage_cleanup",
    ACTION_RETRY: "action_retry",
    ACTION_RELOAD: "action_reload",
    NOTICE_SESSION_ONLY: "notice_session_only"
  },
  STYLES: {
    SETTINGS_STYLE_ID: "yt-improvements-settings-style",
    OPACITY_ENABLED: "1",
    OPACITY_DISABLED: "0.5"
  },
  STEPPER: {
    DEFAULT_SCALE: 1,
    DEFAULT_PRECISION: 0
  }
} as const;
