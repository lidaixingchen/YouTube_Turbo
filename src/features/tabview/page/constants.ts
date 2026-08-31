export const PAGE_CONSTANTS = {
  SELECTORS: {
    RIGHT_TABS: "#right-tabs",
    MATERIAL_TABS: "#material-tabs",
    TAB_INFO_CONTAINER: "#tab-info",
    TAB_COMMENTS_CONTAINER: "#tab-comments",
    TAB_VIDEOS_CONTAINER: "#tab-videos",
    TAB_PLAYLIST_CONTAINER: "#tab-list",
    TAB_CONTENT_WRAPPER: ".tab-content",
    TAB_CONTENT_CHILDREN: ".tab-content-cld",
    TAB_ACTIVE_CONTENT: ".tab-content-cld:not(.tab-content-hidden)",
    COMMENT_COUNT_BADGE: "#tyt-cm-count",
    YTD_WATCH_FLEXY: "ytd-watch-flexy",
    PRIMARY_INNER: "#primary-inner",
    SECONDARY_INNER: "#secondary-inner",
    COMMENTS_SECTION: "ytd-comments#comments",
    RELATED_SECTION: "#related",
    WATCH_METADATA: "ytd-watch-metadata",
    EXPANDABLE_DESCRIPTION: "ytd-expandable-video-description-body-renderer",
    TEXT_INLINE_EXPANDER: "ytd-text-inline-expander",
    COMMENTS_HEADER_RENDERER: "ytd-comments-header-renderer",
    LIVE_CHAT_FRAME: "ytd-live-chat-frame#chat",
    PLAYLIST_PANEL: "ytd-playlist-panel-renderer",
    ENGAGEMENT_PANEL: "ytd-engagement-panel-section-list-renderer",
    SIZE_BUTTON: "ytd-watch-flexy #ytd-player button.ytp-size-button"
  },
  CLASSES: {
    TAB_BTN: "tab-btn",
    TAB_BTN_ACTIVE: "tab-btn-active",
    TAB_BTN_HIDDEN: "tab-btn-hidden",
    TAB_CONTENT_CLD: "tab-content-cld",
    TAB_CONTENT_HIDDEN: "tab-content-hidden",
    FONT_SIZE_RIGHT: "font-size-right",
    FONT_SIZE_BTN: "font-size-btn",
    FONT_SIZE_PLUS: "font-size-plus",
    FONT_SIZE_MINUS: "font-size-minus",
    PLACEHOLDER_ANCHOR: "tyt-relocator-anchor"
  },
  ATTRIBUTES: {
    TYT_DI: "tyt-di",
    TYT_TAB_CONTENT: "tyt-tab-content",
    TYT_HIDDEN: "tyt-hidden",
    USERSCRIPT_SCROLLBAR: "userscript-scrollbar-render",
    THEATER: "theater",
    COLLAPSED: "collapsed",
    TABVIEW_LOADED: "tabview-loaded"
  },
  FONT_SIZE: {
    MIN_PX: 10,
    MAX_PX: 28,
    STEP_PX: 1,
    DEFAULT_PX: 14
  },
  SVG: {
    COMMENTS: `<path d="M80 27H12A12 12 90 0 0 0 39v42a12 12 90 0 0 12 12h12v20a2 2 90 0 0 3.4 2L47 93h33a12 12 90 0 0 12-12V39a12 12 90 0 0-12-12zM20 47h26a2 2 90 1 1 0 4H20a2 2 90 1 1 0-4zm52 28H20a2 2 90 1 1 0-4h52a2 2 90 1 1 0 4zm0-12H20a2 2 90 1 1 0-4h52a2 2 90 1 1 0 4zm36-58H40a12 12 90 0 0-12 12v6h52c9 0 16 7 16 16v42h0v4l7 7a2 2 90 0 0 3-1V71h2a12 12 90 0 0 12-12V17a12 12 90 0 0-12-12z"/>`,
    VIDEOS: `<path d="M89 10c0-4-3-7-7-7H7c-4 0-7 3-7 7v70c0 4 3 7 7 7h75c4 0 7-3 7-7V10zm-62 2h13v10H27V12zm-9 66H9V68h9v10zm0-56H9V12h9v10zm22 56H27V68h13v10zm-3-25V36c0-2 2-3 4-2l12 8c2 1 2 4 0 5l-12 8c-2 1-4 0-4-2zm25 25H49V68h13v10zm0-56H49V12h13v10zm18 56h-9V68h9v10zm0-56h-9V12h9v10z"/>`,
    INFO: `<path d="M30 0C13.3 0 0 13.3 0 30s13.3 30 30 30 30-13.3 30-30S46.7 0 30 0zm6.2 46.6c-1.5.5-2.6 1-3.6 1.3a10.9 10.9 0 0 1-3.3.5c-1.7 0-3.3-.5-4.3-1.4a4.68 4.68 0 0 1-1.6-3.6c0-.4.2-1 .2-1.5a20.9 20.9 90 0 1 .3-2l2-6.8c.1-.7.3-1.3.4-1.9a8.2 8.2 90 0 0 .3-1.6c0-.8-.3-1.4-.7-1.8s-1-.5-2-.5a4.53 4.53 0 0 0-1.6.3c-.5.2-1 .2-1.3.4l.6-2.1c1.2-.5 2.4-1 3.5-1.3s2.3-.6 3.3-.6c1.9 0 3.3.6 4.3 1.3s1.5 2.1 1.5 3.5c0 .3 0 .9-.1 1.6a10.4 10.4 90 0 1-.4 2.2l-1.9 6.7c-.2.5-.2 1.1-.4 1.8s-.2 1.3-.2 1.6c0 .9.2 1.6.6 1.9s1.1.5 2.1.5a6.1 6.1 90 0 0 1.5-.3 9 9 90 0 0 1.4-.4l-.6 2.2zm-3.8-35.2a1 1 0 010 8.6 1 1 0 010-8.6z"/>`,
    PLAYLIST: `<path d="M0 3h12v2H0zm0 4h12v2H0zm0 4h8v2H0zm16 0V7h-2v4h-4v2h4v4h2v-4h4v-2z"/>`
  },
  DOM_EVENTS: {
    YT_NAVIGATE_FINISH: "yt-navigate-finish",
    YT_NAVIGATE_START: "yt-navigate-start",
    YT_PAGE_TYPE_CHANGED: "yt-page-type-changed",
    YT_ACTION: "yt-action"
  }
} as const;
