import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { TimedTextInterceptor } from "../interceptor";

type TrackCallback = (key: string, text: string, videoId: string, isLatestRequest: boolean, requestSequence: number) => void;

const OFFSET_MS: number = 250;
const SUCCESS_STATUS: number = 200;
const DONE_READY_STATE: number = 4;
const CUE_DURATION_MS: number = 5000;
const TIMEDTEXT_URL: string = "https://www.youtube.com/api/timedtext?v=current-video&lang=en";

function makePayload(text: string = "Caption"): string {
  return JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: CUE_DURATION_MS, segs: [{ utf8: text }] }] });
}

class LifecycleXHR extends window.EventTarget {
  public readyState: number = 0;
  public status: number = 0;
  public responseType: string = "";
  private payload: string = "";

  public open(_method: string, _url: string | URL): void {}
  public send(_body?: Document | XMLHttpRequestBodyInit | null): void {}
  public get responseText(): string { return this.payload; }
  public get response(): string { return this.payload; }

  public finish(payload: string): void {
    this.payload = payload;
    this.readyState = DONE_READY_STATE;
    this.status = SUCCESS_STATUS;
    this.dispatchEvent(new Event("readystatechange"));
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
    const readBody: Mock<() => Promise<string>> = vi.spyOn(sourceResponse, "text").mockReturnValue(pendingText);
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
    expect(await response.text()).toBe(payload);
    expect(onTrack).not.toHaveBeenCalled();
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
});
