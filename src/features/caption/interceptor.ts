import { SUBTITLE_CONSTANTS } from "./constants";
import type { YouTubeTimedTextJson3 } from "./types";

interface TimedTextRequestIdentity {
  key: string;
  videoId: string;
}

interface ActiveXhrRequest {
  readonly xhr: XMLHttpRequest;
  readonly settleFailure: () => void;
  readonly cleanup: () => void;
}

export class TimedTextInterceptor {
  private isInstalled: boolean = false;
  private lifecycleToken: object = {};
  private requestSequence: number = 0;
  private latestRequestSequenceByVideo: Map<string, number> = new Map();
  private readonly activeXhrRequests: Set<ActiveXhrRequest> = new Set();
  private readonly xhrRequestByInstance: WeakMap<XMLHttpRequest, ActiveXhrRequest> = new WeakMap();
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
      const data = JSON.parse(text) as YouTubeTimedTextJson3;
      if (!data || !Array.isArray(data.events)) {
        return text;
      }

      for (const event of data.events) {
        if (typeof event.tStartMs === "number" && Number.isFinite(event.tStartMs)) {
          const targetStart = event.tStartMs + offsetMs;
          if (targetStart >= 0) {
            event.tStartMs = targetStart;
          } else {
            const underflowDelta = -targetStart;
            event.tStartMs = 0;
            if (typeof event.dDurationMs === "number" && Number.isFinite(event.dDurationMs)) {
              event.dDurationMs = Math.max(0, event.dDurationMs - underflowDelta);
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

        const modifiedText = self.modifyPayload(originalText, offsetMs);

        return new Response(modifiedText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
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
      const activeRequest: ActiveXhrRequest | undefined = self.xhrRequestByInstance.get(this);
      activeRequest?.settleFailure();
      this.__isTimedText = self.isTimedTextUrl(url);
      this.__timedTextRequestSequence = undefined;
      if (this.__isTimedText) {
        this.__timedTextUrl = typeof url === "string" ? url : url instanceof URL ? url.href : String(url);
      } else {
        this.__timedTextUrl = undefined;
      }
      return (rawOpen as unknown as (...args: unknown[]) => void).apply(this, [method, url, ...rest]) as void;
    };

    xhrProto.send = function (
      this: XMLHttpRequest & {
        __isTimedText?: boolean;
        __timedTextUrl?: string;
        __timedTextRequestSequence?: number;
      },
      body?: Document | XMLHttpRequestBodyInit | null
    ): void {
      if (this.__isTimedText && self.isCurrentLifecycle(lifecycleToken)) {
        const xhr = this;
        const previousRequest: ActiveXhrRequest | undefined = self.xhrRequestByInstance.get(xhr);
        previousRequest?.settleFailure();
        const requestUrl: string = xhr.__timedTextUrl || window.location.href;
        const identity: TimedTextRequestIdentity = self.extractRequestIdentityFromUrl(requestUrl);
        const requestSequence: number = self.registerRequest(identity);
        xhr.__timedTextRequestSequence = requestSequence;
        let modifiedResponseText: string | null = null;
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
          if (!self.isCurrentLifecycle(lifecycleToken) || xhr.__timedTextRequestSequence !== requestSequence) {
            return null;
          }
          if (modifiedResponseText !== null) {
            return modifiedResponseText;
          }
          if (hasSettled) {
            return null;
          }
          if (xhr.readyState !== SUBTITLE_CONSTANTS.XHR_READY_STATE_DONE) {
            return null;
          }
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
          if (offsetMs !== 0) {
            modifiedResponseText = self.modifyPayload(raw, offsetMs);
          } else {
            modifiedResponseText = raw;
          }
          return modifiedResponseText;
        };

        readystatechangeListener = (): void => {
          if (xhr.readyState === SUBTITLE_CONSTANTS.XHR_READY_STATE_DONE) {
            resolveModifiedPayload();
          }
        };
        failureListener = (): void => settleFailure();
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
