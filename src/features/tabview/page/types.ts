import type { TabKey, LocaleSnapshot } from "../types";

export type { TabKey, LocaleSnapshot };

export type PageType = "watch" | "shorts" | "channel" | "home" | "unknown";

export interface NavigationState {
  pageType: PageType;
  videoId: string | null;
  playlistId: string | null;
  isTheater: boolean;
  isLiveStream: boolean;
}

declare const routeGenerationBrand: unique symbol;

export type RouteGeneration = number & {
  readonly [routeGenerationBrand]: true;
};

export type IdempotentDisposer = () => void;

export interface WatchRouteContext {
  readonly generation: RouteGeneration;
  readonly state: Readonly<NavigationState>;
  readonly flexy: HTMLElement;
}

export interface PolymerSemanticHooks {
  readonly onChatAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onPlaylistAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onCommentsAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onEngagementPanelAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onCommentEntryAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onMetadataAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onRelatedAttached: (element: HTMLElement) => void;
  readonly onCommentsHeaderDataChanged: (element: HTMLElement) => void;
}

export interface TabviewPanelStateCallbacks {
  readonly onPlaylistAvailabilityChanged: (
    isAvailable: boolean
  ) => void;

  readonly onCommentsAvailabilityChanged: (
    isAvailable: boolean
  ) => void;
}

export interface ExpanderRouteContext {
  readonly generation: RouteGeneration;
  readonly rightTabs: HTMLElement;
  readonly initialTab: TabKey;
}

export interface RelocatorRouteOptions {
  readonly generation: RouteGeneration;
  readonly secondaryInner: HTMLElement;
  readonly tabsOptions: TabsViewOptions;
}


export interface RelocationSlot {
  tabKey: TabKey;
  sourceSelector: string;
  targetContainerSelector: string;
  placeholderClass: string;
}

export interface LcCommentResult {
  lc: string;
  commentRendererElm: HTMLElement;
}

export interface ContentsRendererLocation {
  parent: HTMLElement;
  index: number;
}

export type AnyFunction = (...args: unknown[]) => unknown;

export interface PrototypePatchDescriptor {
  elementTag: string;
  methodName: string;
  patchFactory: (originalMethod: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown;
}

export interface TabsViewOptions {
  localeSnapshot: LocaleSnapshot;
  onTabSelected: (tabKey: TabKey) => void;
  onFontSizeChanged: (tabKey: TabKey, delta: number) => void;
}

export interface PolymerControllerPrototype {
  [methodName: string]: ((...args: unknown[]) => unknown) | unknown;
}

export interface PolymerElementInstance {
  polymerController?: PolymerElementInstance | null;
  inst?: PolymerElementInstance | null;
  data?: Record<string, unknown>;
  hostElement?: HTMLElement;
  constructor: {
    prototype?: PolymerControllerPrototype;
  };
  content?: HTMLElement;
  $?: {
    content?: HTMLElement;
    chatframe?: HTMLIFrameElement;
    [key: string]: unknown;
  };
  chatframe?: HTMLIFrameElement;
  canToggle?: boolean;
  shouldUseNumberOfLines?: boolean;
  alwaysCollapsed?: boolean;
  collapsed?: boolean;
  isToggled?: boolean;
  alwaysToggleable?: boolean;
  collapsedHeight?: number;
  videoId?: string;
  isAttached?: boolean;
  hidden?: boolean;
  showCollapseButton?: boolean;
  showExpandButton?: boolean;
  expandButton?: HTMLElement | null;
  isExpanded?: boolean;
  isResetMutation?: boolean;
  collapseLabel?: string;
  calculateCanCollapse?: (force?: boolean) => void;
  resize?: (flag?: boolean) => void;
  updateStyles?: () => void;
  notifyResize?: () => void;
  updatePageMediaQueries?: () => void;
  schedulePlayerSizeUpdate_?: () => void;
  updateIsAttributedExpanded?: () => void;
  updateIsFormattedExpanded?: () => void;
  updateTextOnSnippetTypeChange?: () => void;
  set?: (key: string, value: unknown) => void;
  notifyPath?: (path: string) => void;
  isExpandedChanged?: () => void;
  isTwoColumnsChanged_?: (arg1: unknown, arg2: unknown, ...args: unknown[]) => unknown;
  defaultTwoColumnLayoutChanged?: (...args: unknown[]) => unknown;
  updatePlayerLocation?: (...args: unknown[]) => unknown;
  updateCinematicsLocation?: (...args: unknown[]) => unknown;
  updatePanelsLocation?: (...args: unknown[]) => unknown;
  swatcherooUpdatePanelsLocation?: (...args: unknown[]) => unknown;
  updateErrorScreenLocation?: (...args: unknown[]) => unknown;
  updateFullBleedElementLocations?: (...args: unknown[]) => unknown;
  updateChatLocation?: (...args: unknown[]) => unknown;
  _createPropertyObserver?: (property: string, observerMethod: string, options?: unknown) => void;
  signalProxy?: {
    signalCache?: {
      data?: {
        setWithPath?: (...args: unknown[]) => unknown;
        __patched?: boolean;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  is?: string;
  [key: string]: unknown;
}

export interface WebCommandMetadata {
  url?: string;
  webPageType?: string;
  rootVe?: number;
}

export interface WatchEndpoint {
  videoId?: string;
  playlistId?: string;
  index?: number;
  params?: string;
  playerParams?: string;
}

export interface BrowseEndpoint {
  browseId?: string;
  params?: string;
  canonicalBaseUrl?: string;
}

export interface NavigationEndpoint {
  commandMetadata?: {
    webCommandMetadata?: WebCommandMetadata;
  };
  watchEndpoint?: WatchEndpoint;
  browseEndpoint?: BrowseEndpoint;
  searchEndpoint?: Record<string, unknown>;
  urlEndpoint?: { url: string };
}

export interface AppNavigateRequest {
  command?: NavigationEndpoint;
  endpoint?: NavigationEndpoint;
  navigationEndpoint?: NavigationEndpoint;
}
