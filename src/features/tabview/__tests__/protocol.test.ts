import { describe, it, expect } from "vitest";
import { TABVIEW_CONSTANTS } from "../constants";
import {
  createSessionId,
  validateTabKey,
  validateFontSize,
  validateLocaleSnapshot,
  validateTabviewBootstrap,
  validateCommand,
  validateEvent,
  validateEnvelope,
  validateSequence
} from "../protocol";
import type {
  TabviewBootstrap,
  TabviewCommand,
  TabviewEvent,
  TabviewEnvelope,
  LocaleSnapshot
} from "../types";

describe("protocol validators", () => {
  const mockLocale: LocaleSnapshot = {
    locale: "zh-CN",
    direction: "ltr",
    messages: { tab_info: "简介" } as any
  };

  it("creates unique session ids", () => {
    const id1 = createSessionId();
    const id2 = createSessionId();
    expect(id1).not.toEqual(id2);
    expect(id1.startsWith("tabview-sess-")).toBe(true);
  });

  it("validates tab keys correctly", () => {
    expect(validateTabKey("info")).toBe(true);
    expect(validateTabKey("comments")).toBe(true);
    expect(validateTabKey("videos")).toBe(true);
    expect(validateTabKey("playlist")).toBe(true);
    expect(validateTabKey("invalid")).toBe(false);
    expect(validateTabKey(123)).toBe(false);
    expect(validateTabKey(null)).toBe(false);
  });

  it("validates font size within limits", () => {
    expect(validateFontSize(TABVIEW_CONSTANTS.FONT_SIZE_MIN)).toBe(true);
    expect(validateFontSize(TABVIEW_CONSTANTS.FONT_SIZE_MAX)).toBe(true);
    expect(validateFontSize(TABVIEW_CONSTANTS.FONT_SIZE_MIN - 1)).toBe(false);
    expect(validateFontSize(TABVIEW_CONSTANTS.FONT_SIZE_MAX + 1)).toBe(false);
    expect(validateFontSize(NaN)).toBe(false);
    expect(validateFontSize("14")).toBe(false);
  });

  it("validates locale snapshot correctly", () => {
    expect(validateLocaleSnapshot(mockLocale)).toBe(true);
    expect(validateLocaleSnapshot({ ...mockLocale, locale: "" })).toBe(false);
    expect(validateLocaleSnapshot({ ...mockLocale, direction: "invalid" })).toBe(false);
    expect(validateLocaleSnapshot({ ...mockLocale, messages: null })).toBe(false);
    expect(validateLocaleSnapshot(null)).toBe(false);
  });

  it("validates bootstrap data", () => {
    const validBootstrap: TabviewBootstrap = {
      namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
      protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
      sessionId: createSessionId(),
      initialLocale: mockLocale
    };

    const res = validateTabviewBootstrap(validBootstrap);
    expect(res.ok).toBe(true);

    expect(validateTabviewBootstrap(null).ok).toBe(false);
    expect(validateTabviewBootstrap({ ...validBootstrap, namespace: "wrong" }).ok).toBe(false);
    expect(validateTabviewBootstrap({ ...validBootstrap, protocolVersion: "0.0.1" }).ok).toBe(false);
    expect(validateTabviewBootstrap({ ...validBootstrap, sessionId: "" }).ok).toBe(false);
  });

  it("validates TabviewCommand variants", () => {
    const cmdTab: TabviewCommand = { type: "set-active-tab", tabKey: "info" };
    const cmdFont: TabviewCommand = { type: "set-font-size", tabKey: "comments", fontSize: 14 };
    const cmdLocale: TabviewCommand = { type: "update-locale", snapshot: mockLocale };

    expect(validateCommand(cmdTab)).toBe(true);
    expect(validateCommand(cmdFont)).toBe(true);
    expect(validateCommand(cmdLocale)).toBe(true);

    expect(validateCommand({ type: "set-font-size", tabKey: "comments", fontSize: 999 })).toBe(false);
    expect(validateCommand({ type: "unknown" })).toBe(false);
    expect(validateCommand(null)).toBe(false);
  });

  it("validates TabviewEvent variants", () => {
    const evtReady: TabviewEvent = { type: "ready", protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION };
    const evtTab: TabviewEvent = { type: "tab-changed", tabKey: "videos" };
    const evtFont: TabviewEvent = { type: "font-size-changed", tabKey: "playlist", fontSize: 16 };

    expect(validateEvent(evtReady)).toBe(true);
    expect(validateEvent(evtTab)).toBe(true);
    expect(validateEvent(evtFont)).toBe(true);

    expect(validateEvent({ type: "ready", protocolVersion: "0.0.0" })).toBe(false);
    expect(validateEvent({ type: "tab-changed", tabKey: "invalid" })).toBe(false);
    expect(validateEvent(null)).toBe(false);
  });

  it("validates envelope routing and integrity", () => {
    const sessionId = createSessionId();
    const validEnvelope: TabviewEnvelope<TabviewEvent> = {
      namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
      protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
      sessionId,
      sender: "page",
      target: "sandbox",
      sequence: 1,
      body: {
        kind: "message",
        value: { type: "tab-changed", tabKey: "info" }
      }
    };

    // Sandbox receives from page
    const result1 = validateEnvelope(validEnvelope, sessionId, "sandbox");
    expect(result1.ok).toBe(true);

    // Session mismatch
    const otherSessionId = createSessionId();
    const resultMismatch = validateEnvelope(validEnvelope, otherSessionId, "sandbox");
    expect(resultMismatch.ok).toBe(false);
    if (!resultMismatch.ok) {
      expect(resultMismatch.errorCode).toBe("session-mismatch");
    }

    // Direction mismatch (target is page, but received by sandbox)
    const badDirection = { ...validEnvelope, target: "page" };
    const resultDirection = validateEnvelope(badDirection, sessionId, "sandbox");
    expect(resultDirection.ok).toBe(false);
    if (!resultDirection.ok) {
      expect(resultDirection.errorCode).toBe("direction-mismatch");
    }

    // Close envelope
    const closeEnvelope: TabviewEnvelope<never> = {
      namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
      protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
      sessionId,
      sender: "sandbox",
      target: "page",
      sequence: 2,
      body: {
        kind: "close",
        reason: "feature-disabled"
      }
    };
    const resultClose = validateEnvelope(closeEnvelope, sessionId, "page");
    expect(resultClose.ok).toBe(true);

    // Invalid close reason
    const badCloseEnvelope = {
      ...closeEnvelope,
      body: { kind: "close", reason: "unknown-reason" }
    };
    const resultBadClose = validateEnvelope(badCloseEnvelope, sessionId, "page");
    expect(resultBadClose.ok).toBe(false);

    // Non-integer sequence (e.g. float)
    const floatSeqEnvelope = { ...validEnvelope, sequence: 1.5 };
    const resultFloatSeq = validateEnvelope(floatSeqEnvelope, sessionId, "sandbox");
    expect(resultFloatSeq.ok).toBe(false);
    if (!resultFloatSeq.ok) {
      expect(resultFloatSeq.errorCode).toBe("invalid-sequence");
    }

    // Sanitized cause on invalid message payload
    const badMessageEnvelope = {
      ...validEnvelope,
      sender: "sandbox",
      target: "page",
      body: { kind: "message", value: { type: "update-locale", snapshot: { locale: "", messages: { secret: "leak" } } } }
    };
    const resultBadMessage = validateEnvelope(badMessageEnvelope, sessionId, "page");
    expect(resultBadMessage.ok).toBe(false);
    if (!resultBadMessage.ok) {
      expect(resultBadMessage.errorCode).toBe("invalid-message");
      expect(resultBadMessage.cause).toEqual({ type: "update-locale" });
    }
  });

  it("validates sequence monotonicity", () => {
    expect(validateSequence(2, 1)).toBe(true);
    expect(validateSequence(10, 5)).toBe(true);
    expect(validateSequence(1, 1)).toBe(false);
    expect(validateSequence(1, 2)).toBe(false);
  });
});
