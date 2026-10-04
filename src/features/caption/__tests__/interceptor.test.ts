import { afterEach, describe, expect, it } from "vitest";
import { TimedTextInterceptor } from "../interceptor";
import { SubtitleTimeline } from "../timeline";

interface DeferredResponse {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
}

const createDeferredResponse = (): DeferredResponse => {
  let resolve: (response: Response) => void = (): void => {};
  const promise: Promise<Response> = new Promise<Response>((resolveResponse): void => {
    resolve = resolveResponse;
  });
  return { promise, resolve };
};

const makePayload = (text: string): string =>
  JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: text }] }]
  });

interface CapturedTrackRequest {
  key: string;
  videoId: string;
  requestSequence: number;
}

interface CapturedTrackResponse extends CapturedTrackRequest {
  isLatestRequest: boolean;
}

describe("TimedTextInterceptor response ownership", () => {
  let originalFetchDescriptor: PropertyDescriptor | undefined;
  let interceptor: TimedTextInterceptor | null = null;

  afterEach(() => {
    interceptor?.destroy();
    interceptor = null;
    if (originalFetchDescriptor) {
      Object.defineProperty(window, "fetch", originalFetchDescriptor);
    } else {
      Reflect.deleteProperty(window, "fetch");
    }
    originalFetchDescriptor = undefined;
  });

  it("does not activate an old video's response when it finishes after the new one", async () => {
    originalFetchDescriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    const oldVideoUrl: string = "https://www.youtube.com/api/timedtext?v=old-video&lang=en";
    const newVideoUrl: string = "https://www.youtube.com/api/timedtext?v=new-video&lang=en";
    const oldVideoResponse: DeferredResponse = createDeferredResponse();
    const newVideoResponse: DeferredResponse = createDeferredResponse();
    const responses: Map<string, DeferredResponse> = new Map([
      [oldVideoUrl, oldVideoResponse],
      [newVideoUrl, newVideoResponse]
    ]);
    const originalFetch: typeof window.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const requestUrl: string =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const deferred: DeferredResponse | undefined = responses.get(requestUrl);
      if (!deferred) {
        return Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
      }
      return deferred.promise;
    };
    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch
    });

    const timeline: SubtitleTimeline = new SubtitleTimeline();
    const currentVideoId: string = "new-video";
    interceptor = new TimedTextInterceptor(
      () => 0,
      (
        key: string,
        rawText: string,
        responseVideoId: string,
        isLatestRequest: boolean,
        requestSequence: number
      ): void => {
        timeline.ingest(key, rawText, isLatestRequest && responseVideoId === currentVideoId, requestSequence);
      },
      (key: string, videoId: string, requestSequence: number): void => {
        timeline.noteTrackRequest(videoId, key, requestSequence);
      }
    );
    interceptor.install();

    const oldVideoFetch: Promise<Response> = window.fetch(oldVideoUrl);
    const newVideoFetch: Promise<Response> = window.fetch(newVideoUrl);
    newVideoResponse.resolve(new Response(makePayload("New video")));
    await newVideoFetch;
    oldVideoResponse.resolve(new Response(makePayload("Old video")));
    await oldVideoFetch;

    expect(timeline.getActiveCueText(1000)).toBe("New video");
  });

  it("marks a late response for an older same-video track as stale and preserves the latest track", async () => {
    originalFetchDescriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    const englishUrl: string = "https://www.youtube.com/api/timedtext?v=video&lang=en";
    const frenchUrl: string = "https://www.youtube.com/api/timedtext?v=video&lang=fr";
    const englishResponse: DeferredResponse = createDeferredResponse();
    const frenchResponse: DeferredResponse = createDeferredResponse();
    const responses: Map<string, DeferredResponse> = new Map([
      [englishUrl, englishResponse],
      [frenchUrl, frenchResponse]
    ]);
    const originalFetch: typeof window.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const requestUrl: string = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const deferred: DeferredResponse | undefined = responses.get(requestUrl);
      return deferred ? deferred.promise : Promise.reject(new Error(`Unexpected request: ${requestUrl}`));
    };
    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch
    });

    const timeline: SubtitleTimeline = new SubtitleTimeline();
    const startedRequests: CapturedTrackRequest[] = [];
    const ingestedResponses: CapturedTrackResponse[] = [];
    interceptor = new TimedTextInterceptor(
      () => 250,
      (key: string, rawText: string, videoId: string, isLatestRequest: boolean, requestSequence: number): void => {
        ingestedResponses.push({ key, videoId, isLatestRequest, requestSequence });
        timeline.ingest(key, rawText, isLatestRequest, requestSequence);
      },
      (key: string, videoId: string, requestSequence: number): void => {
        startedRequests.push({ key, videoId, requestSequence });
        timeline.noteTrackRequest(videoId, key, requestSequence);
      }
    );
    interceptor.install();

    const englishFetch: Promise<Response> = window.fetch(englishUrl);
    const frenchFetch: Promise<Response> = window.fetch(frenchUrl);
    frenchResponse.resolve(new Response(makePayload("French")));
    const frenchResult: Response = await frenchFetch;
    englishResponse.resolve(new Response(makePayload("English")));
    const englishResult: Response = await englishFetch;

    expect(startedRequests).toEqual([
      { key: "video_en_", videoId: "video", requestSequence: 1 },
      { key: "video_fr_", videoId: "video", requestSequence: 2 }
    ]);
    expect(ingestedResponses).toEqual([
      { key: "video_fr_", videoId: "video", isLatestRequest: true, requestSequence: 2 },
      { key: "video_en_", videoId: "video", isLatestRequest: false, requestSequence: 1 }
    ]);
    expect(JSON.parse(await frenchResult.text()).events[0].tStartMs).toBe(250);
    expect(JSON.parse(await englishResult.text()).events[0].tStartMs).toBe(0);
    expect(timeline.getActiveCueText(1000)).toBe("French");
  });

  it("allows the latest repeated request for the same track after an offset change", async () => {
    originalFetchDescriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    const englishUrl: string = "https://www.youtube.com/api/timedtext?v=video&lang=en";
    const olderResponse: DeferredResponse = createDeferredResponse();
    const latestResponse: DeferredResponse = createDeferredResponse();
    let requestIndex: number = 0;
    const pendingResponses: DeferredResponse[] = [olderResponse, latestResponse];
    const originalFetch: typeof window.fetch = (): Promise<Response> => {
      const deferred: DeferredResponse | undefined = pendingResponses[requestIndex];
      requestIndex += 1;
      return deferred ? deferred.promise : Promise.reject(new Error("Unexpected request"));
    };
    Object.defineProperty(window, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch
    });

    const ingestedResponses: CapturedTrackResponse[] = [];
    const startedRequests: CapturedTrackRequest[] = [];
    const interceptorOffsetMs: number = 500;
    interceptor = new TimedTextInterceptor(
      () => interceptorOffsetMs,
      (key: string, _rawText: string, videoId: string, isLatestRequest: boolean, requestSequence: number): void => {
        ingestedResponses.push({ key, videoId, isLatestRequest, requestSequence });
      },
      (key: string, videoId: string, requestSequence: number): void => {
        startedRequests.push({ key, videoId, requestSequence });
      }
    );
    interceptor.install();

    const olderFetch: Promise<Response> = window.fetch(englishUrl);
    const latestFetch: Promise<Response> = window.fetch(englishUrl);
    latestResponse.resolve(new Response(makePayload("Latest offset")));
    const latestResult: Response = await latestFetch;
    olderResponse.resolve(new Response(makePayload("Older offset")));
    const olderResult: Response = await olderFetch;

    expect(startedRequests).toEqual([
      { key: "video_en_", videoId: "video", requestSequence: 1 },
      { key: "video_en_", videoId: "video", requestSequence: 2 }
    ]);
    expect(ingestedResponses.map((entry: CapturedTrackResponse): boolean => entry.isLatestRequest)).toEqual([true, false]);
    expect(JSON.parse(await latestResult.text()).events[0].tStartMs).toBe(500);
    expect(JSON.parse(await olderResult.text()).events[0].tStartMs).toBe(0);
  });
});
