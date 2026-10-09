import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SUBTITLE_CONSTANTS } from "../constants";
import { TimedTextInterceptor } from "../interceptor";
import type { TimedTextEvent, YouTubeTimedTextJson3 } from "../types";

const OFFSET_MS: number = -200;
const POSITIVE_OFFSET_MS: number = 100;
const FIRST_TRACK_REQUEST_SEQUENCE: number = 1;
const SUCCESS_STATUS: number = SUBTITLE_CONSTANTS.HTTP_SUCCESS_STATUS_MIN;
const OPENED_READY_STATE: number = 1;
const DONE_READY_STATE: number = SUBTITLE_CONSTANTS.XHR_READY_STATE_DONE;
const HEADERS_RECEIVED_READY_STATE: number = 2;
const TIMEDTEXT_URL: string = "https://www.youtube.com/api/timedtext?v=caption-video&lang=en";
const NON_TIMEDTEXT_URL: string = "https://www.youtube.com/api/player";
const RESPONSE_URL: string = "https://www.youtube.com/api/timedtext?v=caption-video&lang=en&fmt=json3";
const SECOND_RESPONSE_URL: string = "https://www.youtube.com/api/timedtext?v=caption-video&lang=fr&fmt=json3";
const SOURCE_RESPONSE_HEADERS: readonly (readonly [string, string])[] = [
  ["content-type", "application/json; charset=utf-8"],
  ["content-length", "500"],
  ["content-encoding", "gzip"],
  ["content-range", "bytes 0-499/500"],
  ["content-md5", "caption-digest"],
  ["digest", "sha-256=caption-digest"],
  ["content-digest", "sha-256=caption-digest"],
  ["repr-digest", "sha-256=caption-digest"],
  ["etag", "caption-version"],
  ["x-caption-source", "youtube"]
];

function makePayload(events: TimedTextEvent[]): string {
  const data: YouTubeTimedTextJson3 = { events };
  return JSON.stringify(data);
}

function createSourceResponseHeaders(): Headers {
  const headers: Headers = new Headers();
  for (const [name, value] of SOURCE_RESPONSE_HEADERS) {
    headers.set(name, value);
  }
  return headers;
}

class ResponseHeaderXHR extends window.EventTarget {
  public readyState: number = 0;
  public status: number = 0;
  public responseType: string = "";
  public openFailure: Error | null = null;
  public readonly openArguments: unknown[][] = [];
  public readonly openReceivers: unknown[] = [];
  public dispatchReadystatechangeOnOpen: boolean = false;
  public synchronousResponseOnSend: string | null = null;
  private payload: string = "";
  private responseHeaders: Map<string, string> = new Map<string, string>();

  public open(method: string, url: string | URL, ...rest: [boolean?, string?, string?]): void {
    this.openReceivers.push(this);
    this.openArguments.push([method, url, ...rest]);
    if (this.openFailure) {
      throw this.openFailure;
    }
    this.readyState = OPENED_READY_STATE;
    this.status = 0;
    this.payload = "";
    this.responseHeaders.clear();
    if (this.dispatchReadystatechangeOnOpen) {
      this.dispatchEvent(new Event("readystatechange"));
    }
  }

  public send(_body?: Document | XMLHttpRequestBodyInit | null): void {
    if (this.synchronousResponseOnSend !== null) {
      const payload: string = this.synchronousResponseOnSend;
      this.synchronousResponseOnSend = null;
      this.finish(payload);
    }
  }

  public get responseText(): string {
    return this.payload;
  }

  public get response(): string {
    return this.payload;
  }

  public getResponseHeader(name: string): string | null {
    if (this.readyState < HEADERS_RECEIVED_READY_STATE) {
      return null;
    }
    return this.responseHeaders.get(name.trim().toLowerCase()) ?? null;
  }

  public getAllResponseHeaders(): string {
    if (this.readyState < HEADERS_RECEIVED_READY_STATE) {
      return "";
    }
    const headerLines: string[] = Array.from(this.responseHeaders, ([name, value]: [string, string]): string => {
      return `${name}: ${value}${SUBTITLE_CONSTANTS.XHR_HEADER_LINE_SEPARATOR}`;
    });
    return headerLines.join("");
  }

  public finish(payload: string, status: number = SUCCESS_STATUS): void {
    this.payload = payload;
    this.status = status;
    this.responseHeaders = new Map<string, string>(SOURCE_RESPONSE_HEADERS);
    this.readyState = DONE_READY_STATE;
    this.dispatchEvent(new Event("readystatechange"));
  }
}

describe("TimedTextInterceptor fourth-round caption repairs", (): void => {
  let interceptor: TimedTextInterceptor | null = null;
  let fetchDescriptor: PropertyDescriptor | undefined;
  let xhrDescriptor: PropertyDescriptor | undefined;

  beforeEach((): void => {
    fetchDescriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    xhrDescriptor = Object.getOwnPropertyDescriptor(window, "XMLHttpRequest");
  });

  afterEach((): void => {
    interceptor?.destroy();
    interceptor = null;
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
  });

  it("clips segment offsets with a negative event start while retaining default offsets", (): void => {
    const interceptorForPayload: TimedTextInterceptor = new TimedTextInterceptor((): number => OFFSET_MS, (): void => {});
    const payload: string = makePayload([
      {
        tStartMs: 100,
        dDurationMs: 1000,
        segs: [{ utf8: "later", tOffsetMs: 250 }, { utf8: "earlier", tOffsetMs: 50 }, { utf8: "default" }]
      }
    ]);

    const result: YouTubeTimedTextJson3 = JSON.parse(interceptorForPayload.modifyPayload(payload, OFFSET_MS)) as YouTubeTimedTextJson3;
    const event: TimedTextEvent = result.events[0];

    expect(event.tStartMs).toBe(SUBTITLE_CONSTANTS.TIME_ORIGIN_MS);
    expect(event.dDurationMs).toBe(900);
    expect(event.segs?.map((segment: NonNullable<TimedTextEvent["segs"]>[number]) => segment.tOffsetMs)).toEqual([
      150,
      0,
      undefined
    ]);
  });

  it("preserves segment offsets for normal and fully expired events", (): void => {
    const interceptorForPayload: TimedTextInterceptor = new TimedTextInterceptor((): number => OFFSET_MS, (): void => {});
    const payload: string = makePayload([
      { tStartMs: 400, dDurationMs: 500, segs: [{ utf8: "normal", tOffsetMs: 25 }, { utf8: "default" }] },
      { tStartMs: 50, dDurationMs: 25, segs: [{ utf8: "expired", tOffsetMs: 20 }, { utf8: "default" }] }
    ]);

    const result: YouTubeTimedTextJson3 = JSON.parse(interceptorForPayload.modifyPayload(payload, OFFSET_MS)) as YouTubeTimedTextJson3;

    expect(result.events[0]).toEqual({
      tStartMs: 200,
      dDurationMs: 500,
      segs: [{ utf8: "normal", tOffsetMs: 25 }, { utf8: "default" }]
    });
    expect(result.events[1]).toEqual({
      tStartMs: SUBTITLE_CONSTANTS.TIME_ORIGIN_MS,
      dDurationMs: 0,
      segs: [{ utf8: "expired", tOffsetMs: 0 }, { utf8: "default" }]
    });
  });

  it("keeps modified fetch responses branded, readable, cloneable, and metadata-complete", async (): Promise<void> => {
    const payload: string = makePayload([{ tStartMs: 100, dDurationMs: 1000, segs: [{ utf8: "Caption" }] }]);
    const secondPayload: string = makePayload([{ tStartMs: 50, dDurationMs: 1000, segs: [{ utf8: "French" }] }]);
    const sourceResponse: Response = new Response(payload, {
      status: SUCCESS_STATUS,
      headers: createSourceResponseHeaders()
    });
    Object.defineProperties(sourceResponse, {
      url: { configurable: true, value: RESPONSE_URL },
      type: { configurable: true, value: "cors" },
      redirected: { configurable: true, value: true }
    });
    const secondSourceResponse: Response = new Response(secondPayload, {
      status: SUCCESS_STATUS,
      headers: createSourceResponseHeaders()
    });
    Object.defineProperties(secondSourceResponse, {
      url: { configurable: true, value: SECOND_RESPONSE_URL },
      type: { configurable: true, value: "basic" },
      redirected: { configurable: true, value: false }
    });
    const sourceResponses: Response[] = [sourceResponse, secondSourceResponse];
    let sourceResponseIndex: number = 0;
    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: (): Promise<Response> => {
        const response: Response | undefined = sourceResponses[sourceResponseIndex];
        sourceResponseIndex += 1;
        return response ? Promise.resolve(response) : Promise.reject(new Error("Unexpected timed-text request"));
      }
    });
    interceptor = new TimedTextInterceptor((): number => POSITIVE_OFFSET_MS, (): void => {});
    interceptor.install();

    const response: Response = await window.fetch(TIMEDTEXT_URL);
    const firstClone: Response = response.clone();
    const nestedClone: Response = firstClone.clone();
    const siblingClone: Response = response.clone();
    const borrowedSelfClone: Response = Reflect.apply(response.clone, response, []) as Response;

    expect(response).toBeInstanceOf(Response);
    expect(response.url).toBe(RESPONSE_URL);
    expect(response.type).toBe("cors");
    expect(response.redirected).toBe(true);
    expect(response.status).toBe(SUCCESS_STATUS);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    for (const headerName of SUBTITLE_CONSTANTS.INVALIDATED_RESPONSE_HEADERS) {
      expect(response.headers.has(headerName)).toBe(false);
    }
    expect(response.headers.get("x-caption-source")).toBe("youtube");
    expect(response.bodyUsed).toBe(false);
    for (const clone of [firstClone, nestedClone, siblingClone]) {
      expect(clone.url).toBe(RESPONSE_URL);
      expect(clone.type).toBe("cors");
      expect(clone.redirected).toBe(true);
    }
    expect(JSON.parse(await firstClone.text()).events[0].tStartMs).toBe(200);
    expect(JSON.parse(await nestedClone.text()).events[0].tStartMs).toBe(200);
    expect(JSON.parse(await siblingClone.text()).events[0].tStartMs).toBe(200);
    expect(JSON.parse(await borrowedSelfClone.text()).events[0].tStartMs).toBe(200);
    expect(firstClone.bodyUsed).toBe(true);
    expect((): Response => firstClone.clone()).toThrow(TypeError);
    expect((): Response => Reflect.apply(response.clone, {}, []) as Response).toThrow(TypeError);

    const secondResponse: Response = await window.fetch(TIMEDTEXT_URL);
    const borrowedWrappedClone: Response = Reflect.apply(response.clone, secondResponse, []) as Response;
    const rawSourceResponse: Response = new Response("raw body", { status: SUCCESS_STATUS });
    const borrowedRawClone: Response = Reflect.apply(response.clone, rawSourceResponse, []) as Response;
    const nativePrototypeClone: Response = Reflect.apply(Response.prototype.clone, response, []) as Response;

    expect(secondResponse.url).toBe(SECOND_RESPONSE_URL);
    expect(secondResponse.type).toBe("basic");
    expect(secondResponse.redirected).toBe(false);
    expect(borrowedWrappedClone.url).toBe(SECOND_RESPONSE_URL);
    expect(borrowedWrappedClone.type).toBe("basic");
    expect(borrowedWrappedClone.redirected).toBe(false);
    expect(JSON.parse(await borrowedWrappedClone.text()).events[0].tStartMs).toBe(150);
    expect(borrowedRawClone.url).toBe("");
    expect(borrowedRawClone.type).toBe("default");
    expect(borrowedRawClone.redirected).toBe(false);
    expect(await borrowedRawClone.text()).toBe("raw body");
    expect(nativePrototypeClone.url).toBe("");
    expect(nativePrototypeClone.type).toBe("default");
    expect(nativePrototypeClone.redirected).toBe(false);
    expect(JSON.parse(await nativePrototypeClone.text()).events[0].tStartMs).toBe(200);
    expect(response.bodyUsed).toBe(false);
    expect(JSON.parse(await response.text()).events[0].tStartMs).toBe(200);
    expect(response.bodyUsed).toBe(true);
    expect((): Response => response.clone()).toThrow(TypeError);
    expect(await sourceResponse.text()).toBe(payload);
    expect(await secondSourceResponse.text()).toBe(secondPayload);
  });

  it.each([SUBTITLE_CONSTANTS.DEFAULT_OFFSET_MS, POSITIVE_OFFSET_MS])(
    "returns the original fetch response for zero offset or unchanged payload, offset=%s",
    async (offsetMs: number): Promise<void> => {
      const sourceResponse: Response = new Response("not a timed-text payload", {
        status: SUCCESS_STATUS,
        headers: createSourceResponseHeaders()
      });
      Object.defineProperty(window, "fetch", {
        configurable: true,
        writable: true,
        value: (): Promise<Response> => Promise.resolve(sourceResponse)
      });
      interceptor = new TimedTextInterceptor((): number => offsetMs, (): void => {});
      interceptor.install();

      const response: Response = await window.fetch(TIMEDTEXT_URL);

      expect(response).toBe(sourceResponse);
      expect(response.headers.get("content-length")).toBe("500");
      expect(await response.text()).toBe("not a timed-text payload");
      interceptor.destroy();
      interceptor = null;
    }
  );

  it("returns the original fetch response after the interceptor is disabled", async (): Promise<void> => {
    const sourceResponse: Response = new Response(makePayload([{ tStartMs: 100, dDurationMs: 1000 }]), {
      status: SUCCESS_STATUS,
      headers: createSourceResponseHeaders()
    });
    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: (): Promise<Response> => Promise.resolve(sourceResponse)
    });
    interceptor = new TimedTextInterceptor((): number => POSITIVE_OFFSET_MS, (): void => {});
    interceptor.install();
    interceptor.destroy();

    const response: Response = await window.fetch(TIMEDTEXT_URL);

    expect(response).toBe(sourceResponse);
    expect(JSON.parse(await response.text()).events[0].tStartMs).toBe(100);
  });

  it("keeps the active XHR identity, body rewriting, and header decoration after native open throws", (): void => {
    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: ResponseHeaderXHR
    });
    const originalGetResponseHeader: ResponseHeaderXHR["getResponseHeader"] =
      ResponseHeaderXHR.prototype.getResponseHeader;
    const originalGetAllResponseHeaders: ResponseHeaderXHR["getAllResponseHeaders"] =
      ResponseHeaderXHR.prototype.getAllResponseHeaders;
    const ingestedRequests: Array<[string, string, boolean, number]> = [];
    const failedRequests: Array<[string, string, number]> = [];
    interceptor = new TimedTextInterceptor(
      (): number => POSITIVE_OFFSET_MS,
      (key: string, _rawText: string, videoId: string, isLatestRequest: boolean, requestSequence: number): void => {
        ingestedRequests.push([key, videoId, isLatestRequest, requestSequence]);
      },
      (): void => {},
      (key: string, videoId: string, requestSequence: number): void => {
        failedRequests.push([key, videoId, requestSequence]);
      }
    );
    interceptor.install();

    const xhr: ResponseHeaderXHR = new ResponseHeaderXHR();
    const payload: string = makePayload([{ tStartMs: 100, dDurationMs: 1000, segs: [{ utf8: "Caption" }] }]);
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    const openFailure: Error = new Error("native open validation failed");
    xhr.openFailure = openFailure;

    let thrownError: unknown;
    try {
      xhr.open("INVALID METHOD", SECOND_RESPONSE_URL, false, "user", "password");
    } catch (error: unknown) {
      thrownError = error;
    }
    expect(thrownError).toBe(openFailure);
    expect(xhr.openReceivers[xhr.openReceivers.length - 1]).toBe(xhr);
    expect(xhr.openArguments[xhr.openArguments.length - 1]).toEqual([
      "INVALID METHOD",
      SECOND_RESPONSE_URL,
      false,
      "user",
      "password"
    ]);
    expect(xhr.getResponseHeader).not.toBe(originalGetResponseHeader);
    expect(xhr.getAllResponseHeaders).not.toBe(originalGetAllResponseHeaders);

    xhr.finish(payload);

    expect(ingestedRequests).toEqual([["caption-video_en_", "caption-video", true, FIRST_TRACK_REQUEST_SEQUENCE]]);
    expect(failedRequests).toEqual([]);
    expect(JSON.parse(xhr.responseText).events[0].tStartMs).toBe(200);
    expect(xhr.getResponseHeader("etag")).toBeNull();
    expect(xhr.getResponseHeader("x-caption-source")).toBe("youtube");
  });

  it("defers an active caption request settlement until a synchronous non-caption reopen succeeds", (): void => {
    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: ResponseHeaderXHR
    });
    const originalGetResponseHeader: ResponseHeaderXHR["getResponseHeader"] =
      ResponseHeaderXHR.prototype.getResponseHeader;
    const ingestedRequests: string[] = [];
    const failedRequests: string[] = [];
    interceptor = new TimedTextInterceptor(
      (): number => POSITIVE_OFFSET_MS,
      (key: string): void => {
        ingestedRequests.push(key);
      },
      (): void => {},
      (key: string): void => {
        failedRequests.push(key);
      }
    );
    interceptor.install();

    const xhr: ResponseHeaderXHR = new ResponseHeaderXHR();
    const nonCaptionPayload: string = makePayload([{ tStartMs: 100, dDurationMs: 1000, segs: [{ utf8: "Player" }] }]);
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    xhr.dispatchReadystatechangeOnOpen = true;
    xhr.synchronousResponseOnSend = nonCaptionPayload;
    const observedBodies: string[] = [];
    const observedContentLengths: Array<string | null> = [];
    let sentDuringOpen: boolean = false;
    xhr.addEventListener("readystatechange", (): void => {
      if (xhr.readyState === OPENED_READY_STATE && !sentDuringOpen) {
        sentDuringOpen = true;
        xhr.send();
      } else if (xhr.readyState === DONE_READY_STATE) {
        observedBodies.push(xhr.responseText);
        observedContentLengths.push(xhr.getResponseHeader("content-length"));
      }
    });

    xhr.open("GET", NON_TIMEDTEXT_URL);

    expect(ingestedRequests).toEqual([]);
    expect(failedRequests).toEqual(["caption-video_en_"]);
    expect(observedBodies).toEqual([nonCaptionPayload]);
    expect(observedContentLengths).toEqual(["500"]);
    expect(xhr.getResponseHeader).toBe(originalGetResponseHeader);
    expect(xhr.responseText).toBe(nonCaptionPayload);
  });

  it("bypasses a completed caption decoration during a synchronous non-caption reopen", (): void => {
    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: ResponseHeaderXHR
    });
    const originalGetResponseHeader: ResponseHeaderXHR["getResponseHeader"] =
      ResponseHeaderXHR.prototype.getResponseHeader;
    const ingestedRequests: string[] = [];
    interceptor = new TimedTextInterceptor(
      (): number => POSITIVE_OFFSET_MS,
      (key: string): void => {
        ingestedRequests.push(key);
      }
    );
    interceptor.install();

    const xhr: ResponseHeaderXHR = new ResponseHeaderXHR();
    const captionPayload: string = makePayload([{ tStartMs: 100, dDurationMs: 1000, segs: [{ utf8: "Caption" }] }]);
    const nonCaptionPayload: string = makePayload([{ tStartMs: 300, dDurationMs: 1000, segs: [{ utf8: "Player" }] }]);
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    xhr.finish(captionPayload);
    expect(ingestedRequests).toEqual(["caption-video_en_"]);
    expect(xhr.getResponseHeader("content-length")).toBeNull();

    xhr.dispatchReadystatechangeOnOpen = true;
    xhr.synchronousResponseOnSend = nonCaptionPayload;
    const observedBodies: string[] = [];
    const observedContentLengths: Array<string | null> = [];
    let sentDuringOpen: boolean = false;
    xhr.addEventListener("readystatechange", (): void => {
      if (xhr.readyState === OPENED_READY_STATE && !sentDuringOpen) {
        sentDuringOpen = true;
        xhr.send();
      } else if (xhr.readyState === DONE_READY_STATE) {
        observedBodies.push(xhr.responseText);
        observedContentLengths.push(xhr.getResponseHeader("content-length"));
      }
    });

    xhr.open("GET", NON_TIMEDTEXT_URL);

    expect(ingestedRequests).toEqual(["caption-video_en_"]);
    expect(observedBodies).toEqual([nonCaptionPayload]);
    expect(observedContentLengths).toEqual(["500"]);
    expect(xhr.getResponseHeader).toBe(originalGetResponseHeader);
    expect(xhr.responseText).toBe(nonCaptionPayload);
  });

  it("filters XHR representation headers only for changed text and restores methods on reuse and destroy", (): void => {
    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: ResponseHeaderXHR
    });
    const originalGetResponseHeader: ResponseHeaderXHR["getResponseHeader"] =
      ResponseHeaderXHR.prototype.getResponseHeader;
    const originalGetAllResponseHeaders: ResponseHeaderXHR["getAllResponseHeaders"] =
      ResponseHeaderXHR.prototype.getAllResponseHeaders;
    let offsetMs: number = POSITIVE_OFFSET_MS;
    interceptor = new TimedTextInterceptor((): number => offsetMs, (): void => {});
    interceptor.install();
    const xhr: ResponseHeaderXHR = new ResponseHeaderXHR();
    const payload: string = makePayload([{ tStartMs: 100, dDurationMs: 1000, segs: [{ utf8: "Caption" }] }]);
    let firstContentLength: string | null = null;
    let firstHeaderBlock: string = "";
    const pageReadyStateListener: EventListener = (): void => {
      if (xhr.readyState === DONE_READY_STATE) {
        firstContentLength = xhr.getResponseHeader("content-length");
        firstHeaderBlock = xhr.getAllResponseHeaders();
      }
    };

    xhr.open("GET", TIMEDTEXT_URL);
    xhr.addEventListener("readystatechange", pageReadyStateListener);
    xhr.send();
    xhr.finish(payload);
    expect(JSON.parse(xhr.responseText).events[0].tStartMs).toBe(200);
    expect(firstContentLength).toBeNull();
    expect(firstHeaderBlock).not.toContain("content-length:");
    expect(firstHeaderBlock).not.toContain("content-encoding:");
    expect(xhr.getResponseHeader("content-length")).toBeNull();
    expect(xhr.getResponseHeader("content-type")).toBe("application/json; charset=utf-8");
    expect(xhr.getAllResponseHeaders()).toContain("x-caption-source: youtube");
    expect(xhr.getAllResponseHeaders()).not.toContain("content-encoding:");
    expect(xhr.getAllResponseHeaders()).not.toContain("content-length:");

    xhr.open("GET", TIMEDTEXT_URL);
    expect(xhr.getResponseHeader).toBe(originalGetResponseHeader);
    expect(xhr.getAllResponseHeaders).toBe(originalGetAllResponseHeaders);
    offsetMs = 0;
    xhr.send();
    xhr.finish(payload);
    expect(xhr.responseText).toBe(payload);
    expect(xhr.getResponseHeader("content-length")).toBe("500");
    expect(xhr.getAllResponseHeaders()).toContain("content-encoding: gzip");

    offsetMs = POSITIVE_OFFSET_MS;
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    xhr.finish(payload);
    expect(xhr.getResponseHeader("etag")).toBeNull();
    interceptor.destroy();
    expect(xhr.getResponseHeader).toBe(originalGetResponseHeader);
    expect(xhr.getAllResponseHeaders).toBe(originalGetAllResponseHeaders);
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    xhr.finish(payload);
    expect(xhr.getResponseHeader("content-length")).toBe("500");
    expect(xhr.getAllResponseHeaders()).toContain("etag: caption-version");
  });
});
