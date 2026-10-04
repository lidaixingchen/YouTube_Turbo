import { describe, it, expect, beforeEach } from "vitest";
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

  beforeEach(() => {
    timeline = new SubtitleTimeline();
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
});
