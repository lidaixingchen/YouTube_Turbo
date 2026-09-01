import { SUBTITLE_CONSTANTS } from "./constants";
import type { YouTubeTimedTextJson3 } from "./types";
import { SubtitleTimeline } from "./timeline";

export class TimedTextInterceptor {
  private static isInstalled = false;
  private static offsetProvider: () => number = () => 0;
  private static originalFetch: typeof window.fetch | null = null;
  private static originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
  private static originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

  public static install(offsetProvider: () => number): void {
    this.offsetProvider = offsetProvider;
    if (this.isInstalled) {
      return;
    }
    this.isInstalled = true;

    const targetWindow = typeof unsafeWindow !== "undefined" ? (unsafeWindow as unknown as Window) : window;
    this.hookFetch(targetWindow);
    this.hookXHR(targetWindow);
  }

  public static setOffsetProvider(provider: () => number): void {
    this.offsetProvider = provider;
  }

  private static isTimedTextUrl(url: string | URL | Request): boolean {
    const rawUrl = typeof url === "string" ? url : url instanceof Request ? url.url : url.href;
    return rawUrl.includes(SUBTITLE_CONSTANTS.TIMEDTEXT_API_PATH);
  }

  private static extractKeyFromUrl(url: string): string {
    try {
      const parsed = new URL(url, window.location.origin);
      const videoId = parsed.searchParams.get("v") || "";
      const lang = parsed.searchParams.get("lang") || "default";
      const tlang = parsed.searchParams.get("tlang") || "";
      return `${videoId}_${lang}_${tlang}`;
    } catch {
      return `unknown_${Date.now()}`;
    }
  }

  private static modifyJson3(text: string, offsetMs: number): string {
    if (offsetMs === 0) return text;
    try {
      const data = JSON.parse(text) as YouTubeTimedTextJson3;
      if (!data || !Array.isArray(data.events)) {
        return text;
      }

      for (const event of data.events) {
        if (typeof event.tStartMs === "number") {
          const targetStart = event.tStartMs + offsetMs;
          if (targetStart >= 0) {
            event.tStartMs = targetStart;
          } else {
            const underflowDelta = -targetStart;
            event.tStartMs = 0;
            if (typeof event.dDurationMs === "number") {
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

  private static modifyXml(text: string, offsetMs: number): string {
    if (offsetMs === 0) return text;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/xml");
      const isSrv1 = doc.querySelector("transcript") !== null;

      if (isSrv1) {
        const textNodes = doc.querySelectorAll("text");
        const offsetSec = offsetMs / 1000;
        textNodes.forEach((node) => {
          const startAttr = node.getAttribute("start");
          if (startAttr !== null) {
            const start = parseFloat(startAttr);
            const targetStart = start + offsetSec;
            if (targetStart >= 0) {
              node.setAttribute("start", String(+targetStart.toFixed(3)));
            } else {
              const underflowSec = -targetStart;
              node.setAttribute("start", "0");
              const durAttr = node.getAttribute("dur");
              if (durAttr !== null) {
                const dur = parseFloat(durAttr);
                node.setAttribute("dur", String(Math.max(0, +(dur - underflowSec).toFixed(3))));
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
            const targetT = t + offsetMs;
            if (targetT >= 0) {
              p.setAttribute("t", String(targetT));
            } else {
              const underflowMs = -targetT;
              p.setAttribute("t", "0");
              const dAttr = p.getAttribute("d");
              if (dAttr !== null) {
                const d = parseInt(dAttr, 10);
                p.setAttribute("d", String(Math.max(0, d - underflowMs)));
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

  public static modifyPayload(body: string, offsetMs: number): string {
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

  private static hookFetch(targetWindow: Window): void {
    const originalFetch = targetWindow.fetch;
    this.originalFetch = originalFetch;

    targetWindow.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const response = await originalFetch.apply(this, [input, init]);
      if (!TimedTextInterceptor.isTimedTextUrl(input)) {
        return response;
      }

      try {
        const rawUrl = typeof input === "string" ? input : input instanceof Request ? input.url : input.href;
        const originalText = await response.text();
        const key = TimedTextInterceptor.extractKeyFromUrl(rawUrl);
        SubtitleTimeline.getInstance().ingest(key, originalText);

        const offsetMs = TimedTextInterceptor.offsetProvider();
        if (offsetMs === 0) {
          return new Response(originalText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }

        const modifiedText = TimedTextInterceptor.modifyPayload(originalText, offsetMs);

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

  private static hookXHR(targetWindow: Window): void {
    const xhrProto = (targetWindow as unknown as { XMLHttpRequest?: { prototype: XMLHttpRequest } }).XMLHttpRequest?.prototype;
    if (!xhrProto) return;

    this.originalXHROpen = xhrProto.open;
    this.originalXHRSend = xhrProto.send;
    const rawOpen = xhrProto.open;
    const rawSend = xhrProto.send;

    xhrProto.open = function (
      this: XMLHttpRequest & { __isTimedText?: boolean; __timedTextUrl?: string },
      method: string,
      url: string | URL,
      ...rest: [boolean?, string?, string?]
    ): void {
      this.__isTimedText = TimedTextInterceptor.isTimedTextUrl(url);
      if (this.__isTimedText) {
        this.__timedTextUrl = typeof url === "string" ? url : url.href;
      }
      return (rawOpen as unknown as (...args: unknown[]) => void).apply(this, [method, url, ...rest]) as void;
    };

    xhrProto.send = function (
      this: XMLHttpRequest & { __isTimedText?: boolean; __timedTextUrl?: string },
      body?: Document | XMLHttpRequestBodyInit | null
    ): void {
      if (this.__isTimedText) {
        const xhr = this;
        let modifiedResponseText: string | null = null;

        xhr.addEventListener("readystatechange", function () {
          if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
            if (xhr.responseText) {
              const url = xhr.__timedTextUrl || window.location.href;
              const key = TimedTextInterceptor.extractKeyFromUrl(url);
              SubtitleTimeline.getInstance().ingest(key, xhr.responseText);

              const offsetMs = TimedTextInterceptor.offsetProvider();
              if (offsetMs !== 0) {
                modifiedResponseText = TimedTextInterceptor.modifyPayload(
                  xhr.responseText,
                  offsetMs
                );
              }
            }
          }
        });

        Object.defineProperty(xhr, "responseText", {
          get() {
            return modifiedResponseText !== null
              ? modifiedResponseText
              : Object.getOwnPropertyDescriptor(xhrProto, "responseText")?.get?.call(xhr);
          },
          configurable: true
        });

        Object.defineProperty(xhr, "response", {
          get() {
            if (xhr.responseType === "" || xhr.responseType === "text") {
              return modifiedResponseText !== null ? modifiedResponseText : xhr.responseText;
            }
            return Object.getOwnPropertyDescriptor(xhrProto, "response")?.get?.call(xhr);
          },
          configurable: true
        });
      }

      return rawSend.apply(this, [body]);
    };
  }

  public static destroy(): void {
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
    this.isInstalled = false;
    this.offsetProvider = () => 0;
  }
}
