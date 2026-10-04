import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimedTextInterceptor } from "../interceptor";
import { SubtitleTimeline } from "../timeline";

const CURRENT_VIDEO_URL: string = "https://www.youtube.com/api/timedtext?v=current-video&lang=en";
const CUE_START_TIME_MS: number = 0;
const CUE_DURATION_MS: number = 5000;
const QUERY_TIME_MS: number = 1000;
const FIRST_FETCH_CALL_NUMBER: number = 1;
const SUCCESS_STATUS: number = 200;
const HTTP_FAILURE_STATUS: number = 503;
const DONE_READY_STATE: number = 4;

type FetchFailureCase = "fetch rejection" | "body read failure" | "HTTP failure";
type XhrFailureCase = "abort" | "error" | "timeout" | "send failure" | "HTTP failure";

interface FailureHarness {
  readonly interceptor: TimedTextInterceptor;
  readonly timeline: SubtitleTimeline;
}

class FailureXHR extends window.EventTarget {
  public readyState: number = 0;
  public status: number = 0;
  public responseType: string = "";
  public sendFailure: Error | null = null;
  private payload: string = "";

  public open(_method: string, _url: string | URL): void {}

  public send(_body?: Document | XMLHttpRequestBodyInit | null): void {
    if (this.sendFailure) {
      throw this.sendFailure;
    }
  }

  public get responseText(): string {
    if (this.responseType !== "" && this.responseType !== "text") {
      throw new DOMException("Response is not text", "InvalidStateError");
    }
    return this.payload;
  }

  public get response(): string {
    return this.payload;
  }

  public finish(status: number, payload: string): void {
    this.payload = payload;
    this.status = status;
    this.readyState = DONE_READY_STATE;
    this.dispatchEvent(new Event("readystatechange"));
  }

  public fail(eventType: "abort" | "error" | "timeout"): void {
    this.dispatchEvent(new Event(eventType));
  }
}

function makePayload(text: string): string {
  return JSON.stringify({
    events: [{ tStartMs: CUE_START_TIME_MS, dDurationMs: CUE_DURATION_MS, segs: [{ utf8: text }] }]
  });
}

function makeHarness(originalFetch: typeof window.fetch): FailureHarness {
  Object.defineProperty(window, "fetch", {
    configurable: true,
    writable: true,
    value: originalFetch
  });
  const timeline: SubtitleTimeline = new SubtitleTimeline();
  const interceptor: TimedTextInterceptor = new TimedTextInterceptor(
    (): number => 0,
    (key: string, rawText: string, videoId: string, isLatest: boolean, sequence: number): void => {
      timeline.ingest(key, rawText, isLatest, sequence, videoId);
    },
    (key: string, videoId: string, sequence: number): void => {
      timeline.noteTrackRequest(videoId, key, sequence);
    },
    (key: string, videoId: string, sequence: number): void => {
      timeline.settleTrackRequestFailure(key, videoId, sequence);
    }
  );
  interceptor.install();
  return { interceptor, timeline };
}

describe("TimedTextInterceptor failure settlement", (): void => {
  let fetchDescriptor: PropertyDescriptor | undefined;
  let xhrDescriptor: PropertyDescriptor | undefined;
  let locationDescriptor: PropertyDescriptor | undefined;
  let harness: FailureHarness | null = null;

  beforeEach((): void => {
    fetchDescriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    xhrDescriptor = Object.getOwnPropertyDescriptor(window, "XMLHttpRequest");
    locationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: new URL("https://www.youtube.com/watch?v=current-video")
    });
    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: FailureXHR
    });
  });

  afterEach((): void => {
    harness?.interceptor.destroy();
    harness = null;
    if (fetchDescriptor) {
      Object.defineProperty(window, "fetch", fetchDescriptor);
    } else {
      Reflect.deleteProperty(window, "fetch");
    }
    if (xhrDescriptor) {
      Object.defineProperty(window, "XMLHttpRequest", xhrDescriptor);
    } else {
      Reflect.deleteProperty(window, "XMLHttpRequest");
    }
    if (locationDescriptor) {
      Object.defineProperty(window, "location", locationDescriptor);
    }
  });

  it.each(["fetch rejection", "body read failure", "HTTP failure"] as const)(
    "restores cached cues after a %s",
    async (failureCase: FetchFailureCase): Promise<void> => {
      const bodyReadError: Error = new Error("body read failed");
      const networkError: Error = new Error("network failed");
      const failedResponse: Response =
        failureCase === "body read failure" ? new Response(makePayload("Unreadable")) : new Response("", {
            status: HTTP_FAILURE_STATUS
          });
      if (failureCase === "body read failure") {
        vi.spyOn(failedResponse, "text").mockRejectedValue(bodyReadError);
      }
      let requestCount: number = 0;
      const originalFetch: typeof window.fetch = (): Promise<Response> => {
        requestCount += 1;
        if (requestCount === FIRST_FETCH_CALL_NUMBER) {
          return Promise.resolve(new Response(makePayload("Cached English")));
        }
        if (failureCase === "fetch rejection") {
          return Promise.reject(networkError);
        }
        if (failureCase === "body read failure" || failureCase === "HTTP failure") {
          return Promise.resolve(failedResponse);
        }
        return Promise.reject(new Error("Unexpected fetch call"));
      };
      harness = makeHarness(originalFetch);

      await window.fetch(CURRENT_VIDEO_URL);
      harness.timeline.clearCurrent();
      const failedRequest: Promise<Response> = window.fetch(CURRENT_VIDEO_URL);
      if (failureCase === "fetch rejection") {
        await expect(failedRequest).rejects.toBe(networkError);
      } else {
        const response: Response = await failedRequest;
        expect(response).toBe(failedResponse);
      }

      expect(harness.timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached English");
    }
  );

  it.each(["abort", "error", "timeout", "send failure", "HTTP failure"] as const)(
    "restores cached cues after XHR %s",
    (failureCase: XhrFailureCase): void => {
      harness = makeHarness((): Promise<Response> => Promise.resolve(new Response("")));
      const cachedRequest: FailureXHR = new FailureXHR();
      cachedRequest.open("GET", CURRENT_VIDEO_URL);
      cachedRequest.send();
      cachedRequest.finish(SUCCESS_STATUS, makePayload("Cached English"));
      expect(cachedRequest.responseText).toBe(makePayload("Cached English"));
      harness.timeline.clearCurrent();

      const failedRequest: FailureXHR = new FailureXHR();
      failedRequest.open("GET", CURRENT_VIDEO_URL);
      if (failureCase === "send failure") {
        failedRequest.sendFailure = new Error("send failed");
        expect((): void => failedRequest.send()).toThrow("send failed");
      } else {
        failedRequest.send();
        if (failureCase === "HTTP failure") {
          failedRequest.finish(HTTP_FAILURE_STATUS, "");
        } else {
          failedRequest.fail(failureCase);
        }
      }

      expect(harness.timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached English");
    }
  );

  it("settles a non-text XHR without reading responseText", (): void => {
    harness = makeHarness((): Promise<Response> => Promise.resolve(new Response("")));
    const cachedRequest: FailureXHR = new FailureXHR();
    cachedRequest.open("GET", CURRENT_VIDEO_URL);
    cachedRequest.send();
    cachedRequest.finish(SUCCESS_STATUS, makePayload("Cached English"));
    harness.timeline.clearCurrent();

    const nonTextRequest: FailureXHR = new FailureXHR();
    nonTextRequest.open("GET", CURRENT_VIDEO_URL);
    nonTextRequest.responseType = "json";
    nonTextRequest.send();
    expect((): void => nonTextRequest.finish(SUCCESS_STATUS, makePayload("Unreadable"))).not.toThrow();

    expect(harness.timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached English");
  });
});
