import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { CaptionController } from "../controller";
import { SubtitleTimeline } from "../timeline";
import { resolveCaptionVideoId } from "../video-identity";

type TrackCallback = (key: string, text: string, videoId: string, isLatestRequest: boolean, requestSequence: number) => void;
type TrackRequestCallback = (key: string, videoId: string, requestSequence: number) => void;
type TrackRequestFailureCallback = (key: string, videoId: string, requestSequence: number) => void;

const callbacks = vi.hoisted((): {
  track: TrackCallback | null;
  requestStarted: TrackRequestCallback | null;
  requestFailed: TrackRequestFailureCallback | null;
} => ({ track: null, requestStarted: null, requestFailed: null }));

vi.mock("../interceptor", (): { TimedTextInterceptor: unknown } => ({
  TimedTextInterceptor: class {
    public constructor(
      _provider: () => number,
      callback: TrackCallback,
      requestStarted: TrackRequestCallback,
      requestFailed: TrackRequestFailureCallback
    ) {
      callbacks.track = callback;
      callbacks.requestStarted = requestStarted;
      callbacks.requestFailed = requestFailed;
    }
    public destroy(): void {}
  }
}));

const CUE_DURATION_MS: number = 5000;
const QUERY_TIME_MS: number = 1000;
const FIRST_REQUEST_SEQUENCE: number = 1;
const SECOND_REQUEST_SEQUENCE: number = 2;

function setLocation(path: string): void {
  Object.defineProperty(window, "location", {
    value: new URL(path, "https://www.youtube.com"),
    configurable: true,
    writable: true
  });
}

function startRequest(key: string, videoId: string, requestSequence: number): void {
  const callback: TrackRequestCallback | null = callbacks.requestStarted;
  if (!callback) throw new Error("Caption request callback is unavailable");
  callback(key, videoId, requestSequence);
}

function failRequest(key: string, videoId: string, requestSequence: number): void {
  const callback: TrackRequestFailureCallback | null = callbacks.requestFailed;
  if (!callback) throw new Error("Caption request failure callback is unavailable");
  callback(key, videoId, requestSequence);
}

function ingest(
  text: string,
  videoId: string,
  isLatestRequest: boolean = true,
  requestSequence: number = 1,
  language: string = "en"
): void {
  const callback: TrackCallback | null = callbacks.track;
  if (!callback) throw new Error("Caption callback is unavailable");
  const payload: string = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: CUE_DURATION_MS, segs: [{ utf8: text }] }]
  });
  callback(`${videoId}_${language}_`, payload, videoId, isLatestRequest, requestSequence);
}

afterEach((): void => {
  CaptionController.getInstance().destroy();
});

describe("CaptionController video ownership", (): void => {
  it.each(["/watch?v=current-video", "/shorts/current-video"])(
    "keeps the current track when an old response arrives on %s",
    (path: string): void => {
      setLocation(path);
      CaptionController.getInstance();
      const ingestion: MockInstance<SubtitleTimeline["ingest"]> = vi.spyOn(SubtitleTimeline.prototype, "ingest");
      ingest("Current video", "current-video");
      ingest("Old video", "old-video");
      const timeline: SubtitleTimeline = ingestion.mock.contexts[0] as SubtitleTimeline;
      expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Current video");
    }
  );

  it("does not activate an old response before the current track arrives", (): void => {
    setLocation("/watch?v=current-video");
    CaptionController.getInstance();
    const ingestion: MockInstance<SubtitleTimeline["ingest"]> = vi.spyOn(SubtitleTimeline.prototype, "ingest");
    ingest("Old video", "old-video");
    const timeline: SubtitleTimeline = ingestion.mock.contexts[0] as SubtitleTimeline;
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
    ingest("Current video", "current-video");
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Current video");
  });

  it("keeps an older same-video response cached but inactive while the latest track is pending", (): void => {
    setLocation("/watch?v=current-video");
    CaptionController.getInstance();
    const ingestion: MockInstance<SubtitleTimeline["ingest"]> = vi.spyOn(SubtitleTimeline.prototype, "ingest");

    startRequest("current-video_en_", "current-video", 1);
    startRequest("current-video_fr_", "current-video", 2);
    ingest("English", "current-video", false, 1, "en");

    const timeline: SubtitleTimeline = ingestion.mock.contexts[0] as SubtitleTimeline;
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");

    ingest("French", "current-video", true, 2, "fr");
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("French");
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("French");
  });

  it("keeps the latest same-video track active when the older response arrives last", (): void => {
    setLocation("/watch?v=current-video");
    CaptionController.getInstance();
    const ingestion: MockInstance<SubtitleTimeline["ingest"]> = vi.spyOn(SubtitleTimeline.prototype, "ingest");

    startRequest("current-video_en_", "current-video", 1);
    startRequest("current-video_fr_", "current-video", 2);
    ingest("French", "current-video", true, 2, "fr");
    ingest("English", "current-video", false, 1, "en");

    const timeline: SubtitleTimeline = ingestion.mock.contexts[0] as SubtitleTimeline;
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("French");
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("French");
  });

  it("keeps only the latest same-track offset request eligible for cache restoration", (): void => {
    setLocation("/watch?v=current-video");
    CaptionController.getInstance();
    const ingestion: MockInstance<SubtitleTimeline["ingest"]> = vi.spyOn(SubtitleTimeline.prototype, "ingest");

    startRequest("current-video_en_", "current-video", 1);
    startRequest("current-video_en_", "current-video", 2);
    ingest("Older offset response", "current-video", false, 1, "en");

    const timeline: SubtitleTimeline = ingestion.mock.contexts[0] as SubtitleTimeline;
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");

    ingest("Latest offset response", "current-video", true, 2, "en");
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Latest offset response");
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Latest offset response");
  });

  it("restores the last successful track after the current request fails", (): void => {
    setLocation("/watch?v=current-video");
    CaptionController.getInstance();
    const ingestion: MockInstance<SubtitleTimeline["ingest"]> = vi.spyOn(SubtitleTimeline.prototype, "ingest");
    const trackKey: string = "current-video_en_";

    startRequest(trackKey, "current-video", FIRST_REQUEST_SEQUENCE);
    ingest("Cached caption", "current-video", true, FIRST_REQUEST_SEQUENCE);
    const timeline: SubtitleTimeline = ingestion.mock.contexts[0] as SubtitleTimeline;
    timeline.clearCurrent();
    startRequest(trackKey, "current-video", SECOND_REQUEST_SEQUENCE);

    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
    failRequest(trackKey, "current-video", SECOND_REQUEST_SEQUENCE);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached caption");
  });

  it("restores a cached Shorts track after clearing current cues", (): void => {
    setLocation("/shorts/current-video");
    const timeline: SubtitleTimeline = new SubtitleTimeline();
    const payload: string = JSON.stringify({
      events: [{ tStartMs: 0, dDurationMs: CUE_DURATION_MS, segs: [{ utf8: "Cached Shorts" }] }]
    });
    timeline.ingest("current-video_en_", payload, false);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached Shorts");
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached Shorts");
  });

  it("resolves Shorts identity from its path and leaves non-video routes empty", (): void => {
    expect(resolveCaptionVideoId("https://www.youtube.com/shorts/current-video?v=other-video")).toBe("current-video");
    expect(resolveCaptionVideoId("https://www.youtube.com/")).toBeNull();
  });
});
