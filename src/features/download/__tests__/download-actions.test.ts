import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageUtil } from "../../../core/storage";
import { Modal } from "../../../ui/modal/modal";
import { SlotMountBus } from "../../../ui/toolbar/slot-mount-bus";
import { Toolbar } from "../../../ui/toolbar/toolbar";
import type { ActionConfig } from "../../../ui/toolbar/types";
import { DOWNLOAD_CONSTANTS } from "../constants";
import { VideoDownloadService } from "../index";

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

function setLocation(url: string): void {
  Object.defineProperty(window, "location", {
    value: new URL(url),
    writable: true,
    configurable: true
  });
}

function createWatchHost(): HTMLElement {
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

describe("VideoDownloadService actions", (): void => {
  let host: HTMLElement | null = null;

  beforeEach((): void => {
    VideoDownloadService.disable();
    Toolbar.destroy();
    SlotMountBus.getInstance().destroy();
    setLocation("https://www.youtube.com/watch?v=download-test");
  });

  afterEach((): void => {
    VideoDownloadService.disable();
    Toolbar.destroy();
    SlotMountBus.getInstance().destroy();
    host?.remove();
    host = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("encodes the complete click-time video URL and keeps it while confirmation is pending", async (): Promise<void> => {
    const targetVideoUrl: string =
      "https://www.youtube.com/watch?app=desktop&v=abc123&list=PL456&t=90s#details";
    const confirmation: Deferred<boolean> = createDeferred<boolean>();
    const openedUrls: string[] = [];
    const storedValues: Map<string, unknown> = new Map<string, unknown>();
    const confirmSpy = vi.spyOn(Modal, "confirm").mockReturnValue(confirmation.promise);

    vi.stubGlobal("GM_getValue", (key: string, defaultValue: unknown): unknown =>
      storedValues.has(key) ? storedValues.get(key) : defaultValue
    );
    vi.stubGlobal("GM_setValue", (key: string, value: unknown): void => {
      storedValues.set(key, value);
    });
    vi.stubGlobal("GM_openInTab", (url: string): void => {
      openedUrls.push(url);
    });

    setLocation(targetVideoUrl);
    const operation: Promise<void> = VideoDownloadService.downloadCurrentVideo();
    expect(confirmSpy).toHaveBeenCalledTimes(1);

    setLocation("https://www.youtube.com/watch?v=navigated-away");
    confirmation.resolve(true);
    await operation;

    expect(openedUrls).toHaveLength(1);
    const serviceUrl: URL = new URL(openedUrls[0]);
    expect(serviceUrl.origin).toBe(DOWNLOAD_CONSTANTS.SERVICE_ORIGIN);
    expect(Array.from(serviceUrl.searchParams.entries())).toEqual([
      [DOWNLOAD_CONSTANTS.SOURCE_PARAMETER, DOWNLOAD_CONSTANTS.SOURCE_VALUE],
      [DOWNLOAD_CONSTANTS.VIDEO_URL_PARAMETER, targetVideoUrl]
    ]);
    expect(serviceUrl.searchParams.get(DOWNLOAD_CONSTANTS.VIDEO_URL_PARAMETER)).toBe(targetVideoUrl);
    expect(storedValues.get(StorageUtil.keys.youtube.downloadingConfirm)).toBe(true);
  });

  it("returns the complete operation promise from all three registered actions", async (): Promise<void> => {
    const operation: Deferred<void> = createDeferred<void>();
    const downloadSpy = vi
      .spyOn(VideoDownloadService, "downloadCurrentVideo")
      .mockReturnValue(operation.promise);
    const registerSpy = vi.spyOn(Toolbar, "registerActions");

    VideoDownloadService.enable();

    const actions: readonly ActionConfig[] = registerSpy.mock.calls[0][0];
    expect(actions).toHaveLength(3);
    const buttonElement: HTMLButtonElement = document.createElement("button");
    for (const action of actions) {
      const result: void | Promise<void> = action.onClick(new MouseEvent("click"), {
        actionId: action.id,
        slot: action.slot,
        buttonElement
      });
      expect(result).toBe(operation.promise);
    }
    expect(downloadSpy).toHaveBeenCalledTimes(3);

    operation.resolve(undefined);
    await operation.promise;
  });

  it("allows the next download action after a rejected request releases the execution lock", async (): Promise<void> => {
    host = createWatchHost();
    setLocation("https://www.youtube.com/watch?v=download-lock");

    const requests: Array<Deferred<void>> = [];
    const downloadSpy = vi.spyOn(VideoDownloadService, "downloadCurrentVideo").mockImplementation(
      (): Promise<void> => {
        const request: Deferred<void> = createDeferred<void>();
        requests.push(request);
        return request.promise;
      }
    );
    vi.spyOn(console, "error").mockImplementation((): void => {});

    VideoDownloadService.enable();
    Toolbar.init();

    const firstButton: HTMLElement | null = document.getElementById("action_download");
    expect(firstButton).not.toBeNull();
    firstButton?.click();
    firstButton?.click();
    expect(downloadSpy).toHaveBeenCalledTimes(1);

    requests[0].reject(new Error("download failed"));
    await flushMicrotasks();

    const retryButton: HTMLElement | null = document.getElementById("action_download");
    retryButton?.click();
    expect(downloadSpy).toHaveBeenCalledTimes(2);

    requests[1].resolve(undefined);
    await flushMicrotasks();
  });
});
