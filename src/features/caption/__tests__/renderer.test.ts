import { describe, expect, it } from "vitest";
import { CaptionOverlayRenderer } from "../renderer";
import { SubtitleTimeline } from "../timeline";
import { SUBTITLE_CONSTANTS } from "../constants";

interface CaptionPlayerFixture {
  container: HTMLElement;
  video: HTMLVideoElement;
  ccButton: HTMLElement;
}

const createCaptionPlayer = (): CaptionPlayerFixture => {
  const container: HTMLElement = document.createElement("div");
  container.classList.add(SUBTITLE_CONSTANTS.SELECTOR_PLAYER_CONTAINER.slice(1));
  const video: HTMLVideoElement = document.createElement("video");
  const ccButton: HTMLElement = document.createElement("button");
  ccButton.classList.add(SUBTITLE_CONSTANTS.SELECTOR_SUBTITLES_BUTTON.slice(1));
  ccButton.setAttribute(SUBTITLE_CONSTANTS.ATTR_ARIA_PRESSED, SUBTITLE_CONSTANTS.ATTR_ARIA_PRESSED_TRUE);
  container.append(video, ccButton);
  document.body.appendChild(container);
  return { container, video, ccButton };
};

describe("CaptionOverlayRenderer native caption ownership", () => {
  const FIRST_REQUEST_SEQUENCE: number = 1;
  const SECOND_REQUEST_SEQUENCE: number = 2;

  it("restores replaced containers, restores on CC close, and restores on destroy", () => {
    const firstPlayer: CaptionPlayerFixture = createCaptionPlayer();
    const secondPlayer: CaptionPlayerFixture = createCaptionPlayer();
    const renderer: CaptionOverlayRenderer = new CaptionOverlayRenderer(
      () => ({ sessionOffsetMs: 250, effectiveOffsetMs: 250 }),
      new SubtitleTimeline()
    );

    try {
      renderer.attachVideo(firstPlayer.video, firstPlayer.container);
      renderer.renderCurrentFrame(true);
      expect(firstPlayer.container.classList.contains(SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN)).toBe(true);

      firstPlayer.container.remove();
      renderer.attachVideo(secondPlayer.video, secondPlayer.container);
      expect(firstPlayer.container.classList.contains(SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN)).toBe(false);
      renderer.renderCurrentFrame(true);
      expect(secondPlayer.container.classList.contains(SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN)).toBe(true);

      secondPlayer.ccButton.setAttribute(SUBTITLE_CONSTANTS.ATTR_ARIA_PRESSED, "false");
      renderer.syncCCState();
      renderer.updateGateState();
      expect(secondPlayer.container.classList.contains(SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN)).toBe(false);

      secondPlayer.ccButton.setAttribute(
        SUBTITLE_CONSTANTS.ATTR_ARIA_PRESSED,
        SUBTITLE_CONSTANTS.ATTR_ARIA_PRESSED_TRUE
      );
      renderer.syncCCState();
      renderer.renderCurrentFrame(true);
      expect(secondPlayer.container.classList.contains(SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN)).toBe(true);

      renderer.destroy();
      expect(secondPlayer.container.classList.contains(SUBTITLE_CONSTANTS.CLASS_NATIVE_CAPTIONS_HIDDEN)).toBe(false);
    } finally {
      renderer.destroy();
      document.body.replaceChildren();
    }
  });

  it("removes the displayed cue when the timeline revokes its active track", (): void => {
    const player: CaptionPlayerFixture = createCaptionPlayer();
    const videoId: string = "caption-video";
    Object.defineProperty(window, "location", {
      value: new URL(`https://www.youtube.com/watch?v=${videoId}`),
      configurable: true,
      writable: true
    });
    const cueStartMs: number = SUBTITLE_CONSTANTS.DEFAULT_OFFSET_MS;
    const cueDurationMs: number = SUBTITLE_CONSTANTS.FALLBACK_CUE_DURATION_MS;
    const currentTimeSeconds: number = cueDurationMs / SUBTITLE_CONSTANTS.MS_PER_SECOND;
    const sessionOffsetMs: number = SUBTITLE_CONSTANTS.STEP_OFFSET_MS;
    player.video.currentTime = currentTimeSeconds;
    const timeline: SubtitleTimeline = new SubtitleTimeline();
    const renderer: CaptionOverlayRenderer = new CaptionOverlayRenderer(
      () => ({ sessionOffsetMs, effectiveOffsetMs: sessionOffsetMs }),
      timeline
    );

    try {
      timeline.noteTrackRequest(videoId, "english-track", FIRST_REQUEST_SEQUENCE);
      timeline.ingest(
        "english-track",
        JSON.stringify({
          events: [{ tStartMs: cueStartMs, dDurationMs: cueDurationMs, segs: [{ utf8: "English" }] }]
        }),
        true,
        FIRST_REQUEST_SEQUENCE,
        videoId
      );
      renderer.attachVideo(player.video, player.container);
      renderer.renderCurrentFrame(true);

      const textElement: HTMLElement | null = document.querySelector<HTMLElement>(`.${SUBTITLE_CONSTANTS.BOX_CLASS}`);
      expect(textElement?.textContent).toBe("English");

      timeline.noteTrackRequest(videoId, "french-track", SECOND_REQUEST_SEQUENCE);
      renderer.renderCurrentFrame(true);

      expect(textElement?.textContent).toBe("");
      expect(textElement?.style.display).toBe("none");
    } finally {
      renderer.destroy();
      document.body.replaceChildren();
    }
  });
});
