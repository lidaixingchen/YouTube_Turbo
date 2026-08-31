import type { LocaleContent } from "../../types";

export type TabKey = "info" | "comments" | "videos" | "playlist";

export interface LocaleSnapshot {
  locale: string;
  direction?: "rtl" | "ltr";
  messages: LocaleContent;
}

export type TabviewBridgeCommand =
  | { type: "TABVIEW_SET_ACTIVE_TAB"; payload: { tabKey: TabKey } }
  | { type: "TABVIEW_SET_FONT_SIZE"; payload: { tabKey: TabKey; fontSize: number } }
  | { type: "TABVIEW_LOCALE_UPDATED"; payload: { snapshot: LocaleSnapshot } }
  | { type: "TABVIEW_TEARDOWN"; payload?: Record<string, never> };

export type TabviewBridgeEvent =
  | { type: "TABVIEW_TAB_CHANGED"; payload: { tabKey: TabKey } }
  | { type: "TABVIEW_FONT_SIZE_UPDATED"; payload: { tabKey: TabKey; fontSize: number } }
  | { type: "TABVIEW_READY"; payload: { version: string } };
