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
    vi.useRealTimers();
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

  it("uses native speed buttons, skips disabled presets, and returns focus after selection", (): void => {
    createPlayerFixture();
    PlayerController.getInstance().init();
    PlayerSpeedFeature.enable();

    const speedButtonElement: HTMLElement | null = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(speedButtonElement).toBeInstanceOf(HTMLButtonElement);
    if (!(speedButtonElement instanceof HTMLButtonElement)) {
      throw new Error("The speed trigger must be a native button");
    }

    const menuElement: HTMLElement | null = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID);
    expect(menuElement).not.toBeNull();
    if (!menuElement) {
      throw new Error("The speed menu must be mounted");
    }

    const options: HTMLButtonElement[] = Array.from(
      menuElement.querySelectorAll<HTMLButtonElement>(`.${PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM}`)
    );
    expect(options).toHaveLength(PLAYER_CONSTANTS.PRESET_SPEEDS.length);
    options.forEach((option: HTMLButtonElement): void => {
      expect(option).toBeInstanceOf(HTMLButtonElement);
      expect(option.type).toBe("button");
      expect(option.getAttribute("role")).toBe("menuitemradio");
      expect(option.tabIndex).toBe(TOOLBAR_CONSTANTS.POPOVER_MENU_ITEM_TAB_INDEX);
      expect(option.hasAttribute("aria-checked")).toBe(true);
    });
    expect(menuElement.getAttribute("role")).toBe("menu");
    expect(speedButtonElement.getAttribute("aria-haspopup")).toBe("menu");

    const firstOption: HTMLButtonElement | undefined = options[0];
    const disabledOption: HTMLButtonElement | undefined = options[1];
    const nextEnabledOption: HTMLButtonElement | undefined = options[2];
    if (!firstOption || !disabledOption || !nextEnabledOption) {
      throw new Error("The speed preset list must contain the expected entries");
    }

    disabledOption.disabled = true;
    const speedBeforeActivation: number = PlayerController.getInstance().getSpeed();

    speedButtonElement.click();
    expect(speedButtonElement.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(firstOption);

    const arrowEvent: KeyboardEvent = new KeyboardEvent("keydown", {
      key: TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_DOWN,
      bubbles: true,
      cancelable: true
    });
    firstOption.dispatchEvent(arrowEvent);
    expect(arrowEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nextEnabledOption);

    const enterEvent: KeyboardEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    });
    nextEnabledOption.dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(PlayerController.getInstance().getSpeed()).toBe(speedBeforeActivation);

    firstOption.click();

    expect(PlayerController.getInstance().getSpeed()).toBe(PLAYER_CONSTANTS.PRESET_SPEEDS[0]);
    expect(firstOption.getAttribute("aria-checked")).toBe("true");
    expect(nextEnabledOption.getAttribute("aria-checked")).toBe("false");
    expect(speedButtonElement.getAttribute("aria-expanded")).toBe("false");
    expect(menuElement.style.display).toBe("none");
    expect(document.activeElement).toBe(speedButtonElement);
  });
});
