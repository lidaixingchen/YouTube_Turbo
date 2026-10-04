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
});
