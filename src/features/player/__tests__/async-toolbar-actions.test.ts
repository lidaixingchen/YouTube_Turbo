import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerController, type ScreenshotResult } from "../controller";
import { PLAYER_FEATURE_CONSTANTS } from "../constants";
import { PlayerPiPFeature } from "../pip-feature";
import { PlayerScreenshotFeature } from "../screenshot-feature";
import { SlotMountBus } from "../../../ui/toolbar/slot-mount-bus";
import { Toolbar } from "../../../ui/toolbar/toolbar";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise: Promise<T> = new Promise<T>((resolve, reject): void => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function createPlayerHost(): HTMLElement {
  const page: HTMLElement = document.createElement("ytd-watch-flexy");
  const player: HTMLElement = document.createElement("div");
  player.id = "movie_player";
  const controls: HTMLElement = document.createElement("div");
  controls.className = "ytp-right-controls";
  player.appendChild(controls);
  page.appendChild(player);
  document.body.appendChild(page);
  return page;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("player toolbar async actions", (): void => {
  let host: HTMLElement | null = null;

  beforeEach((): void => {
    PlayerPiPFeature.disable();
    PlayerScreenshotFeature.disable();
    Toolbar.destroy();
    SlotMountBus.getInstance().destroy();
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=player-actions-test"),
      writable: true,
      configurable: true
    });
  });

  afterEach((): void => {
    PlayerPiPFeature.disable();
    PlayerScreenshotFeature.disable();
    Toolbar.destroy();
    SlotMountBus.getInstance().destroy();
    host?.remove();
    host = null;
    vi.restoreAllMocks();
  });

  it("locks actual PiP and screenshot actions while their requests are pending", async (): Promise<void> => {
    host = createPlayerHost();
    const controller: PlayerController = PlayerController.getInstance();
    const pipRequest: Deferred<boolean> = createDeferred<boolean>();
    const screenshotRequest: Deferred<ScreenshotResult | null> = createDeferred<ScreenshotResult | null>();
    const pipSpy = vi.spyOn(controller, "togglePictureInPicture").mockReturnValue(pipRequest.promise);
    const screenshotSpy = vi
      .spyOn(controller, "captureScreenshot")
      .mockReturnValue(screenshotRequest.promise);

    PlayerPiPFeature.enable();
    PlayerScreenshotFeature.enable();
    Toolbar.init();

    const pipButton: HTMLElement | null = document.getElementById(
      `action_${PLAYER_FEATURE_CONSTANTS.ACTIONS.PIP}`
    );
    const screenshotButton: HTMLElement | null = document.getElementById(
      `action_${PLAYER_FEATURE_CONSTANTS.ACTIONS.SCREENSHOT}`
    );
    expect(pipButton).not.toBeNull();
    expect(screenshotButton).not.toBeNull();

    pipButton?.click();
    pipButton?.click();
    screenshotButton?.click();
    screenshotButton?.click();

    expect(pipSpy).toHaveBeenCalledTimes(1);
    expect(screenshotSpy).toHaveBeenCalledTimes(1);

    pipRequest.resolve(true);
    screenshotRequest.resolve(null);
    await flushMicrotasks();
  });

  it("releases the screenshot action lock after a failed capture", async (): Promise<void> => {
    host = createPlayerHost();
    const controller: PlayerController = PlayerController.getInstance();
    const requests: Array<Deferred<ScreenshotResult | null>> = [];
    const screenshotSpy = vi.spyOn(controller, "captureScreenshot").mockImplementation(
      (): Promise<ScreenshotResult | null> => {
        const request: Deferred<ScreenshotResult | null> = createDeferred<ScreenshotResult | null>();
        requests.push(request);
        return request.promise;
      }
    );
    vi.spyOn(console, "error").mockImplementation((): void => {});

    PlayerScreenshotFeature.enable();
    Toolbar.init();

    const firstButton: HTMLElement | null = document.getElementById(
      `action_${PLAYER_FEATURE_CONSTANTS.ACTIONS.SCREENSHOT}`
    );
    expect(firstButton).not.toBeNull();
    firstButton?.click();
    firstButton?.click();
    expect(screenshotSpy).toHaveBeenCalledTimes(1);

    requests[0].reject(new Error("capture failed"));
    await flushMicrotasks();

    const retryButton: HTMLElement | null = document.getElementById(
      `action_${PLAYER_FEATURE_CONSTANTS.ACTIONS.SCREENSHOT}`
    );
    retryButton?.click();
    expect(screenshotSpy).toHaveBeenCalledTimes(2);

    requests[1].resolve(null);
    await flushMicrotasks();
  });

  it("releases the PiP action lock after a failed transition", async (): Promise<void> => {
    host = createPlayerHost();
    const controller: PlayerController = PlayerController.getInstance();
    const requests: Array<Deferred<boolean>> = [];
    const pipSpy = vi.spyOn(controller, "togglePictureInPicture").mockImplementation(
      (): Promise<boolean> => {
        const request: Deferred<boolean> = createDeferred<boolean>();
        requests.push(request);
        return request.promise;
      }
    );
    vi.spyOn(console, "error").mockImplementation((): void => {});

    PlayerPiPFeature.enable();
    Toolbar.init();

    const firstButton: HTMLElement | null = document.getElementById(
      `action_${PLAYER_FEATURE_CONSTANTS.ACTIONS.PIP}`
    );
    expect(firstButton).not.toBeNull();
    firstButton?.click();
    firstButton?.click();
    expect(pipSpy).toHaveBeenCalledTimes(1);

    requests[0].reject(new Error("PiP transition failed"));
    await flushMicrotasks();

    const retryButton: HTMLElement | null = document.getElementById(
      `action_${PLAYER_FEATURE_CONSTANTS.ACTIONS.PIP}`
    );
    retryButton?.click();
    expect(pipSpy).toHaveBeenCalledTimes(2);

    requests[1].resolve(true);
    await flushMicrotasks();
  });
});
