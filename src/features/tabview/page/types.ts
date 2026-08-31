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

export type ObserverType = "mutation" | "resize" | "intersection";

export interface MutationObserverConfig {
  id: string;
  type: "mutation";
  getTarget: () => Node | null;
  options: MutationObserverInit;
  callback: MutationCallback;
}

export interface ResizeObserverConfig {
  id: string;
  type: "resize";
  getTarget: () => Element | null;
  callback: ResizeObserverCallback;
}

export interface IntersectionObserverConfig {
  id: string;
  type: "intersection";
  getTarget: () => Element | null;
  options?: IntersectionObserverInit;
  callback: IntersectionObserverCallback;
}

export type ObserverConfig =
  | MutationObserverConfig
  | ResizeObserverConfig
  | IntersectionObserverConfig;

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
