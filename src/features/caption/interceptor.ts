import { SUBTITLE_CONSTANTS } from "./constants";
import type { TimedTextEvent, TimedTextSegment, YouTubeTimedTextJson3 } from "./types";

interface TimedTextRequestIdentity {
  key: string;
  videoId: string;
}

interface ActiveXhrRequest {
  readonly xhr: XMLHttpRequest;
  readonly openCallId: number;
  readonly settleFailure: () => void;
  readonly cleanup: () => void;
}

interface XhrOpenTarget {
  readonly callId: number;
  readonly isTimedText: boolean;
  readonly url: string | undefined;
}

interface XhrOpenState {
  nextCallId: number;
  latestSuccessfulCallId: number;
  committedTarget: XhrOpenTarget | null;
  readonly pendingCalls: XhrOpenTarget[];
}

interface XhrHeaderDecoration {
  readonly openCallId: number;
  readonly restore: () => void;
}

interface ResponseMetadata {
  readonly url: string;
  readonly type: ResponseType;
  readonly redirected: boolean;
}

export class TimedTextInterceptor {
  private isInstalled: boolean = false;
  private lifecycleToken: object = {};
  private requestSequence: number = 0;
  private latestRequestSequenceByVideo: Map<string, number> = new Map();
  private readonly activeXhrRequests: Set<ActiveXhrRequest> = new Set();
  private readonly xhrRequestByInstance: WeakMap<XMLHttpRequest, ActiveXhrRequest> = new WeakMap();
  private readonly xhrOpenStateByInstance: WeakMap<XMLHttpRequest, XhrOpenState> = new WeakMap();
  private readonly activeXhrHeaderDecorations: Set<WeakRef<XMLHttpRequest>> = new Set();
  private readonly xhrHeaderDecorationByInstance: WeakMap<XMLHttpRequest, XhrHeaderDecoration> = new WeakMap();
  private readonly responseMetadataByInstance: WeakMap<Response, ResponseMetadata> = new WeakMap();
  private originalFetch: typeof window.fetch | null = null;
  private originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

  public constructor(
    private readonly offsetProvider: () => number,
    private readonly onTrackIngested: (
      key: string,
      rawText: string,
      videoId: string,
      isLatestRequest: boolean,
      requestSequence: number
    ) => void,
    private readonly onTrackRequestStarted: (key: string, videoId: string, requestSequence: number) => void =
      (): void => {},
    private readonly onTrackRequestFailed: (key: string, videoId: string, requestSequence: number) => void =
      (): void => {}
  ) {}

  public install(): void {
    if (this.isInstalled) {
      return;
    }
    this.isInstalled = true;
    this.lifecycleToken = {};
    this.latestRequestSequenceByVideo.clear();

    const targetWindow = typeof unsafeWindow !== "undefined" ? (unsafeWindow as unknown as Window) : window;
    this.hookFetch(targetWindow);
    this.hookXHR(targetWindow);
  }

  private isTimedTextUrl(url: string | URL | Request): boolean {
    const rawUrl =
      typeof url === "string"
        ? url
        : url && typeof (url as Request).url === "string"
          ? (url as Request).url
          : (url as URL)?.href || "";
    return rawUrl.includes(SUBTITLE_CONSTANTS.TIMEDTEXT_API_PATH);
  }

  private getXhrOpenState(xhr: XMLHttpRequest): XhrOpenState {
    const existingState: XhrOpenState | undefined = this.xhrOpenStateByInstance.get(xhr);
    if (existingState) {
      return existingState;
    }
    const openState: XhrOpenState = {
      nextCallId: SUBTITLE_CONSTANTS.XHR_INITIAL_OPEN_CALL_ID,
      latestSuccessfulCallId: SUBTITLE_CONSTANTS.XHR_INITIAL_OPEN_CALL_ID,
      committedTarget: null,
      pendingCalls: []
    };
    this.xhrOpenStateByInstance.set(xhr, openState);
    return openState;
  }

  private getEffectiveXhrOpenTarget(
    xhr: XMLHttpRequest & {
      __isTimedText?: boolean;
      __timedTextUrl?: string;
    },
    openState: XhrOpenState
  ): XhrOpenTarget {
    let effectiveTarget: XhrOpenTarget =
      openState.committedTarget ?? {
        callId: openState.latestSuccessfulCallId,
        isTimedText: xhr.__isTimedText === true,
        url: xhr.__timedTextUrl
      };
    for (const pendingCall of openState.pendingCalls) {
      if (pendingCall.callId > effectiveTarget.callId) {
        effectiveTarget = pendingCall;
      }
    }
    return effectiveTarget;
  }

  private isCurrentXhrOpenCall(
    xhr: XMLHttpRequest & {
      __isTimedText?: boolean;
      __timedTextUrl?: string;
    },
    openCallId: number
  ): boolean {
    const openState: XhrOpenState | undefined = this.xhrOpenStateByInstance.get(xhr);
    return !openState || this.getEffectiveXhrOpenTarget(xhr, openState).callId === openCallId;
  }

  private commitXhrOpen(
    xhr: XMLHttpRequest & {
      __isTimedText?: boolean;
      __timedTextUrl?: string;
      __timedTextRequestSequence?: number;
    },
    openState: XhrOpenState,
    openTarget: XhrOpenTarget
  ): void {
    if (openTarget.callId <= openState.latestSuccessfulCallId) {
      return;
    }

    openState.latestSuccessfulCallId = openTarget.callId;
    openState.committedTarget = openTarget;
    xhr.__isTimedText = openTarget.isTimedText;
    xhr.__timedTextUrl = openTarget.url;

    const activeRequest: ActiveXhrRequest | undefined = this.xhrRequestByInstance.get(xhr);
    const replacesActiveRequest: boolean = activeRequest !== undefined && activeRequest.openCallId < openTarget.callId;
    if (!activeRequest || replacesActiveRequest) {
      xhr.__timedTextRequestSequence = undefined;
    }
    this.restoreXhrHeaderDecoration(xhr, openTarget.callId);
    if (activeRequest && replacesActiveRequest) {
      activeRequest.settleFailure();
    }
  }

  private registerRequest(identity: TimedTextRequestIdentity): number {
    this.requestSequence += 1;
    if (identity.videoId) {
      this.latestRequestSequenceByVideo.set(identity.videoId, this.requestSequence);
      this.onTrackRequestStarted(identity.key, identity.videoId, this.requestSequence);
    }
    return this.requestSequence;
  }

  private isLatestRequest(videoId: string, requestSequence: number): boolean {
    return videoId !== "" && this.latestRequestSequenceByVideo.get(videoId) === requestSequence;
  }

  private extractRequestIdentityFromUrl(url: string): TimedTextRequestIdentity {
    try {
      const parsed = new URL(url, window.location.origin);
      const videoId: string = parsed.searchParams.get(SUBTITLE_CONSTANTS.VIDEO_ID_PARAMETER) || "";
      const lang = parsed.searchParams.get("lang") || "default";
      const tlang = parsed.searchParams.get("tlang") || "";
      const separator: string = SUBTITLE_CONSTANTS.TRACK_KEY_SEPARATOR;
      return { key: `${videoId}${separator}${lang}${separator}${tlang}`, videoId };
    } catch {
      return { key: `unknown_${Date.now()}`, videoId: "" };
    }
  }

  private modifyJson3(text: string, offsetMs: number): string {
    if (offsetMs === 0) return text;
    try {
      const data: YouTubeTimedTextJson3 = JSON.parse(text) as YouTubeTimedTextJson3;
      if (!data || !Array.isArray(data.events)) {
        return text;
      }

      const events: TimedTextEvent[] = data.events;
      for (const event of events) {
        if (typeof event.tStartMs === "number" && Number.isFinite(event.tStartMs)) {
          const targetStart: number = event.tStartMs + offsetMs;
          if (targetStart >= 0) {
            event.tStartMs = targetStart;
          } else {
            const underflowDelta: number = -targetStart;
            event.tStartMs = SUBTITLE_CONSTANTS.TIME_ORIGIN_MS;
            if (typeof event.dDurationMs === "number" && Number.isFinite(event.dDurationMs)) {
              event.dDurationMs = Math.max(SUBTITLE_CONSTANTS.TIME_ORIGIN_MS, event.dDurationMs - underflowDelta);
            }
            if (Array.isArray(event.segs)) {
              const segments: TimedTextSegment[] = event.segs;
              for (const segment of segments) {
                if (typeof segment.tOffsetMs === "number" && Number.isFinite(segment.tOffsetMs)) {
                  segment.tOffsetMs = Math.max(
                    SUBTITLE_CONSTANTS.TIME_ORIGIN_MS,
                    segment.tOffsetMs - underflowDelta
                  );
                }
              }
            }
          }
        }
      }
      return JSON.stringify(data);
    } catch {
      return text;
    }
  }

  private modifyXml(text: string, offsetMs: number): string {
    if (offsetMs === 0) return text;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/xml");
      if (doc.querySelector("parsererror")) {
        return text;
      }

      const isSrv1 = doc.querySelector("transcript") !== null;

      if (isSrv1) {
        const textNodes = doc.querySelectorAll("text");
        const offsetSec = offsetMs / 1000;
        textNodes.forEach((node) => {
          const startAttr = node.getAttribute("start");
          if (startAttr !== null) {
            const start = parseFloat(startAttr);
            if (!Number.isFinite(start)) return;
            const targetStart = start + offsetSec;
            if (targetStart >= 0) {
              node.setAttribute("start", String(+targetStart.toFixed(3)));
            } else {
              const underflowSec = -targetStart;
              node.setAttribute("start", "0");
              const durAttr = node.getAttribute("dur");
              if (durAttr !== null) {
                const dur = parseFloat(durAttr);
                if (Number.isFinite(dur)) {
                  node.setAttribute("dur", String(Math.max(0, +(dur - underflowSec).toFixed(3))));
                }
              }
            }
          }
        });
      } else {
        const pNodes = doc.querySelectorAll("p");
        pNodes.forEach((p) => {
          const tAttr = p.getAttribute("t");
          if (tAttr !== null) {
            const t = parseInt(tAttr, 10);
            if (!Number.isFinite(t)) return;
            const targetT = t + offsetMs;
            if (targetT >= 0) {
              p.setAttribute("t", String(targetT));
            } else {
              const underflowMs = -targetT;
              p.setAttribute("t", "0");
              const dAttr = p.getAttribute("d");
              if (dAttr !== null) {
                const d = parseInt(dAttr, 10);
                if (Number.isFinite(d)) {
                  p.setAttribute("d", String(Math.max(0, d - underflowMs)));
                }
              }
            }
          }
        });
      }

      return new XMLSerializer().serializeToString(doc);
    } catch {
      return text;
    }
  }

  public modifyPayload(body: string, offsetMs: number): string {
    if (!body || offsetMs === 0) return body;
    const trimmed = body.trimStart();
    if (trimmed.startsWith("{") && trimmed.includes("events")) {
      return this.modifyJson3(body, offsetMs);
    }
    if (trimmed.startsWith("<")) {
      return this.modifyXml(body, offsetMs);
    }
    return body;
  }

  private hookFetch(targetWindow: Window): void {
    const originalFetch = targetWindow.fetch;
    this.originalFetch = originalFetch;
    const self = this;
    const lifecycleToken: object = this.lifecycleToken;

    targetWindow.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const isCurrentLifecycle: boolean = self.isCurrentLifecycle(lifecycleToken);
      const rawUrl: string =
        typeof input === "string"
          ? input
          : input && typeof (input as Request).url === "string"
            ? (input as Request).url
            : (input as URL)?.href || "";
      const isTimedText: boolean = isCurrentLifecycle && self.isTimedTextUrl(rawUrl);
      const identity: TimedTextRequestIdentity | null = isTimedText
        ? self.extractRequestIdentityFromUrl(rawUrl)
        : null;
      const requestSequence: number | null = identity ? self.registerRequest(identity) : null;
      let response: Response;
      try {
        response = await originalFetch.apply(this || targetWindow, [input, init]);
      } catch (error: unknown) {
        if (identity && requestSequence !== null) {
          self.settleTrackRequestFailure(lifecycleToken, identity, requestSequence);
        }
        throw error;
      }
      if (!self.isCurrentLifecycle(lifecycleToken) || !identity || requestSequence === null) {
        return response;
      }
      if (!response.ok) {
        self.settleTrackRequestFailure(lifecycleToken, identity, requestSequence);
        return response;
      }

      let originalText: string;
      try {
        originalText = await response.clone().text();
      } catch {
        self.settleTrackRequestFailure(lifecycleToken, identity, requestSequence);
        return response;
      }
      if (!self.isCurrentLifecycle(lifecycleToken)) {
        return response;
      }

      try {
        const isLatestRequest: boolean = self.isLatestRequest(identity.videoId, requestSequence);
        self.onTrackIngested(identity.key, originalText, identity.videoId, isLatestRequest, requestSequence);
        if (
          response.status === SUBTITLE_CONSTANTS.HTTP_STATUS_NO_CONTENT ||
          response.status === SUBTITLE_CONSTANTS.HTTP_STATUS_RESET_CONTENT
        ) {
          return response;
        }

        const offsetMs = isLatestRequest ? self.offsetProvider() : 0;
        if (offsetMs === 0) {
          return response;
        }

        const modifiedText: string = self.modifyPayload(originalText, offsetMs);
        if (modifiedText === originalText) {
          return response;
        }

        const headers: Headers = new Headers(response.headers);
        for (const headerName of SUBTITLE_CONSTANTS.INVALIDATED_RESPONSE_HEADERS) {
          headers.delete(headerName);
        }
        const metadata: ResponseMetadata = {
          url: response.url,
          type: response.type,
          redirected: response.redirected
        };
        const modifiedResponse: Response = new Response(modifiedText, {
          status: response.status,
          statusText: response.statusText,
          headers
        });

        return self.decorateResponse(modifiedResponse, metadata);
      } catch (error: unknown) {
        self.settleTrackRequestFailure(lifecycleToken, identity, requestSequence);
        console.error("[TimedTextInterceptor] Fetch intercept error:", error);
        return response;
      }
    };
  }

  private hookXHR(targetWindow: Window): void {
    const xhrProto = (targetWindow as unknown as { XMLHttpRequest?: { prototype: XMLHttpRequest } }).XMLHttpRequest?.prototype;
    if (!xhrProto) return;

    this.originalXHROpen = xhrProto.open;
    this.originalXHRSend = xhrProto.send;
    const rawOpen = xhrProto.open;
    const rawSend = xhrProto.send;
    const rawGetResponseHeader: XMLHttpRequest["getResponseHeader"] = xhrProto.getResponseHeader;
    const rawGetAllResponseHeaders: XMLHttpRequest["getAllResponseHeaders"] = xhrProto.getAllResponseHeaders;
    const self = this;
    const lifecycleToken: object = this.lifecycleToken;

    xhrProto.open = function (
      this: XMLHttpRequest & {
        __isTimedText?: boolean;
        __timedTextUrl?: string;
        __timedTextRequestSequence?: number;
      },
      method: string,
      url: string | URL,
      ...rest: [boolean?, string?, string?]
    ): void {
      const openState: XhrOpenState = self.getXhrOpenState(this);
      const isTimedText: boolean = self.isTimedTextUrl(url);
      const requestUrl: string | undefined = isTimedText
        ? typeof url === "string"
          ? url
          : url instanceof URL
            ? url.href
            : String(url)
        : undefined;
      openState.nextCallId += SUBTITLE_CONSTANTS.XHR_OPEN_CALL_ID_INCREMENT;
      const openTarget: XhrOpenTarget = {
        callId: openState.nextCallId,
        isTimedText,
        url: requestUrl
      };
      openState.pendingCalls.push(openTarget);
      try {
        const result: void = (rawOpen as unknown as (...args: unknown[]) => void).apply(this, [method, url, ...rest]) as void;
        if (self.isInstalled) {
          self.commitXhrOpen(this, openState, openTarget);
        }
        return result;
      } finally {
        const pendingCallIndex: number = openState.pendingCalls.lastIndexOf(openTarget);
        if (pendingCallIndex >= 0) {
          openState.pendingCalls.splice(pendingCallIndex, 1);
        }
      }
    };

    xhrProto.send = function (
      this: XMLHttpRequest & {
        __isTimedText?: boolean;
        __timedTextUrl?: string;
        __timedTextRequestSequence?: number;
      },
      body?: Document | XMLHttpRequestBodyInit | null
    ): void {
      const openState: XhrOpenState = self.getXhrOpenState(this);
      const openTarget: XhrOpenTarget = self.getEffectiveXhrOpenTarget(this, openState);
      this.__isTimedText = openTarget.isTimedText;
      this.__timedTextUrl = openTarget.url;
      if (openTarget.isTimedText && self.isCurrentLifecycle(lifecycleToken)) {
        const xhr = this;
        const openCallId: number = openTarget.callId;
        const previousRequest: ActiveXhrRequest | undefined = self.xhrRequestByInstance.get(xhr);
        previousRequest?.settleFailure();
        if (!self.isCurrentLifecycle(lifecycleToken) || !self.isCurrentXhrOpenCall(xhr, openCallId)) {
          return rawSend.apply(this, [body]);
        }
        const requestUrl: string = openTarget.url || window.location.href;
        const identity: TimedTextRequestIdentity = self.extractRequestIdentityFromUrl(requestUrl);
        const requestSequence: number = self.registerRequest(identity);
        if (!self.isCurrentLifecycle(lifecycleToken) || !self.isCurrentXhrOpenCall(xhr, openCallId)) {
          if (self.isCurrentLifecycle(lifecycleToken)) {
            self.settleTrackRequestFailure(lifecycleToken, identity, requestSequence);
          }
          return rawSend.apply(this, [body]);
        }
        xhr.__timedTextRequestSequence = requestSequence;
        let modifiedResponseText: string | null = null;
        let didModifyResponseText: boolean = false;
        let isResolvingModifiedPayload: boolean = false;
        let hasSettled: boolean = false;
        let listenersAttached: boolean = false;
        let requestLifecycle: ActiveXhrRequest | null = null;
        let readystatechangeListener: EventListener = (): void => {};
        let failureListener: EventListener = (): void => {};
        let cleanupListeners: () => void = (): void => {};
        const settleFailure = (): void => {
          if (hasSettled) {
            return;
          }
          hasSettled = true;
          cleanupListeners();
          self.settleTrackRequestFailure(lifecycleToken, identity, requestSequence);
        };

        const resolveModifiedPayload = (): string | null => {
          if (
            !self.isCurrentLifecycle(lifecycleToken) ||
            xhr.__timedTextRequestSequence !== requestSequence ||
            !self.isCurrentXhrOpenCall(xhr, openCallId)
          ) {
            return null;
          }
          if (modifiedResponseText !== null) {
            return modifiedResponseText;
          }
          if (hasSettled) {
            return null;
          }
          if (isResolvingModifiedPayload || xhr.readyState !== SUBTITLE_CONSTANTS.XHR_READY_STATE_DONE) {
            return null;
          }

          isResolvingModifiedPayload = true;
          let rawText: string | null = null;
          try {
            if (
              xhr.status < SUBTITLE_CONSTANTS.HTTP_SUCCESS_STATUS_MIN ||
              xhr.status >= SUBTITLE_CONSTANTS.HTTP_SUCCESS_STATUS_MAX_EXCLUSIVE ||
              (xhr.responseType !== "" && xhr.responseType !== "text")
            ) {
              settleFailure();
              return null;
            }

            let raw: unknown;
            try {
              raw = Object.getOwnPropertyDescriptor(xhrProto, "responseText")?.get?.call(xhr);
            } catch {
              settleFailure();
              return null;
            }
            if (typeof raw !== "string") {
              settleFailure();
              return null;
            }
            rawText = raw;

            const isLatestRequest: boolean = self.isLatestRequest(identity.videoId, requestSequence);
            try {
              self.onTrackIngested(identity.key, raw, identity.videoId, isLatestRequest, requestSequence);
            } catch {
              settleFailure();
              return null;
            }
            hasSettled = true;
            cleanupListeners();

            const offsetMs: number = isLatestRequest ? self.offsetProvider() : 0;
            const modifiedText: string = offsetMs === 0 ? raw : self.modifyPayload(raw, offsetMs);
            didModifyResponseText = modifiedText !== raw;
            modifiedResponseText = modifiedText;
            return modifiedText;
          } catch {
            if (!hasSettled) {
              settleFailure();
            } else {
              self.settleTrackRequestFailure(lifecycleToken, identity, requestSequence);
            }
            if (rawText !== null) {
              modifiedResponseText = rawText;
            }
            return rawText;
          } finally {
            isResolvingModifiedPayload = false;
          }
        };

        readystatechangeListener = (): void => {
          if (self.isCurrentXhrOpenCall(xhr, openCallId) && xhr.readyState === SUBTITLE_CONSTANTS.XHR_READY_STATE_DONE) {
            resolveModifiedPayload();
          }
        };
        failureListener = (): void => {
          if (self.isCurrentXhrOpenCall(xhr, openCallId)) {
            settleFailure();
          }
        };
        cleanupListeners = (): void => {
          if (!listenersAttached) {
            return;
          }
          listenersAttached = false;
          xhr.removeEventListener("readystatechange", readystatechangeListener);
          xhr.removeEventListener("abort", failureListener);
          xhr.removeEventListener("error", failureListener);
          xhr.removeEventListener("timeout", failureListener);
          if (requestLifecycle) {
            self.activeXhrRequests.delete(requestLifecycle);
            if (self.xhrRequestByInstance.get(xhr) === requestLifecycle) {
              self.xhrRequestByInstance.delete(xhr);
            }
          }
        };
        requestLifecycle = {
          xhr,
          openCallId,
          settleFailure,
          cleanup: cleanupListeners
        };
        self.activeXhrRequests.add(requestLifecycle);
        self.xhrRequestByInstance.set(xhr, requestLifecycle);

        try {
          listenersAttached = true;
          xhr.addEventListener("readystatechange", readystatechangeListener);
          xhr.addEventListener("abort", failureListener);
          xhr.addEventListener("error", failureListener);
          xhr.addEventListener("timeout", failureListener);

          Object.defineProperty(xhr, "responseText", {
            get(): string | null {
              const resolved: string | null = resolveModifiedPayload();
              return resolved !== null
                ? resolved
                : Object.getOwnPropertyDescriptor(xhrProto, "responseText")?.get?.call(xhr);
            },
            configurable: true
          });

          Object.defineProperty(xhr, "response", {
            get(): unknown {
              if (xhr.responseType === "" || xhr.responseType === "text") {
                const resolved: string | null = resolveModifiedPayload();
                return resolved !== null
                  ? resolved
                  : Object.getOwnPropertyDescriptor(xhrProto, "responseText")?.get?.call(xhr);
              }
              return Object.getOwnPropertyDescriptor(xhrProto, "response")?.get?.call(xhr);
            },
            configurable: true
          });

          self.installXhrResponseHeaderOverrides(
            xhr,
            requestSequence,
            openCallId,
            lifecycleToken,
            resolveModifiedPayload,
            (): boolean => didModifyResponseText,
            rawGetResponseHeader,
            rawGetAllResponseHeaders
          );

          return rawSend.apply(this, [body]);
        } catch (error: unknown) {
          settleFailure();
          throw error;
        }
      }

      return rawSend.apply(this, [body]);
    };
  }

  public destroy(): void {
    this.isInstalled = false;
    this.lifecycleToken = {};
    this.latestRequestSequenceByVideo.clear();
    for (const request of this.activeXhrRequests) {
      request.cleanup();
    }
    this.activeXhrRequests.clear();
    for (const xhrReference of this.activeXhrHeaderDecorations) {
      const xhr: XMLHttpRequest | undefined = xhrReference.deref();
      if (xhr) {
        this.restoreXhrHeaderDecoration(xhr);
      }
    }
    this.activeXhrHeaderDecorations.clear();
    const targetWindow = typeof unsafeWindow !== "undefined" ? (unsafeWindow as unknown as Window) : window;
    if (this.originalFetch) {
      targetWindow.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    const xhrProto = (targetWindow as unknown as { XMLHttpRequest?: { prototype: XMLHttpRequest } }).XMLHttpRequest?.prototype;
    if (xhrProto && this.originalXHROpen && this.originalXHRSend) {
      xhrProto.open = this.originalXHROpen;
      xhrProto.send = this.originalXHRSend;
      this.originalXHROpen = null;
      this.originalXHRSend = null;
    }
  }

  private isCurrentLifecycle(token: object): boolean {
    return this.isInstalled && this.lifecycleToken === token;
  }

  private decorateResponse(response: Response, metadata: ResponseMetadata): Response {
    const nativeClone: (this: Response) => Response = Response.prototype.clone;
    const self: TimedTextInterceptor = this;
    const clone: (this: Response) => Response = function (this: Response): Response {
      const clonedResponse: Response = nativeClone.call(this);
      const sourceMetadata: ResponseMetadata | undefined = self.responseMetadataByInstance.get(this);
      return sourceMetadata ? self.decorateResponse(clonedResponse, sourceMetadata) : clonedResponse;
    };

    Object.defineProperties(response, {
      url: { configurable: true, value: metadata.url },
      type: { configurable: true, value: metadata.type },
      redirected: { configurable: true, value: metadata.redirected },
      clone: { configurable: true, enumerable: false, writable: true, value: clone }
    });
    this.responseMetadataByInstance.set(response, metadata);
    return response;
  }

  private installXhrResponseHeaderOverrides(
    xhr: XMLHttpRequest,
    requestSequence: number,
    openCallId: number,
    lifecycleToken: object,
    resolveModifiedPayload: () => string | null,
    didModifyResponseText: () => boolean,
    rawGetResponseHeader: XMLHttpRequest["getResponseHeader"],
    rawGetAllResponseHeaders: XMLHttpRequest["getAllResponseHeaders"]
  ): void {
    this.restoreXhrHeaderDecoration(xhr);
    const originalGetResponseHeader: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
      xhr,
      "getResponseHeader"
    );
    const originalGetAllResponseHeaders: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
      xhr,
      "getAllResponseHeaders"
    );
    const xhrReference: WeakRef<XMLHttpRequest> = new WeakRef(xhr);
    const trackedXhr: XMLHttpRequest & { __timedTextRequestSequence?: number } = xhr as XMLHttpRequest & {
      __timedTextRequestSequence?: number;
    };
    const self: TimedTextInterceptor = this;
    const getResponseHeader: (this: XMLHttpRequest, name: string) => string | null = function (
      this: XMLHttpRequest,
      name: string
    ): string | null {
      const isCurrentRequest: boolean =
        this === xhr &&
        self.isCurrentLifecycle(lifecycleToken) &&
        trackedXhr.__timedTextRequestSequence === requestSequence &&
        self.isCurrentXhrOpenCall(xhr, openCallId);
      if (isCurrentRequest && xhr.readyState === SUBTITLE_CONSTANTS.XHR_READY_STATE_DONE) {
        resolveModifiedPayload();
      }
      const responseHeader: string | null = rawGetResponseHeader.call(this, name);
      if (
        isCurrentRequest &&
        didModifyResponseText() &&
        self.isInvalidatedResponseHeader(String(name))
      ) {
        return null;
      }
      return responseHeader;
    };
    const getAllResponseHeaders: (this: XMLHttpRequest) => string = function (this: XMLHttpRequest): string {
      const isCurrentRequest: boolean =
        this === xhr &&
        self.isCurrentLifecycle(lifecycleToken) &&
        trackedXhr.__timedTextRequestSequence === requestSequence &&
        self.isCurrentXhrOpenCall(xhr, openCallId);
      if (isCurrentRequest && xhr.readyState === SUBTITLE_CONSTANTS.XHR_READY_STATE_DONE) {
        resolveModifiedPayload();
      }
      const headers: string = rawGetAllResponseHeaders.call(this);
      if (!isCurrentRequest || !didModifyResponseText()) {
        return headers;
      }
      return self.removeInvalidatedResponseHeaderLines(headers);
    };
    const restoreMethod: (
      name: string,
      expectedValue: unknown,
      originalDescriptor: PropertyDescriptor | undefined
    ) => void = (
      name: string,
      expectedValue: unknown,
      originalDescriptor: PropertyDescriptor | undefined
    ): void => {
      if (Object.getOwnPropertyDescriptor(xhr, name)?.value !== expectedValue) {
        return;
      }
      if (originalDescriptor) {
        Object.defineProperty(xhr, name, originalDescriptor);
      } else {
        Reflect.deleteProperty(xhr, name);
      }
    };
    const restore: () => void = (): void => {
      restoreMethod("getResponseHeader", getResponseHeader, originalGetResponseHeader);
      restoreMethod("getAllResponseHeaders", getAllResponseHeaders, originalGetAllResponseHeaders);
      this.activeXhrHeaderDecorations.delete(xhrReference);
      if (this.xhrHeaderDecorationByInstance.get(xhr) === decoration) {
        this.xhrHeaderDecorationByInstance.delete(xhr);
      }
    };
    const decoration: XhrHeaderDecoration = { openCallId, restore };

    try {
      Object.defineProperties(xhr, {
        getResponseHeader: {
          configurable: true,
          writable: true,
          value: getResponseHeader
        },
        getAllResponseHeaders: {
          configurable: true,
          writable: true,
          value: getAllResponseHeaders
        }
      });
    } catch (error: unknown) {
      restoreMethod("getResponseHeader", getResponseHeader, originalGetResponseHeader);
      restoreMethod("getAllResponseHeaders", getAllResponseHeaders, originalGetAllResponseHeaders);
      throw error;
    }

    this.activeXhrHeaderDecorations.add(xhrReference);
    this.xhrHeaderDecorationByInstance.set(xhr, decoration);
  }

  private restoreXhrHeaderDecoration(xhr: XMLHttpRequest, beforeOpenCallId?: number): void {
    const decoration: XhrHeaderDecoration | undefined = this.xhrHeaderDecorationByInstance.get(xhr);
    if (!decoration || (beforeOpenCallId !== undefined && decoration.openCallId >= beforeOpenCallId)) {
      return;
    }
    decoration.restore();
    this.removeCollectedXhrHeaderDecorations();
  }

  private removeCollectedXhrHeaderDecorations(): void {
    for (const xhrReference of this.activeXhrHeaderDecorations) {
      if (!xhrReference.deref()) {
        this.activeXhrHeaderDecorations.delete(xhrReference);
      }
    }
  }

  private isInvalidatedResponseHeader(name: string): boolean {
    const normalizedName: string = name.trim().toLowerCase();
    return SUBTITLE_CONSTANTS.INVALIDATED_RESPONSE_HEADERS.includes(
      normalizedName as (typeof SUBTITLE_CONSTANTS.INVALIDATED_RESPONSE_HEADERS)[number]
    );
  }

  private removeInvalidatedResponseHeaderLines(headers: string): string {
    const headerLines: string[] = headers.split(SUBTITLE_CONSTANTS.XHR_HEADER_LINE_SEPARATOR);
    const filteredHeaderLines: string[] = headerLines.filter((line: string): boolean => {
      if (!line) {
        return true;
      }
      const separatorIndex: number = line.indexOf(SUBTITLE_CONSTANTS.HTTP_HEADER_NAME_SEPARATOR);
      if (separatorIndex < 0) {
        return true;
      }
      const headerName: string = line.slice(0, separatorIndex).trim();
      return !this.isInvalidatedResponseHeader(headerName);
    });
    return filteredHeaderLines.join(SUBTITLE_CONSTANTS.XHR_HEADER_LINE_SEPARATOR);
  }

  private settleTrackRequestFailure(
    token: object,
    identity: TimedTextRequestIdentity,
    requestSequence: number
  ): void {
    if (!this.isCurrentLifecycle(token)) {
      return;
    }
    this.onTrackRequestFailed(identity.key, identity.videoId, requestSequence);
  }
}
