export const MODAL_CONSTANTS = Object.freeze({
  Z_INDEX_BACKDROP: 2147483640,
  Z_INDEX_MODAL: 2147483641,
  STYLE_ELEMENT_ID: "yt-improvements-modal-style",
  FOCUSABLE_SELECTOR:
    'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, object, embed, [contenteditable="true"], [tabindex]',
  FOCUSABLE_DISABLED_SELECTOR: ":disabled",
  FOCUSABLE_HIDDEN_ANCESTOR_SELECTOR: "[hidden], [inert], [aria-hidden='true']",
  BODY_SELECTOR: ".yt-modal-body",
  TITLE_ID_PREFIX: "yt-improvements-modal-title-",
  DEFAULT_TITLE_I18N_KEY: "function_setting_title",
  FOCUS_CONTAINER_TAB_INDEX: -1,
  FOCUSABLE_TAB_INDEX_MIN: 0,
  FOCUSABLE_HIDDEN_DISPLAY: "none",
  FOCUSABLE_HIDDEN_VISIBILITY: ["hidden", "collapse"] as readonly string[],
  DIALOG_ROLE: "dialog",
  ARIA_MODAL_ACTIVE_VALUE: "true",
  ARIA_MODAL_INACTIVE_VALUE: "false",
  CLOSE_LABEL_I18N_KEY: "modal_close",
  CANCEL_LABEL_I18N_KEY: "download_cancel_text",
  CONFIRM_LABEL_I18N_KEY: "download_enter_text",
  KEY_ESCAPE: "Escape",
  KEY_TAB: "Tab"
});
