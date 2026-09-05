import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PlayerController } from "../controller";
import { PlayerSpeedFeature } from "../speed-feature";
import { SlotMountBus } from "../../../ui/toolbar/slot-mount-bus";
import { PLAYER_CONSTANTS } from "../constants";
import { ReactiveDOMRegistry } from "../../../core/dom-registry";

describe("Speed Popover Hover Diagnosis", () => {
  let playerContainer: HTMLElement;
  let rightControls: HTMLElement;
  let videoEl: HTMLVideoElement;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=diagnosis_test"),
      writable: true,
      configurable: true
    });

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
    document.body.appendChild(playerContainer);

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

    PlayerController.getInstance().init();
  });

  afterEach(() => {
    PlayerSpeedFeature.disable();
    SlotMountBus.getInstance().destroy();
    PlayerController.getInstance().destroy();
    playerContainer.remove();
    vi.restoreAllMocks();
  });

  it("should self-heal and display options menu even if player was initially unavailable during createSlotElement", async () => {
    vi.useFakeTimers();

    const getPlayerSpy = vi.spyOn(ReactiveDOMRegistry.getInstance(), "getPlayerContainer").mockReturnValue(null);
    const querySpy = vi.spyOn(document, "querySelector").mockImplementation((selector: string): Element | null => {
      if (selector === PLAYER_CONSTANTS.SELECTORS.PLAYER_CONTAINER) {
        return null;
      }
      return document.body.querySelector(selector);
    });

    PlayerSpeedFeature.enable();

    const speedBtn = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(speedBtn).not.toBeNull();

    getPlayerSpy.mockRestore();
    querySpy.mockRestore();

    speedBtn?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    vi.advanceTimersByTime(200);

    const optionsMenu = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID);
    expect(optionsMenu).not.toBeNull();
    expect(optionsMenu?.isConnected).toBe(true);
    expect(optionsMenu?.style.display).toBe("flex");

    vi.useRealTimers();
  });

  it("should restore options menu if it gets removed from DOM by YouTube during video change", async () => {
    vi.useFakeTimers();

    PlayerSpeedFeature.enable();

    const speedBtn = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(speedBtn).not.toBeNull();

    const initialMenu = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID);
    initialMenu?.remove();
    expect(document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID)).toBeNull();

    speedBtn?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    vi.advanceTimersByTime(200);

    const restoredMenu = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID);
    expect(restoredMenu).not.toBeNull();
    expect(restoredMenu?.isConnected).toBe(true);
    expect(restoredMenu?.style.display).toBe("flex");

    vi.useRealTimers();
  });
});
