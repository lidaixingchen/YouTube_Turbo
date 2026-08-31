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
  ITEM_MARGIN_PX: 16
} as const;
