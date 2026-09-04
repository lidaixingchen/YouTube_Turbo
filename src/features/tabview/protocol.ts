import { TABVIEW_CONSTANTS } from "./constants";
import type {
  TabKey,
  LocaleSnapshot,
  TabviewSessionId,
  TabviewBootstrap,
  TabviewCommand,
  TabviewEvent,
  TabviewEnvelope,
  TabviewSessionRole,
  TabviewCloseReason,
  TabviewProtocolErrorCode
} from "./types";

export function createSessionId(): TabviewSessionId {
  const timestamp: number = Date.now();
  const randomPart: string = Math.random().toString(36).slice(2, 10);
  return `tabview-sess-${timestamp}-${randomPart}` as TabviewSessionId;
}

export function validateTabKey(input: unknown): input is TabKey {
  return (
    typeof input === "string" &&
    (input === "info" || input === "comments" || input === "videos" || input === "playlist")
  );
}

export function validateFontSize(input: unknown): input is number {
  return (
    typeof input === "number" &&
    Number.isFinite(input) &&
    input >= TABVIEW_CONSTANTS.FONT_SIZE_MIN &&
    input <= TABVIEW_CONSTANTS.FONT_SIZE_MAX
  );
}

export function validateLocaleSnapshot(input: unknown): input is LocaleSnapshot {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.locale !== "string" || candidate.locale.trim() === "") {
    return false;
  }
  if (
    candidate.direction !== undefined &&
    candidate.direction !== "ltr" &&
    candidate.direction !== "rtl"
  ) {
    return false;
  }
  if (typeof candidate.messages !== "object" || candidate.messages === null) {
    return false;
  }
  return true;
}

export type BootstrapValidationResult =
  | { readonly ok: true; readonly value: TabviewBootstrap }
  | { readonly ok: false; readonly error: string };

export function validateTabviewBootstrap(input: unknown): BootstrapValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Bootstrap must be a non-null object" };
  }
  const candidate = input as Record<string, unknown>;
  if (candidate.namespace !== TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE) {
    return { ok: false, error: "Invalid bootstrap namespace" };
  }
  if (candidate.protocolVersion !== TABVIEW_CONSTANTS.PROTOCOL_VERSION) {
    return { ok: false, error: "Invalid bootstrap protocolVersion" };
  }
  if (typeof candidate.sessionId !== "string" || candidate.sessionId.trim() === "") {
    return { ok: false, error: "Invalid bootstrap sessionId" };
  }
  if (!validateLocaleSnapshot(candidate.initialLocale)) {
    return { ok: false, error: "Invalid bootstrap initialLocale" };
  }
  return {
    ok: true,
    value: candidate as unknown as TabviewBootstrap
  };
}

export function validateCommand(input: unknown): input is TabviewCommand {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.type !== "string") {
    return false;
  }
  switch (candidate.type) {
    case "set-active-tab":
      return validateTabKey(candidate.tabKey);
    case "set-font-size":
      return validateTabKey(candidate.tabKey) && validateFontSize(candidate.fontSize);
    case "update-locale":
      return validateLocaleSnapshot(candidate.snapshot);
    default:
      return false;
  }
}

export function validateEvent(input: unknown): input is TabviewEvent {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.type !== "string") {
    return false;
  }
  switch (candidate.type) {
    case "ready":
      return candidate.protocolVersion === TABVIEW_CONSTANTS.PROTOCOL_VERSION;
    case "tab-changed":
      return validateTabKey(candidate.tabKey);
    case "font-size-changed":
      return validateTabKey(candidate.tabKey) && validateFontSize(candidate.fontSize);
    default:
      return false;
  }
}

export function validateCloseReason(input: unknown): input is TabviewCloseReason {
  return (
    typeof input === "string" &&
    (input === "feature-disabled" ||
      input === "setup-replaced" ||
      input === "setup-timeout" ||
      input === "injection-failed" ||
      input === "protocol-error" ||
      input === "page-closed")
  );
}

export type EnvelopeValidationResult =
  | { readonly ok: true; readonly envelope: TabviewEnvelope<unknown> }
  | { readonly ok: false; readonly errorCode: TabviewProtocolErrorCode; readonly cause?: unknown };

export function validateEnvelope(
  input: unknown,
  expectedSessionId: TabviewSessionId,
  expectedReceiverRole: TabviewSessionRole
): EnvelopeValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errorCode: "invalid-envelope", cause: "Not an object" };
  }
  const candidate = input as Record<string, unknown>;

  if (candidate.namespace !== TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE) {
    return { ok: false, errorCode: "namespace-mismatch", cause: candidate.namespace };
  }
  if (candidate.protocolVersion !== TABVIEW_CONSTANTS.PROTOCOL_VERSION) {
    return { ok: false, errorCode: "version-mismatch", cause: candidate.protocolVersion };
  }
  if (candidate.sessionId !== expectedSessionId) {
    return { ok: false, errorCode: "session-mismatch", cause: candidate.sessionId };
  }

  const expectedSender: TabviewSessionRole = expectedReceiverRole === "sandbox" ? "page" : "sandbox";
  if (candidate.sender !== expectedSender || candidate.target !== expectedReceiverRole) {
    return {
      ok: false,
      errorCode: "direction-mismatch",
      cause: { sender: candidate.sender, target: candidate.target }
    };
  }

  if (typeof candidate.sequence !== "number" || !Number.isInteger(candidate.sequence)) {
    return { ok: false, errorCode: "invalid-sequence", cause: candidate.sequence };
  }

  if (typeof candidate.body !== "object" || candidate.body === null) {
    return { ok: false, errorCode: "invalid-envelope", cause: "Invalid body" };
  }

  const body = candidate.body as Record<string, unknown>;
  if (body.kind === "close") {
    if (!validateCloseReason(body.reason)) {
      return { ok: false, errorCode: "invalid-envelope", cause: "Invalid close reason" };
    }
    return { ok: true, envelope: candidate as unknown as TabviewEnvelope<unknown> };
  }

  if (body.kind === "message") {
    const isMessageValid =
      expectedReceiverRole === "sandbox"
        ? validateEvent(body.value)
        : validateCommand(body.value);

    if (!isMessageValid) {
      const sanitizedCause: unknown =
        typeof body.value === "object" && body.value !== null
          ? { type: (body.value as Record<string, unknown>).type ?? "unknown" }
          : typeof body.value;
      return { ok: false, errorCode: "invalid-message", cause: sanitizedCause };
    }
    return { ok: true, envelope: candidate as unknown as TabviewEnvelope<unknown> };
  }

  return { ok: false, errorCode: "invalid-envelope", cause: body.kind };
}

export function validateSequence(incomingSeq: number, lastAcceptedSeq: number): boolean {
  return incomingSeq > lastAcceptedSeq;
}
