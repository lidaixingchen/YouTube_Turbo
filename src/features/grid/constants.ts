export const GRID_CONSTANTS = {
  FEED_CONTAINER_SELECTOR: "ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer",
  DEBOUNCE_DELAY_MS: 100,
  BREAKPOINTS: {
    WIDE_DESKTOP: 1100,
    DESKTOP: 850,
    TABLET: 550
  },
  COLUMNS: {
    FOUR: 4,
    THREE: 3,
    TWO: 2,
    ONE: 1
  },
  SLIM_COLUMNS: {
    SIX: 6,
    FIVE: 5,
    THREE: 3,
    TWO: 2
  },
  ITEM_MARGIN_PX: 16,
  ANCHOR_TEXT: "yt-turbo-grid-anchor",
  NODE_NAMES: {
    ITEM: "YTD-RICH-ITEM-RENDERER",
    SECTION: "YTD-RICH-SECTION-RENDERER"
  },
  DATA_ATTRS: {
    REBALANCED: "data-yt-turbo-rebalanced"
  },
  HOST_CONTAINER_SELECTOR: "#primary, ytd-browse[page-subtype='home'], ytd-browse"
} as const;
