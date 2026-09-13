import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PlayerController } from "../controller";
import { PlayerSpeedFeature } from "../speed-feature";
import { SlotMountBus } from "../../../ui/toolbar/slot-mount-bus";
import { TOOLBAR_CONSTANTS } from "../../../ui/toolbar/constants";
import { PLAYER_CONSTANTS } from "../constants";

const HOVER_SETTLE_DELAY_MS: number = TOOLBAR_CONSTANTS.POPOVER_HOVER_SHOW_DELAY_MS + 50;

describe("Speed Popover Hover Diagnosis", () => {
  let watchPage: HTMLElement;
  let playerContainer: HTMLElement;
  let rightControls: HTMLElement;
  let videoEl: HTMLVideoElement;

  const createPlayerFixture = (): void => {
    playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    playerContainer.className = "html5-video-player";

    videoEl = document.createElement("video");
    playerContainer.appendChild(videoEl);

    const chromeBottom = document.createElement("div");
    chromeBottom.className = "ytp-chrome-bottom";
    const chromeControls = document.createElement("div");
    chromeControls.className = "ytp-chrome-controls";
    rightControls = document.createElement("div");
    rightControls.className = "ytp-right-controls";

    chromeControls.appendChild(rightControls);
    chromeBottom.appendChild(chromeControls);
    playerContainer.appendChild(chromeBottom);
    watchPage.appendChild(playerContainer);

    vi.spyOn(playerContainer, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      width: 800,
      height: 600,
      x: 100,
      y: 50,
      toJSON: (): void => {}
    });
  };

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=diagnosis_test"),
      writable: true,
      configurable: true
    });

    watchPage = document.createElement("ytd-watch-flexy");
    document.body.appendChild(watchPage);
  });

  afterEach(() => {
    PlayerSpeedFeature.disable();
    SlotMountBus.getInstance().destroy();
    PlayerController.getInstance().destroy();
    watchPage.remove();
    vi.restoreAllMocks();
  });

  it("should mount the button after the delayed player appears and self-heal the menu on hover", async (): Promise<void> => {
    vi.useFakeTimers();

    PlayerSpeedFeature.enable();

    expect(document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID)).toBeNull();
    expect(SlotMountBus.getInstance().isSlotPending(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);

    createPlayerFixture();
    PlayerController.getInstance().init();
    SlotMountBus.getInstance().refreshSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY);

    const speedBtn = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(speedBtn).not.toBeNull();
    expect(playerContainer.contains(speedBtn as HTMLElement)).toBe(true);
    expect(SlotMountBus.getInstance().isSlotPending(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(false);

    const initialMenu = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID);
    expect(initialMenu).not.toBeNull();
    initialMenu?.remove();

    speedBtn?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    vi.advanceTimersByTime(HOVER_SETTLE_DELAY_MS);

    const restoredMenu = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID);
    expect(restoredMenu).not.toBeNull();
    expect(restoredMenu?.isConnected).toBe(true);
    expect(restoredMenu?.style.display).toBe("flex");

    vi.useRealTimers();
  });

  it("should restore options menu if it gets removed from DOM by YouTube during video change", async (): Promise<void> => {
    vi.useFakeTimers();

    createPlayerFixture();
    PlayerController.getInstance().init();
    PlayerSpeedFeature.enable();

    const speedBtn = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(speedBtn).not.toBeNull();

    const initialMenu = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID);
    expect(initialMenu).not.toBeNull();
    initialMenu?.remove();
    expect(document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID)).toBeNull();

    speedBtn?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    vi.advanceTimersByTime(HOVER_SETTLE_DELAY_MS);

    const restoredMenu = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID);
    expect(restoredMenu).not.toBeNull();
    expect(restoredMenu?.isConnected).toBe(true);
    expect(restoredMenu?.style.display).toBe("flex");

    vi.useRealTimers();
  });
});
