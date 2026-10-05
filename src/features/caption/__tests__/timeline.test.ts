import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SubtitleTimeline } from "../timeline";

describe("SubtitleTimeline Piecewise Interval Gate", () => {
  let timeline: SubtitleTimeline;

  const TEST_PAYLOAD_SIMPLE = JSON.stringify({
    events: [
      { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Hello" }] },
      { tStartMs: 4000, dDurationMs: 2000, segs: [{ utf8: "World" }] }
    ]
  });

  const TEST_PAYLOAD_OVERLAPPING = JSON.stringify({
    events: [
      { tStartMs: 1000, dDurationMs: 4000, segs: [{ utf8: "Speaker A" }] },
      { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: "Speaker B" }] }
    ]
  });

  const CACHED_CUE_DURATION_MS: number = 5000;
  const CACHED_CUE_START_TIME_MS: number = 0;
  const QUERY_TIME_MS: number = 1000;
  const FIRST_REQUEST_SEQUENCE: number = 1;
  const SECOND_REQUEST_SEQUENCE: number = 2;
  const THIRD_REQUEST_SEQUENCE: number = 3;
  const UNDERSCORE_VIDEO_ID: string = "ab_cdEFghij";
  let originalLocationDescriptor: PropertyDescriptor | undefined;

  const makeTrackPayload = (text: string): string =>
    JSON.stringify({
      events: [{ tStartMs: CACHED_CUE_START_TIME_MS, dDurationMs: CACHED_CUE_DURATION_MS, segs: [{ utf8: text }] }]
    });

  const setCurrentVideo = (videoId: string = "current-video"): void => {
    Object.defineProperty(window, "location", {
      value: new URL(`https://www.youtube.com/watch?v=${videoId}`),
      configurable: true,
      writable: true
    });
  };

  beforeEach((): void => {
    timeline = new SubtitleTimeline();
    originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
    setCurrentVideo();
  });

  afterEach((): void => {
    if (originalLocationDescriptor) {
      Object.defineProperty(window, "location", originalLocationDescriptor);
    }
    originalLocationDescriptor = undefined;
  });

  it("returns empty string when no subtitles ingested", () => {
    expect(timeline.getActiveCueText(1500)).toBe("");
  });

  it("caches interval snapshot and returns exact string reference within interval", () => {
    timeline.ingest("track-simple", TEST_PAYLOAD_SIMPLE);

    const firstResult = timeline.getActiveCueText(1500);
    expect(firstResult).toBe("Hello");

    const secondResult = timeline.getActiveCueText(2000);
    expect(secondResult).toBe("Hello");
    expect(secondResult).toBe(firstResult);

    const thirdResult = timeline.getActiveCueText(2999);
    expect(thirdResult).toBe("Hello");
    expect(thirdResult).toBe(firstResult);

    // Cross boundary into silent gap [3000, 4000)
    const gapResult = timeline.getActiveCueText(3000);
    expect(gapResult).toBe("");

    const gapResult2 = timeline.getActiveCueText(3500);
    expect(gapResult2).toBe("");

    // Next cue [4000, 6000)
    const nextCueResult = timeline.getActiveCueText(4000);
    expect(nextCueResult).toBe("World");
  });

  it("handles overlapping cues with strictly bounded piecewise constant intervals", () => {
    timeline.ingest("track-overlap", TEST_PAYLOAD_OVERLAPPING);

    // [1000, 2000): Only Speaker A
    const phase1 = timeline.getActiveCueText(1500);
    expect(phase1).toBe("Speaker A");

    // [2000, 4000): Speaker A and Speaker B
    const phase2 = timeline.getActiveCueText(2500);
    expect(phase2).toBe("Speaker A\nSpeaker B");

    // [4000, 5000): Only Speaker A (Speaker B ended at 4000)
    const phase3 = timeline.getActiveCueText(4500);
    expect(phase3).toBe("Speaker A");

    // [5000, infinity): Silence
    const phase4 = timeline.getActiveCueText(5500);
    expect(phase4).toBe("");

    // Backward Seek back into phase 2: must correctly re-evaluate without stale single-speaker snapshot
    const seekBack = timeline.getActiveCueText(3000);
    expect(seekBack).toBe("Speaker A\nSpeaker B");
  });

  it("seamlessly transitions between adjacent cues without gaps", () => {
    const adjacentPayload = JSON.stringify({
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "First" }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: "Second" }] }
      ]
    });
    timeline.ingest("track-adjacent", adjacentPayload);

    expect(timeline.getActiveCueText(1999)).toBe("First");
    expect(timeline.getActiveCueText(2000)).toBe("Second");
    expect(timeline.getActiveCueText(2999)).toBe("Second");
    expect(timeline.getActiveCueText(3000)).toBe("");
  });

  it("handles triple overlapping cues with variable durations", () => {
    const triplePayload = JSON.stringify({
      events: [
        { tStartMs: 1000, dDurationMs: 5000, segs: [{ utf8: "A" }] },
        { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: "B" }] },
        { tStartMs: 3000, dDurationMs: 4000, segs: [{ utf8: "C" }] }
      ]
    });
    timeline.ingest("track-triple", triplePayload);

    // [1000, 2000): A
    expect(timeline.getActiveCueText(1500)).toBe("A");
    // [2000, 3000): A, B
    expect(timeline.getActiveCueText(2500)).toBe("A\nB");
    // [3000, 4000): A, B, C (B ends at 4000)
    expect(timeline.getActiveCueText(3500)).toBe("A\nB\nC");
    // [4000, 6000): A, C (A ends at 6000)
    expect(timeline.getActiveCueText(4500)).toBe("A\nC");
    // [6000, 7000): C (C ends at 7000)
    expect(timeline.getActiveCueText(6500)).toBe("C");
    // [7000, infinity): Silence
    expect(timeline.getActiveCueText(7500)).toBe("");
  });

  it("keeps long cues active behind expired short cues through seeks", () => {
    const longCuePayload = JSON.stringify({
      events: [
        { tStartMs: 1000, dDurationMs: 50000, segs: [{ utf8: "Long cue" }] },
        { tStartMs: 20000, dDurationMs: 1000, segs: [{ utf8: "Short cue" }] }
      ]
    });
    timeline.ingest("track-long-overlap", longCuePayload);

    expect(timeline.getActiveCueText(37000)).toBe("Long cue");
    expect(timeline.getActiveCueText(20000)).toBe("Long cue\nShort cue");
    expect(timeline.getActiveCueText(22000)).toBe("Long cue");
    expect(timeline.getActiveCueText(10000)).toBe("Long cue");

    timeline.resetPointer();
    expect(timeline.getActiveCueText(37000)).toBe("Long cue");
    expect(timeline.getActiveCueText(51000)).toBe("");
  });

  it("resets interval cache on resetPointer and clear", () => {
    timeline.ingest("track-reset", TEST_PAYLOAD_SIMPLE);

    const textBefore = timeline.getActiveCueText(1500);
    expect(textBefore).toBe("Hello");

    timeline.resetPointer();
    const textAfter = timeline.getActiveCueText(1500);
    expect(textAfter).toBe("Hello");

    timeline.clear();
    expect(timeline.getActiveCueText(1500)).toBe("");
  });

  it("handles pre-cue silence from 0ms without swallowing the first cue", () => {
    timeline.ingest("track-precue", TEST_PAYLOAD_SIMPLE); // First cue starts at 1000ms

    expect(timeline.getActiveCueText(0)).toBe("");
    expect(timeline.getActiveCueText(500)).toBe("");
    expect(timeline.getActiveCueText(999)).toBe("");

    // Transition into first cue: MUST display "Hello"
    expect(timeline.getActiveCueText(1000)).toBe("Hello");
    expect(timeline.getActiveCueText(1500)).toBe("Hello");
  });

  it("supports negative timestamp without busting the piecewise gate", () => {
    timeline.ingest("track-negative", TEST_PAYLOAD_SIMPLE);

    const res1 = timeline.getActiveCueText(-500);
    expect(res1).toBe("");

    const res2 = timeline.getActiveCueText(-200);
    expect(res2).toBe("");
    expect(res2).toBe(res1);
  });

  it("handles single cue lifecycle across boundary points", () => {
    const singlePayload = JSON.stringify({
      events: [{ tStartMs: 2000, dDurationMs: 3000, segs: [{ utf8: "Solo" }] }]
    });
    timeline.ingest("track-single", singlePayload);

    expect(timeline.getActiveCueText(1999)).toBe("");
    expect(timeline.getActiveCueText(2000)).toBe("Solo");
    expect(timeline.getActiveCueText(4999)).toBe("Solo");
    expect(timeline.getActiveCueText(5000)).toBe("");
    expect(timeline.getActiveCueText(100000)).toBe("");
  });

  it("activates a valid empty track and preserves its empty cache result", (): void => {
    const englishKey: string = "current-video_en_";
    const frenchKey: string = "current-video_fr_";
    const emptyTrackPayload: string = JSON.stringify({ events: [] });
    timeline.noteTrackRequest("current-video", englishKey, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(englishKey, makeTrackPayload("Cached English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached English");

    timeline.noteTrackRequest("current-video", frenchKey, SECOND_REQUEST_SEQUENCE);
    expect(timeline.ingest(frenchKey, emptyTrackPayload, true, SECOND_REQUEST_SEQUENCE, "current-video")).toEqual([]);

    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
    expect(timeline.settleTrackRequestFailure(frenchKey, "current-video", SECOND_REQUEST_SEQUENCE)).toBe(false);
  });

  it("settles damaged track data as failed and restores the last valid track", (): void => {
    const englishKey: string = "current-video_en_";
    const frenchKey: string = "current-video_fr_";
    const damagedPayload: string = "{\"events\":";
    timeline.noteTrackRequest("current-video", englishKey, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(englishKey, makeTrackPayload("Cached English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    timeline.noteTrackRequest("current-video", frenchKey, SECOND_REQUEST_SEQUENCE);
    timeline.clearCurrent();

    expect(timeline.ingest(frenchKey, damagedPayload, true, SECOND_REQUEST_SEQUENCE, "current-video")).toEqual([]);
    expect(timeline.settleTrackRequestFailure(frenchKey, "current-video", SECOND_REQUEST_SEQUENCE)).toBe(false);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached English");
  });

  it("infers an underscore-containing video ID from a track key", (): void => {
    const key: string = `${UNDERSCORE_VIDEO_ID}_en_`;
    setCurrentVideo(UNDERSCORE_VIDEO_ID);
    timeline.noteTrackRequest(UNDERSCORE_VIDEO_ID, key, FIRST_REQUEST_SEQUENCE);

    timeline.ingest(key, makeTrackPayload("Underscore video"), true, FIRST_REQUEST_SEQUENCE);

    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Underscore video");
    expect(timeline.settleTrackRequestFailure(key, UNDERSCORE_VIDEO_ID, FIRST_REQUEST_SEQUENCE)).toBe(false);
  });

  it("restores a successful same-track cache after the latest duplicate request fails", (): void => {
    const key: string = "current-video_en_";
    timeline.noteTrackRequest("current-video", key, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(key, makeTrackPayload("Cached English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    timeline.clearCurrent();
    timeline.noteTrackRequest("current-video", key, SECOND_REQUEST_SEQUENCE);

    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
    expect(timeline.settleTrackRequestFailure(key, "current-video", SECOND_REQUEST_SEQUENCE)).toBe(true);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached English");
    expect(timeline.settleTrackRequestFailure(key, "current-video", FIRST_REQUEST_SEQUENCE)).toBe(false);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Cached English");
  });

  it.each(["zh_Hans", "en_zh_Hans"])("retains explicit request ownership for language key %s", (languageKey: string): void => {
    const key: string = `${UNDERSCORE_VIDEO_ID}_${languageKey}_`;
    setCurrentVideo(UNDERSCORE_VIDEO_ID);
    timeline.noteTrackRequest(UNDERSCORE_VIDEO_ID, key, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(key, makeTrackPayload("Owned track"), true, FIRST_REQUEST_SEQUENCE);

    expect(timeline.settleTrackRequestFailure(key, UNDERSCORE_VIDEO_ID, FIRST_REQUEST_SEQUENCE)).toBe(false);
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Owned track");
  });

  it("associates an unregistered key with the current video when language values contain underscores", (): void => {
    const key: string = `${UNDERSCORE_VIDEO_ID}_zh_Hans_en_US`;
    setCurrentVideo(UNDERSCORE_VIDEO_ID);
    timeline.ingest(key, makeTrackPayload("Current track"));

    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Current track");
  });

  it("restores an empty same-track cache when the newer request fails", (): void => {
    const olderKey: string = "current-video_en_";
    const emptyKey: string = "current-video_fr_";
    timeline.noteTrackRequest("current-video", olderKey, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(olderKey, makeTrackPayload("Older English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    timeline.noteTrackRequest("current-video", emptyKey, SECOND_REQUEST_SEQUENCE);
    timeline.ingest(emptyKey, JSON.stringify({ events: [] }), true, SECOND_REQUEST_SEQUENCE, "current-video");
    timeline.noteTrackRequest("current-video", emptyKey, THIRD_REQUEST_SEQUENCE);
    timeline.clearCurrent();

    expect(timeline.settleTrackRequestFailure(emptyKey, "current-video", THIRD_REQUEST_SEQUENCE)).toBe(true);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
  });

  it.each(["<timedtext/>", "<transcript/>"])("activates an empty XML track %s", (payload: string): void => {
    const olderKey: string = "current-video_en_";
    const xmlKey: string = "current-video_fr_";
    timeline.noteTrackRequest("current-video", olderKey, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(olderKey, makeTrackPayload("Older English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    timeline.noteTrackRequest("current-video", xmlKey, SECOND_REQUEST_SEQUENCE);
    timeline.ingest(xmlKey, payload, true, SECOND_REQUEST_SEQUENCE, "current-video");

    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
    expect(timeline.settleTrackRequestFailure(xmlKey, "current-video", SECOND_REQUEST_SEQUENCE)).toBe(false);
  });

  it("settles malformed XML as failed and restores the preceding valid track", (): void => {
    const olderKey: string = "current-video_en_";
    const xmlKey: string = "current-video_fr_";
    timeline.noteTrackRequest("current-video", olderKey, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(olderKey, makeTrackPayload("Older English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    timeline.noteTrackRequest("current-video", xmlKey, SECOND_REQUEST_SEQUENCE);
    timeline.clearCurrent();
    timeline.ingest(xmlKey, "<timedtext><", true, SECOND_REQUEST_SEQUENCE, "current-video");

    expect(timeline.settleTrackRequestFailure(xmlKey, "current-video", SECOND_REQUEST_SEQUENCE)).toBe(false);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Older English");
  });

  it("keeps old track data inactive while pending and recovers it after the latest failure", (): void => {
    const englishKey: string = "current-video_en_";
    const frenchKey: string = "current-video_fr_";
    const spanishKey: string = "current-video_es_";
    timeline.noteTrackRequest("current-video", englishKey, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(englishKey, makeTrackPayload("English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    timeline.noteTrackRequest("current-video", frenchKey, SECOND_REQUEST_SEQUENCE);
    timeline.noteTrackRequest("current-video", spanishKey, THIRD_REQUEST_SEQUENCE);
    timeline.ingest(frenchKey, makeTrackPayload("French"), false, SECOND_REQUEST_SEQUENCE, "current-video");
    timeline.clearCurrent();

    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");
    expect(timeline.settleTrackRequestFailure(spanishKey, "current-video", THIRD_REQUEST_SEQUENCE)).toBe(true);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("French");
  });

  it("restores a failed video's own cache without selecting another video's track", (): void => {
    const currentEnglishKey: string = "current-video_en_";
    const currentFrenchKey: string = "current-video_fr_";
    const otherEnglishKey: string = "other-video_en_";
    timeline.noteTrackRequest("current-video", currentEnglishKey, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(currentEnglishKey, makeTrackPayload("Current English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    timeline.noteTrackRequest("other-video", otherEnglishKey, SECOND_REQUEST_SEQUENCE);
    timeline.ingest(otherEnglishKey, makeTrackPayload("Other video"), false, SECOND_REQUEST_SEQUENCE, "other-video");
    timeline.noteTrackRequest("current-video", currentFrenchKey, THIRD_REQUEST_SEQUENCE);
    timeline.clearCurrent();

    expect(timeline.settleTrackRequestFailure(currentFrenchKey, "current-video", THIRD_REQUEST_SEQUENCE)).toBe(true);
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Current English");
  });

  it("does not let an older failure change a newer pending or successful request", (): void => {
    const englishKey: string = "current-video_en_";
    const frenchKey: string = "current-video_fr_";
    timeline.noteTrackRequest("current-video", englishKey, FIRST_REQUEST_SEQUENCE);
    timeline.ingest(englishKey, makeTrackPayload("English"), true, FIRST_REQUEST_SEQUENCE, "current-video");
    timeline.noteTrackRequest("current-video", frenchKey, SECOND_REQUEST_SEQUENCE);
    timeline.noteTrackRequest("current-video", frenchKey, THIRD_REQUEST_SEQUENCE);

    expect(timeline.settleTrackRequestFailure(englishKey, "current-video", FIRST_REQUEST_SEQUENCE)).toBe(false);
    expect(timeline.settleTrackRequestFailure(frenchKey, "current-video", SECOND_REQUEST_SEQUENCE)).toBe(false);
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("");

    timeline.ingest(frenchKey, makeTrackPayload("Latest French"), true, THIRD_REQUEST_SEQUENCE, "current-video");
    expect(timeline.settleTrackRequestFailure(frenchKey, "current-video", THIRD_REQUEST_SEQUENCE)).toBe(false);
    timeline.clearCurrent();
    expect(timeline.getActiveCueText(QUERY_TIME_MS)).toBe("Latest French");
  });
});
