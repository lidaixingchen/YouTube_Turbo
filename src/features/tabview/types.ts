import type { LocaleContent } from "../../types";
import { TABVIEW_CONSTANTS } from "./constants";

export type TabKey = "info" | "comments" | "videos" | "playlist";

export interface LocaleSnapshot {
  readonly locale: string;
  readonly direction?: "rtl" | "ltr";
  readonly messages: LocaleContent;
}

export type TabviewSessionRole = "sandbox" | "page";

declare const tabviewSessionIdBrand: unique symbol;

export type TabviewSessionId = string & {
  readonly [tabviewSessionIdBrand]: true;
};

export interface TabviewBootstrap {
  readonly namespace: typeof TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE;
  readonly protocolVersion: typeof TABVIEW_CONSTANTS.PROTOCOL_VERSION;
  readonly sessionId: TabviewSessionId;
  readonly initialLocale: LocaleSnapshot;
}

export type TabviewCommand =
  | {
      readonly type: "set-active-tab";
      readonly tabKey: TabKey;
    }
  | {
      readonly type: "set-font-size";
      readonly tabKey: TabKey;
      readonly fontSize: number;
    }
  | {
      readonly type: "update-locale";
      readonly snapshot: LocaleSnapshot;
    };

export type TabviewEvent =
  | {
      readonly type: "ready";
      readonly protocolVersion: typeof TABVIEW_CONSTANTS.PROTOCOL_VERSION;
    }
  | {
      readonly type: "tab-changed";
      readonly tabKey: TabKey;
    }
  | {
      readonly type: "font-size-changed";
      readonly tabKey: TabKey;
      readonly fontSize: number;
    };

export type TabviewInbound<R extends TabviewSessionRole> =
  R extends "sandbox" ? TabviewEvent : TabviewCommand;

export type TabviewOutbound<R extends TabviewSessionRole> =
  R extends "sandbox" ? TabviewCommand : TabviewEvent;

export type TabviewSessionState =
  | "awaiting-ready"
  | "ready"
  | "closing"
  | "closed";

export type TabviewCloseReason =
  | "feature-disabled"
  | "setup-replaced"
  | "setup-timeout"
  | "injection-failed"
  | "protocol-error"
  | "page-closed";

export type TabviewProtocolErrorCode =
  | "invalid-envelope"
  | "namespace-mismatch"
  | "version-mismatch"
  | "session-mismatch"
  | "direction-mismatch"
  | "invalid-sequence"
  | "duplicate-ready"
  | "invalid-message";

export interface TabviewProtocolError {
  readonly code: TabviewProtocolErrorCode;
  readonly cause?: unknown;
}

export interface TabviewEnvelope<T> {
  readonly namespace: typeof TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE;
  readonly protocolVersion: typeof TABVIEW_CONSTANTS.PROTOCOL_VERSION;
  readonly sessionId: TabviewSessionId;
  readonly sender: TabviewSessionRole;
  readonly target: TabviewSessionRole;
  readonly sequence: number;
  readonly body:
    | {
        readonly kind: "message";
        readonly value: T;
      }
    | {
        readonly kind: "close";
        readonly reason: TabviewCloseReason;
      };
}

export type TabviewSessionNotice<R extends TabviewSessionRole> =
  | {
      readonly kind: "message";
      readonly message: TabviewInbound<R>;
    }
  | {
      readonly kind: "closed";
      readonly reason: TabviewCloseReason;
    }
  | {
      readonly kind: "protocol-error";
      readonly error: TabviewProtocolError;
    };

export interface TabviewSessionOptions<R extends TabviewSessionRole> {
  readonly role: R;
  readonly bootstrap: TabviewBootstrap;
  readonly receive: (notice: TabviewSessionNotice<R>) => void;
}

export type TabviewDispatchResult =
  | { readonly status: "sent" }
  | { readonly status: "queued" }
  | { readonly status: "closed" };

export interface TabviewSession<R extends TabviewSessionRole> {
  dispatch(message: TabviewOutbound<R>): TabviewDispatchResult;
  close(reason?: TabviewCloseReason): void;
}

