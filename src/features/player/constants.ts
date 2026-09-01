export const PLAYER_CONSTANTS = {
  SELECTORS: {
    PLAYER_CONTAINER: "#movie_player, #player-container-outer .html5-video-player",
    RIGHT_CONTROLS: ".ytp-right-controls",
    SPEED_BUTTON: ".yt-turbo-speed-btn",
    SPEED_OPTIONS_MENU: "#yt-turbo-speed-options"
  },
  CLASSES: {
    SPEED_BUTTON: "ytp-button yt-turbo-speed-btn",
    SPEED_OPTIONS_MENU: "yt-turbo-speed-options-menu",
    SPEED_OPTION_ITEM: "yt-turbo-speed-option-item",
    SPEED_OPTION_ITEM_ACTIVE: "yt-turbo-speed-option-item-active"
  },
  STYLES: {
    SPEED_CONTROL_STYLE_ID: "yt-turbo-speed-control",
    SPEED_BTN_CSS: `
      .yt-turbo-speed-btn {
        width: 4em !important;
        float: left;
        text-align: center !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        border-radius: 0.5em !important;
        font-size: 14px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        user-select: none !important;
      }
      .yt-turbo-speed-btn:hover {
        color: #ff0000 !important;
        font-weight: bold;
      }
    `,
    SPEED_OPTIONS_CSS: `
      .yt-turbo-speed-options-menu {
        position: absolute !important;
        background: rgba(0, 0, 0, 0.8) !important;
        backdrop-filter: blur(4px) !important;
        color: #ffffff !important;
        border-radius: 8px !important;
        box-sizing: border-box !important;
        z-index: 999999999999 !important;
        padding: 8px 6px !important;
        font-weight: bold !important;
        display: none;
        min-width: 64px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
      }
      .yt-turbo-speed-options-menu > .yt-turbo-speed-option-item {
        cursor: pointer !important;
        height: 26px !important;
        line-height: 26px !important;
        font-size: 12px !important;
        text-align: center !important;
        border-radius: 4px !important;
        transition: background 0.15s ease, color 0.15s ease !important;
        user-select: none !important;
      }
      .yt-turbo-speed-options-menu > .yt-turbo-speed-option-item-active,
      .yt-turbo-speed-options-menu > .yt-turbo-speed-option-item:hover {
        color: #ff0000 !important;
        background: rgba(255, 255, 255, 0.15) !important;
      }
    `
  },
  PRESET_SPEEDS: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0],
  MENU_HIDE_DELAY_MS: 150,
  MENU_BOTTOM_OFFSET_PX: 8,
  MENU_ESTIMATED_WIDTH_PX: 64
} as const;
