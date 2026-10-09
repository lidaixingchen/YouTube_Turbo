import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { TimedTextInterceptor } from "../interceptor";
import { SUBTITLE_CONSTANTS } from "../constants";

type TrackCallback = (key: string, text: string, videoId: string, isLatestRequest: boolean, requestSequence: number) => void;

const OFFSET_MS: number = 250;
const SUCCESS_STATUS: number = 200;
const HTTP_FAILURE_STATUS: number = 503;
const OPENED_READY_STATE: number = 1;
const DONE_READY_STATE: number = 4;
const CUE_DURATION_MS: number = 5000;
const TIMEDTEXT_URL: string = "https://www.youtube.com/api/timedtext?v=current-video&lang=en";
const FRENCH_TIMEDTEXT_URL: string = "https://www.youtube.com/api/timedtext?v=current-video&lang=fr";
const GERMAN_TIMEDTEXT_URL: string = "https://www.youtube.com/api/timedtext?v=current-video&lang=de";
const NON_TIMEDTEXT_URL: string = "https://www.youtube.com/api/player";
const FIRST_REQUEST_SEQUENCE: number = 1;
const REINSTALLED_REQUEST_SEQUENCE: number = 2;
const TRACKED_XHR_EVENT_TYPES: readonly string[] = ["readystatechange", "abort", "error", "timeout"];
const REQUEST_LISTENER_COUNT: number = TRACKED_XHR_EVENT_TYPES.length;
type XhrFailureEvent = "abort" | "error" | "timeout";
const XHR_FAILURE_EVENTS: readonly XhrFailureEvent[] = ["abort", "error", "timeout"];
const EMPTY_RESPONSE_STATUSES: readonly number[] = [
  SUBTITLE_CONSTANTS.HTTP_STATUS_NO_CONTENT,
  SUBTITLE_CONSTANTS.HTTP_STATUS_RESET_CONTENT
];

interface CapturedFailure {
  readonly key: string;
  readonly videoId: string;
  readonly requestSequence: number;
}

function makePayload(text: string = "Caption"): string {
  return JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: CUE_DURATION_MS, segs: [{ utf8: text }] }] });
}

class LifecycleXHR extends window.EventTarget {
  public readyState: number = 0;
  public status: number = 0;
  public responseType: string = "";
  public dispatchOpenReadyStateChange: boolean = false;
  public openFailure: Error | null = null;
  public readonly openArguments: unknown[][] = [];
  public readonly openReceivers: unknown[] = [];
  public sendFailure: Error | null = null;
  public readonly listenerCountsAtSend: number[] = [];
  private payload: string = "";
  private readonly listenersByType: Map<string, Set<EventListenerOrEventListenerObject>> = new Map();

  public override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, callback, options);
    if (!callback) {
      return;
    }
    const listeners: Set<EventListenerOrEventListenerObject> = this.listenersByType.get(type) ?? new Set();
    listeners.add(callback);
    this.listenersByType.set(type, listeners);
  }

  public override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    super.removeEventListener(type, callback, options);
    if (!callback) {
      return;
    }
    const listeners: Set<EventListenerOrEventListenerObject> | undefined = this.listenersByType.get(type);
    listeners?.delete(callback);
    if (listeners?.size === 0) {
      this.listenersByType.delete(type);
    }
  }

  public open(method: string, url: string | URL, ...rest: [boolean?, string?, string?]): void {
    this.openReceivers.push(this);
    this.openArguments.push([method, url, ...rest]);
    if (this.openFailure) {
      throw this.openFailure;
    }
    this.readyState = OPENED_READY_STATE;
    this.status = 0;
    this.payload = "";
    if (this.dispatchOpenReadyStateChange) {
      this.dispatchEvent(new Event("readystatechange"));
    }
  }

  public send(_body?: Document | XMLHttpRequestBodyInit | null): void {
    this.listenerCountsAtSend.push(this.getActiveRequestListenerCount());
    if (this.sendFailure) {
      throw this.sendFailure;
    }
  }
  public get responseText(): string { return this.payload; }
  public get response(): string { return this.payload; }

  public getActiveRequestListenerCount(): number {
    let listenerCount: number = 0;
    for (const eventType of TRACKED_XHR_EVENT_TYPES) {
      listenerCount += this.listenersByType.get(eventType)?.size ?? 0;
    }
    return listenerCount;
  }

  public finish(payload: string, status: number = SUCCESS_STATUS): void {
    this.payload = payload;
    this.readyState = DONE_READY_STATE;
    this.status = status;
    this.dispatchEvent(new Event("readystatechange"));
  }

  public fail(eventType: XhrFailureEvent): void {
    this.dispatchEvent(new Event(eventType));
  }
}

class SynchronousOpenLifecycleXHR extends LifecycleXHR {
  public constructor() {
    super();
    this.dispatchOpenReadyStateChange = true;
  }
}

describe("TimedTextInterceptor lifecycle ownership", (): void => {
  let interceptor: TimedTextInterceptor | null = null;
  let fetchDescriptor: PropertyDescriptor | undefined;
  let xhrDescriptor: PropertyDescriptor | undefined;

  beforeEach((): void => {
    fetchDescriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    xhrDescriptor = Object.getOwnPropertyDescriptor(window, "XMLHttpRequest");
    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: (): Promise<Response> => Promise.resolve(new Response(makePayload()))
    });
    Object.defineProperty(window, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: LifecycleXHR
    });
  });

  afterEach((): void => {
    interceptor?.destroy();
    interceptor = null;
    if (fetchDescriptor) Object.defineProperty(window, "fetch", fetchDescriptor);
    else Reflect.deleteProperty(window, "fetch");
    if (xhrDescriptor) Object.defineProperty(window, "XMLHttpRequest", xhrDescriptor);
    else Reflect.deleteProperty(window, "XMLHttpRequest");
  });

  it.each([false, true])("ignores an old fetch response after destroy, reinstall=%s", async (reinstall: boolean): Promise<void> => {
    let resolveResponse: (response: Response) => void = (): void => {};
    const pendingResponse: Promise<Response> = new Promise<Response>((resolve: (response: Response) => void): void => {
      resolveResponse = resolve;
    });
    window.fetch = (): Promise<Response> => pendingResponse;
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();
    const pendingFetch: Promise<Response> = window.fetch(TIMEDTEXT_URL);
    interceptor.destroy();
    if (reinstall) interceptor.install();
    const payload: string = makePayload();
    resolveResponse(new Response(payload));
    const response: Response = await pendingFetch;
    expect(await response.text()).toBe(payload);
    expect(onTrack).not.toHaveBeenCalled();
  });

  it("preserves the raw response when destroyed while its body is being read", async (): Promise<void> => {
    let resolveText: (text: string) => void = (): void => {};
    const pendingText: Promise<string> = new Promise<string>((resolve: (text: string) => void): void => {
      resolveText = resolve;
    });
    const sourceResponse: Response = new Response(makePayload());
    const clonedResponse: Response = sourceResponse.clone();
    const readBody: Mock<() => Promise<string>> = vi.spyOn(clonedResponse, "text").mockReturnValue(pendingText);
    vi.spyOn(sourceResponse, "clone").mockReturnValue(clonedResponse);
    window.fetch = (): Promise<Response> => Promise.resolve(sourceResponse);
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();
    const pendingFetch: Promise<Response> = window.fetch(TIMEDTEXT_URL);
    await Promise.resolve();
    expect(readBody).toHaveBeenCalledOnce();
    interceptor.destroy();
    const payload: string = makePayload();
    resolveText(payload);
    const response: Response = await pendingFetch;
    expect(response).toBe(sourceResponse);
    expect(await response.text()).toBe(payload);
    expect(onTrack).not.toHaveBeenCalled();
  });

  it.each(EMPTY_RESPONSE_STATUSES)("preserves native no-body response semantics for status %s", async (status: number): Promise<void> => {
    const sourceResponse: Response = new Response(null, { status });
    window.fetch = (): Promise<Response> => Promise.resolve(sourceResponse);
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();

    const response: Response = await window.fetch(TIMEDTEXT_URL);

    expect(response).toBe(sourceResponse);
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe("");
    expect(onTrack).toHaveBeenCalledOnce();
    expect(onTrack.mock.calls[0]).toEqual(["current-video_en_", "", "current-video", true, FIRST_REQUEST_SEQUENCE]);
  });

  it.each(EMPTY_RESPONSE_STATUSES)("keeps a no-body response successful when destroyed during body read for status %s", async (status: number): Promise<void> => {
    let resolveText: (text: string) => void = (): void => {};
    const pendingText: Promise<string> = new Promise<string>((resolve: (text: string) => void): void => {
      resolveText = resolve;
    });
    const sourceResponse: Response = new Response(null, { status });
    const clonedResponse: Response = sourceResponse.clone();
    const readBody: Mock<() => Promise<string>> = vi.spyOn(clonedResponse, "text").mockReturnValue(pendingText);
    vi.spyOn(sourceResponse, "clone").mockReturnValue(clonedResponse);
    window.fetch = (): Promise<Response> => Promise.resolve(sourceResponse);
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();

    const pendingFetch: Promise<Response> = window.fetch(TIMEDTEXT_URL);
    await Promise.resolve();
    expect(readBody).toHaveBeenCalledOnce();
    interceptor.destroy();
    resolveText("");

    const response: Response = await pendingFetch;
    expect(response).toBe(sourceResponse);
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe("");
    expect(onTrack).not.toHaveBeenCalled();
  });

  it("keeps the original response readable when interception fails after reading its clone", async (): Promise<void> => {
    const sourceResponse: Response = new Response(makePayload());
    const interceptionError: Error = new Error("track callback failed");
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>(
      (_key: string, _text: string, _videoId: string, _isLatestRequest: boolean, _requestSequence: number): void => {
        throw interceptionError;
      }
    );
    window.fetch = (): Promise<Response> => Promise.resolve(sourceResponse);
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();
    const originalConsoleError: typeof console.error = console.error;
    console.error = (): void => {};

    try {
      const response: Response = await window.fetch(TIMEDTEXT_URL);

      expect(response).toBe(sourceResponse);
      expect(await response.text()).toBe(makePayload());
      expect(onTrack).toHaveBeenCalledOnce();
    } finally {
      console.error = originalConsoleError;
    }
  });

  it.each([false, true])("ignores an old XHR response after destroy, reinstall=%s", (reinstall: boolean): void => {
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();
    const xhr: LifecycleXHR = new LifecycleXHR();
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    interceptor.destroy();
    if (reinstall) interceptor.install();
    const payload: string = makePayload();
    xhr.finish(payload);
    expect(xhr.responseText).toBe(payload);
    expect(xhr.response).toBe(payload);
    expect(onTrack).not.toHaveBeenCalled();
  });

  it("keeps a later same-video XHR track active when the older response finishes last", (): void => {
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();

    const olderRequest: LifecycleXHR = new LifecycleXHR();
    olderRequest.open("GET", "https://www.youtube.com/api/timedtext?v=current-video&lang=en");
    olderRequest.send();
    const latestRequest: LifecycleXHR = new LifecycleXHR();
    latestRequest.open("GET", "https://www.youtube.com/api/timedtext?v=current-video&lang=fr");
    latestRequest.send();

    latestRequest.finish(makePayload("French"));
    olderRequest.finish(makePayload("English"));

    expect(onTrack.mock.calls.map((call: Parameters<TrackCallback>): [string, boolean, number] => [call[0], call[3], call[4]])).toEqual([
      ["current-video_fr_", true, 2],
      ["current-video_en_", false, 1]
    ]);
    expect(JSON.parse(latestRequest.responseText).events[0].tStartMs).toBe(OFFSET_MS);
    expect(JSON.parse(olderRequest.responseText).events[0].tStartMs).toBe(0);
  });

  it("releases listeners when one XHR is reused across success, replacement, and failures", (): void => {
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    const failedRequests: CapturedFailure[] = [];
    interceptor = new TimedTextInterceptor(
      (): number => OFFSET_MS,
      onTrack,
      (): void => {},
      (key: string, videoId: string, requestSequence: number): void => {
        failedRequests.push({ key, videoId, requestSequence });
      }
    );
    interceptor.install();

    const xhr: LifecycleXHR = new LifecycleXHR();
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    expect(xhr.getActiveRequestListenerCount()).toBe(REQUEST_LISTENER_COUNT);
    xhr.finish(makePayload("First"));
    expect(xhr.getActiveRequestListenerCount()).toBe(0);
    expect(JSON.parse(xhr.responseText).events[0].tStartMs).toBe(OFFSET_MS);
    expect(xhr.response).toBe(xhr.responseText);

    xhr.open("GET", FRENCH_TIMEDTEXT_URL);
    xhr.send();
    expect(xhr.getActiveRequestListenerCount()).toBe(REQUEST_LISTENER_COUNT);
    xhr.open("GET", GERMAN_TIMEDTEXT_URL);
    expect(xhr.getActiveRequestListenerCount()).toBe(0);
    expect(failedRequests.map((request: CapturedFailure): number => request.requestSequence)).toEqual([2]);

    xhr.send();
    expect(xhr.getActiveRequestListenerCount()).toBe(REQUEST_LISTENER_COUNT);
    xhr.finish(makePayload("Third"));
    expect(xhr.getActiveRequestListenerCount()).toBe(0);

    for (const failureEvent of XHR_FAILURE_EVENTS) {
      xhr.open("GET", TIMEDTEXT_URL);
      xhr.send();
      expect(xhr.getActiveRequestListenerCount()).toBe(REQUEST_LISTENER_COUNT);
      xhr.fail(failureEvent);
      expect(xhr.getActiveRequestListenerCount()).toBe(0);
    }

    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    expect(xhr.getActiveRequestListenerCount()).toBe(REQUEST_LISTENER_COUNT);
    xhr.finish("", HTTP_FAILURE_STATUS);
    expect(xhr.getActiveRequestListenerCount()).toBe(0);

    xhr.open("GET", TIMEDTEXT_URL);
    xhr.sendFailure = new Error("send failed");
    const sendCallIndex: number = xhr.listenerCountsAtSend.length;
    expect((): void => xhr.send()).toThrow("send failed");
    expect(xhr.listenerCountsAtSend[sendCallIndex]).toBe(REQUEST_LISTENER_COUNT);
    expect(xhr.getActiveRequestListenerCount()).toBe(0);
    xhr.sendFailure = null;

    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    expect(xhr.getActiveRequestListenerCount()).toBe(REQUEST_LISTENER_COUNT);
    xhr.open("GET", NON_TIMEDTEXT_URL);
    expect(xhr.getActiveRequestListenerCount()).toBe(0);
    xhr.send();
    expect(xhr.getActiveRequestListenerCount()).toBe(0);

    expect(failedRequests.map((request: CapturedFailure): number => request.requestSequence)).toEqual([2, 4, 5, 6, 7, 8, 9]);
    expect(onTrack.mock.calls.map((call: Parameters<TrackCallback>): number => call[4])).toEqual([1, 3]);
    expect(onTrack.mock.calls.map((call: Parameters<TrackCallback>): string => call[0])).toEqual([
      "current-video_en_",
      "current-video_de_"
    ]);
  });

  it("preserves the active request when the native open operation throws", (): void => {
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    const failedRequests: CapturedFailure[] = [];
    interceptor = new TimedTextInterceptor(
      (): number => OFFSET_MS,
      onTrack,
      (): void => {},
      (key: string, videoId: string, requestSequence: number): void => {
        failedRequests.push({ key, videoId, requestSequence });
      }
    );
    interceptor.install();

    const xhr: LifecycleXHR = new LifecycleXHR();
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    const responseTextGetter: (() => string | null) | undefined = Object.getOwnPropertyDescriptor(xhr, "responseText")?.get;
    const responseGetter: (() => unknown) | undefined = Object.getOwnPropertyDescriptor(xhr, "response")?.get;
    const openFailure: Error = new Error("native open validation failed");
    xhr.openFailure = openFailure;

    let thrownError: unknown;
    try {
      xhr.open("INVALID METHOD", NON_TIMEDTEXT_URL, false, "user", "password");
    } catch (error: unknown) {
      thrownError = error;
    }
    expect(thrownError).toBe(openFailure);
    expect(xhr.openReceivers[xhr.openReceivers.length - 1]).toBe(xhr);
    expect(xhr.openArguments[xhr.openArguments.length - 1]).toEqual([
      "INVALID METHOD",
      NON_TIMEDTEXT_URL,
      false,
      "user",
      "password"
    ]);
    expect(xhr.getActiveRequestListenerCount()).toBe(REQUEST_LISTENER_COUNT);
    expect(Object.getOwnPropertyDescriptor(xhr, "responseText")?.get).toBe(responseTextGetter);
    expect(Object.getOwnPropertyDescriptor(xhr, "response")?.get).toBe(responseGetter);

    xhr.finish(makePayload("Retained"));

    expect(failedRequests).toEqual([]);
    expect(onTrack.mock.calls.map((call: Parameters<TrackCallback>): [string, string, number] => [call[0], call[2], call[4]])).toEqual([
      ["current-video_en_", "current-video", FIRST_REQUEST_SEQUENCE]
    ]);
    expect(JSON.parse(xhr.responseText).events[0].tStartMs).toBe(OFFSET_MS);
  });

  it("uses a successful nested open from a synchronous ready state event after the outer open returns", (): void => {
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    const failedRequests: CapturedFailure[] = [];
    interceptor = new TimedTextInterceptor(
      (): number => OFFSET_MS,
      onTrack,
      (): void => {},
      (key: string, videoId: string, requestSequence: number): void => {
        failedRequests.push({ key, videoId, requestSequence });
      }
    );
    interceptor.install();

    const xhr: SynchronousOpenLifecycleXHR = new SynchronousOpenLifecycleXHR();
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    let reentered: boolean = false;
    xhr.addEventListener("readystatechange", (): void => {
      if (xhr.readyState !== OPENED_READY_STATE || reentered) {
        return;
      }
      reentered = true;
      xhr.open("GET", GERMAN_TIMEDTEXT_URL);
      xhr.send();
    });

    xhr.open("GET", FRENCH_TIMEDTEXT_URL);
    xhr.finish(makePayload("German"));

    expect(onTrack.mock.calls.map((call: Parameters<TrackCallback>): [string, number] => [call[0], call[4]])).toEqual([
      ["current-video_de_", REINSTALLED_REQUEST_SEQUENCE]
    ]);
    expect(failedRequests.map((request: CapturedFailure): number => request.requestSequence)).toEqual([
      FIRST_REQUEST_SEQUENCE
    ]);
    expect(JSON.parse(xhr.responseText).events[0].tStartMs).toBe(OFFSET_MS);
  });

  it("tracks a send started inside the synchronous ready state event for the pending open target", (): void => {
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();

    const xhr: SynchronousOpenLifecycleXHR = new SynchronousOpenLifecycleXHR();
    let sentDuringOpen: boolean = false;
    xhr.addEventListener("readystatechange", (): void => {
      if (xhr.readyState !== OPENED_READY_STATE || sentDuringOpen) {
        return;
      }
      sentDuringOpen = true;
      xhr.send();
    });

    xhr.open("GET", FRENCH_TIMEDTEXT_URL);
    xhr.finish(makePayload("French"));

    expect(onTrack.mock.calls.map((call: Parameters<TrackCallback>): [string, number] => [call[0], call[4]])).toEqual([
      ["current-video_fr_", FIRST_REQUEST_SEQUENCE]
    ]);
    expect(JSON.parse(xhr.responseText).events[0].tStartMs).toBe(OFFSET_MS);
  });

  it("does not retain a pending send when its start callback destroys and reinstalls the interceptor", (): void => {
    const startedRequests: string[] = [];
    const ingestedRequests: string[] = [];
    let hasReinstalled: boolean = false;
    interceptor = new TimedTextInterceptor(
      (): number => OFFSET_MS,
      (key: string): void => {
        ingestedRequests.push(key);
      },
      (key: string): void => {
        startedRequests.push(key);
        if (!hasReinstalled) {
          hasReinstalled = true;
          interceptor?.destroy();
          interceptor?.install();
        }
      }
    );
    interceptor.install();

    const xhr: SynchronousOpenLifecycleXHR = new SynchronousOpenLifecycleXHR();
    const readyStateListener: EventListener = (): void => {
      if (xhr.readyState === OPENED_READY_STATE && !hasReinstalled) {
        xhr.send();
      }
    };
    xhr.addEventListener("readystatechange", readyStateListener);

    xhr.open("GET", FRENCH_TIMEDTEXT_URL);
    xhr.removeEventListener("readystatechange", readyStateListener);
    expect(xhr.getActiveRequestListenerCount()).toBe(0);

    xhr.open("GET", GERMAN_TIMEDTEXT_URL);
    xhr.send();
    xhr.finish(makePayload("German"));

    expect(startedRequests).toEqual(["current-video_fr_", "current-video_de_"]);
    expect(ingestedRequests).toEqual(["current-video_de_"]);
    expect(xhr.getActiveRequestListenerCount()).toBe(0);
  });

  it("does not let a destroyed open wrapper overwrite a replacement interceptor request", (): void => {
    const replacementRequests: Array<[string, string, number]> = [];
    const replacementInterceptorHolder: { current: TimedTextInterceptor | null } = { current: null };
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, (): void => {});
    interceptor.install();

    const xhr: SynchronousOpenLifecycleXHR = new SynchronousOpenLifecycleXHR();
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    let replaced: boolean = false;
    xhr.addEventListener("readystatechange", (): void => {
      if (xhr.readyState !== OPENED_READY_STATE || replaced) {
        return;
      }
      replaced = true;
      interceptor?.destroy();
      const replacementInterceptor: TimedTextInterceptor = new TimedTextInterceptor(
        (): number => OFFSET_MS,
        (key: string, _rawText: string, videoId: string, _isLatestRequest: boolean, requestSequence: number): void => {
          replacementRequests.push([key, videoId, requestSequence]);
        }
      );
      replacementInterceptorHolder.current = replacementInterceptor;
      replacementInterceptor.install();
      xhr.open("GET", GERMAN_TIMEDTEXT_URL);
      xhr.send();
    });

    try {
      xhr.open("GET", FRENCH_TIMEDTEXT_URL);
      xhr.finish(makePayload("German"));

      expect(replacementRequests).toEqual([["current-video_de_", "current-video", FIRST_REQUEST_SEQUENCE]]);
      expect(JSON.parse(xhr.responseText).events[0].tStartMs).toBe(OFFSET_MS);
    } finally {
      replacementInterceptorHolder.current?.destroy();
    }
  });

  it("keeps a reinstalled interceptor's nested request when the prior open wrapper resumes", (): void => {
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();

    const xhr: SynchronousOpenLifecycleXHR = new SynchronousOpenLifecycleXHR();
    let reinstalled: boolean = false;
    xhr.addEventListener("readystatechange", (): void => {
      if (xhr.readyState !== OPENED_READY_STATE || reinstalled) {
        return;
      }
      reinstalled = true;
      interceptor?.destroy();
      interceptor?.install();
      xhr.open("GET", GERMAN_TIMEDTEXT_URL);
      xhr.send();
    });

    xhr.open("GET", FRENCH_TIMEDTEXT_URL);
    xhr.finish(makePayload("German"));

    expect(onTrack.mock.calls.map((call: Parameters<TrackCallback>): [string, number] => [call[0], call[4]])).toEqual([
      ["current-video_de_", FIRST_REQUEST_SEQUENCE]
    ]);
    expect(JSON.parse(xhr.responseText).events[0].tStartMs).toBe(OFFSET_MS);
  });

  it("removes pending XHR listeners on destroy and preserves instance response getters", (): void => {
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    const onFailure: Mock<(key: string, videoId: string, requestSequence: number) => void> = vi.fn();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack, (): void => {}, onFailure);
    interceptor.install();

    const xhr: LifecycleXHR = new LifecycleXHR();
    xhr.open("GET", TIMEDTEXT_URL);
    xhr.send();
    expect(xhr.getActiveRequestListenerCount()).toBe(REQUEST_LISTENER_COUNT);
    const responseTextGetter: (() => string | null) | undefined =
      Object.getOwnPropertyDescriptor(xhr, "responseText")?.get;
    const responseGetter: (() => unknown) | undefined = Object.getOwnPropertyDescriptor(xhr, "response")?.get;

    interceptor.destroy();

    expect(xhr.getActiveRequestListenerCount()).toBe(0);
    expect(Object.getOwnPropertyDescriptor(xhr, "responseText")?.get).toBe(responseTextGetter);
    expect(Object.getOwnPropertyDescriptor(xhr, "response")?.get).toBe(responseGetter);
    xhr.finish(makePayload("Native"));
    expect(xhr.responseText).toBe(makePayload("Native"));
    expect(xhr.response).toBe(makePayload("Native"));
    expect(onTrack).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("shares request ordering between fetch and XHR for the same video", async (): Promise<void> => {
    let resolveFetch: (response: Response) => void = (): void => {};
    const pendingFetch: Promise<Response> = new Promise<Response>((resolve: (response: Response) => void): void => {
      resolveFetch = resolve;
    });
    window.fetch = (): Promise<Response> => pendingFetch;
    const onTrack: Mock<TrackCallback> = vi.fn<TrackCallback>();
    interceptor = new TimedTextInterceptor((): number => OFFSET_MS, onTrack);
    interceptor.install();

    const olderFetch: Promise<Response> = window.fetch(
      "https://www.youtube.com/api/timedtext?v=current-video&lang=en"
    );
    const latestRequest: LifecycleXHR = new LifecycleXHR();
    latestRequest.open("GET", "https://www.youtube.com/api/timedtext?v=current-video&lang=fr");
    latestRequest.send();
    latestRequest.finish(makePayload("French"));
    resolveFetch(new Response(makePayload("English")));
    const olderResponse: Response = await olderFetch;
    await olderResponse.text();

    expect(onTrack.mock.calls.map((call: Parameters<TrackCallback>): [string, boolean, number] => [call[0], call[3], call[4]])).toEqual([
      ["current-video_fr_", true, 2],
      ["current-video_en_", false, 1]
    ]);
  });

  it("ignores a fetch failure from an earlier lifecycle after reinstall", async (): Promise<void> => {
    let rejectFirst: (reason: Error) => void = (): void => {};
    const firstResponse: Promise<Response> = new Promise<Response>(
      (_resolve: (response: Response) => void, reject: (reason: Error) => void): void => {
        rejectFirst = reject;
      }
    );
    let requestCount: number = 0;
    window.fetch = (): Promise<Response> => {
      requestCount += 1;
      return requestCount === FIRST_REQUEST_SEQUENCE
        ? firstResponse
        : Promise.reject(new Error("reinstalled request failed"));
    };
    const failedRequests: CapturedFailure[] = [];
    interceptor = new TimedTextInterceptor(
      (): number => OFFSET_MS,
      (): void => {},
      (): void => {},
      (key: string, videoId: string, requestSequence: number): void => {
        failedRequests.push({ key, videoId, requestSequence });
      }
    );
    interceptor.install();

    const oldRequest: Promise<Response> = window.fetch(TIMEDTEXT_URL);
    interceptor.destroy();
    interceptor.install();
    const latestRequest: Promise<Response> = window.fetch(TIMEDTEXT_URL);
    await expect(latestRequest).rejects.toThrow("reinstalled request failed");
    rejectFirst(new Error("old lifecycle request failed"));
    await expect(oldRequest).rejects.toThrow("old lifecycle request failed");

    expect(failedRequests).toEqual([
      {
        key: "current-video_en_",
        videoId: "current-video",
        requestSequence: REINSTALLED_REQUEST_SEQUENCE
      }
    ]);
  });
});
