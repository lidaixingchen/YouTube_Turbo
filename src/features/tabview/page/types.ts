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

export interface PolymerElementInstance {
  polymerController?: unknown;
  inst?: unknown;
  [key: string]: unknown;
}
