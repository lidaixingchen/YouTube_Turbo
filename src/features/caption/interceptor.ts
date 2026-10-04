import { SUBTITLE_CONSTANTS } from "./constants";
import type { YouTubeTimedTextJson3 } from "./types";

interface TimedTextRequestIdentity {
  key: string;
  videoId: string;
}

export class TimedTextInterceptor {
  private isInstalled: boolean = false;
  private lifecycleToken: object = {};
  private requestSequence: number = 0;
  private latestRequestSequenceByVideo: Map<string, number> = new Map();
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
      (): void => {}
  ) {}

  public install(): void {
    if (this.isInstalled) {
      return;
    }
    this.isInstalled = true;
    this.lifecycleToken = {};
    this.requestSequence = 0;
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
      return { key: `${videoId}_${lang}_${tlang}`, videoId };
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
      const response = await originalFetch.apply(this || targetWindow, [input, init]);
      if (!self.isCurrentLifecycle(lifecycleToken) || !identity || requestSequence === null) {
        return response;
      }

      try {
        const originalText = await response.text();
        if (!self.isCurrentLifecycle(lifecycleToken)) {
          return new Response(originalText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
        const isLatestRequest: boolean = self.isLatestRequest(identity.videoId, requestSequence);
        self.onTrackIngested(identity.key, originalText, identity.videoId, isLatestRequest, requestSequence);

        const offsetMs = isLatestRequest ? self.offsetProvider() : 0;
        if (offsetMs === 0) {
          return new Response(originalText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }

        const modifiedText = self.modifyPayload(originalText, offsetMs);

        return new Response(modifiedText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (err) {
        console.error("[TimedTextInterceptor] Fetch intercept error:", err);
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
        const requestUrl: string = xhr.__timedTextUrl || window.location.href;
        const identity: TimedTextRequestIdentity = self.extractRequestIdentityFromUrl(requestUrl);
        const requestSequence: number = self.registerRequest(identity);
        xhr.__timedTextRequestSequence = requestSequence;
        let modifiedResponseText: string | null = null;
        let isIngested = false;

        // 同步懒解析方法：无论在何处被首次调用，保证当 readyState === 4 时即可同步获取修改后内容
        const resolveModifiedPayload = (): string | null => {
          if (!self.isCurrentLifecycle(lifecycleToken) || xhr.__timedTextRequestSequence !== requestSequence) {
            return null;
          }
          if (modifiedResponseText !== null) {
            return modifiedResponseText;
          }
          if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
            const raw = Object.getOwnPropertyDescriptor(xhrProto, "responseText")?.get?.call(xhr);
            if (typeof raw === "string") {
              const isLatestRequest: boolean = self.isLatestRequest(identity.videoId, requestSequence);
              if (!isIngested) {
                self.onTrackIngested(identity.key, raw, identity.videoId, isLatestRequest, requestSequence);
                isIngested = true;
              }
              const offsetMs = isLatestRequest ? self.offsetProvider() : 0;
              if (offsetMs !== 0) {
                modifiedResponseText = self.modifyPayload(raw, offsetMs);
              } else {
                modifiedResponseText = raw;
              }
              return modifiedResponseText;
            }
          }
          return null;
        };

        xhr.addEventListener("readystatechange", function () {
          if (xhr.readyState === 4) {
            resolveModifiedPayload();
          }
        });

        Object.defineProperty(xhr, "responseText", {
          get() {
            const resolved = resolveModifiedPayload();
            return resolved !== null
              ? resolved
              : Object.getOwnPropertyDescriptor(xhrProto, "responseText")?.get?.call(xhr);
          },
          configurable: true
        });

        Object.defineProperty(xhr, "response", {
          get() {
            if (xhr.responseType === "" || xhr.responseType === "text") {
              const resolved = resolveModifiedPayload();
              return resolved !== null
                ? resolved
                : Object.getOwnPropertyDescriptor(xhrProto, "responseText")?.get?.call(xhr);
            }
            return Object.getOwnPropertyDescriptor(xhrProto, "response")?.get?.call(xhr);
          },
          configurable: true
        });
      }

      return rawSend.apply(this, [body]);
    };
  }

  public destroy(): void {
    this.isInstalled = false;
    this.lifecycleToken = {};
    this.latestRequestSequenceByVideo.clear();
    this.requestSequence = 0;
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
}
