import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_CONSTANTS } from "../constants";
import { MinibrowserRouter } from "../minibrowser-router";
import type { AppNavigateRequest, AnyFunction } from "../types";

describe("MinibrowserRouter", () => {
  let router: MinibrowserRouter;
  let navigate: AnyFunction;

  const requestForUrl = (url: string): AppNavigateRequest => ({
    command: {
      commandMetadata: {
        webCommandMetadata: {
          url,
          webPageType: "WEB_PAGE_TYPE_CHANNEL"
        }
      },
      browseEndpoint: { browseId: "UC-channel" }
    }
  });

  const createDescriptionPreview = (): HTMLButtonElement => {
    const preview = document.createElement(PAGE_CONSTANTS.SELECTORS.DESCRIPTION_PREVIEW_VIEW_MODEL);
    const button = document.createElement("button");
    button.textContent = "Read more";
    preview.appendChild(button);
    document.body.appendChild(preview);
    return button;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    router = new MinibrowserRouter();

    const pageManager = document.createElement("ytd-page-manager");
    pageManager.id = "page-manager";
    const browse = document.createElement("ytd-browse");
    browse.setAttribute("page-subtype", "home");
    pageManager.appendChild(browse);
    document.body.appendChild(pageManager);

    const rawNavigate: AnyFunction = (..._args: unknown[]): unknown => undefined;
    navigate = router.createPatchedHandleNavigate(rawNavigate);
  });

  afterEach(() => {
    router.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("cancels stale About work and runs only the latest quick navigation", () => {
    navigate(requestForUrl("/@first/about"));
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));

    navigate(requestForUrl("/@second/videos"));
    const staleButton = createDescriptionPreview();
    const staleButtonClick = vi.spyOn(staleButton, "click");
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);
    expect(staleButtonClick).not.toHaveBeenCalled();

    navigate(requestForUrl("/@third/about"));
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
    navigate(requestForUrl("/@fourth/about"));
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));

    document.body.replaceChildren();
    const latestButton = createDescriptionPreview();
    const latestButtonClick = vi.spyOn(latestButton, "click");
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);

    expect(latestButtonClick).toHaveBeenCalledTimes(1);
  });

  it("recognizes encoded international About paths and preserves native navigation", () => {
    const rawNavigate: AnyFunction = vi.fn((_request: unknown): unknown => undefined);
    const navigateAbout: AnyFunction = router.createPatchedHandleNavigate(rawNavigate);
    const aboutUrls: string[] = [
      `/@${encodeURIComponent("中文频道")}/about?feature=share#details`,
      `/@${encodeURIComponent("東京チャンネル")}/about?feature=share#details`,
      `/@${encodeURIComponent("قناة_العربية-1")}/about?feature=share#details`,
      "/@creator.middle·dot_name-1/about?feature=share#details",
      "/@creator_1/about?feature=share#details",
      "/c/legacy_custom-name/about?feature=share#details",
      `/c/${encodeURIComponent("东京频道")}/about?feature=share#details`,
      "/user/legacy_name/about?feature=share#details",
      "/channel/UCabcdefghijABCDEFGHIJ12/about?feature=share#details"
    ];

    for (const url of aboutUrls) {
      const request: AppNavigateRequest = requestForUrl(url);
      const navigationResult: unknown = navigateAbout(request);
      expect(navigationResult).toBeUndefined();
      expect(rawNavigate).toHaveBeenCalledTimes(aboutUrls.indexOf(url) + 1);

      document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
      const aboutButton: HTMLButtonElement = createDescriptionPreview();
      const aboutButtonClick = vi.spyOn(aboutButton, "click");
      vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);

      expect(aboutButtonClick).toHaveBeenCalledTimes(1);
      aboutButton.parentElement?.remove();
    }
  });

  it("keeps native navigation when a URL path has an invalid encoded segment", () => {
    const rawNavigate: AnyFunction = vi.fn((_request: unknown): unknown => undefined);
    const navigateAbout: AnyFunction = router.createPatchedHandleNavigate(rawNavigate);
    const request: AppNavigateRequest = requestForUrl("/@%E0%A4%A/about?feature=share#details");

    navigateAbout(request);
    expect(rawNavigate).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
    const aboutButton: HTMLButtonElement = createDescriptionPreview();
    const aboutButtonClick = vi.spyOn(aboutButton, "click");
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);

    expect(aboutButtonClick).not.toHaveBeenCalled();
  });

  it("cancels a pending About listener on teardown and works in the next lifecycle", () => {
    navigate(requestForUrl("/@before-finish/about"));
    router.destroy();

    const staleButton = createDescriptionPreview();
    const staleButtonClick = vi.spyOn(staleButton, "click");
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);

    expect(staleButtonClick).not.toHaveBeenCalled();
    staleButton.parentElement?.remove();

    navigate(requestForUrl("/@next/about"));
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
    const nextButton = createDescriptionPreview();
    const nextButtonClick = vi.spyOn(nextButton, "click");
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);

    expect(nextButtonClick).toHaveBeenCalledTimes(1);
  });

  it("cancels the About timer on teardown and works in the next lifecycle", () => {
    navigate(requestForUrl("/@after-finish/about"));
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));

    const staleButton = createDescriptionPreview();
    const staleButtonClick = vi.spyOn(staleButton, "click");
    router.destroy();
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);

    expect(staleButtonClick).not.toHaveBeenCalled();
    staleButton.parentElement?.remove();

    navigate(requestForUrl("/@next/about"));
    document.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH));
    const nextButton = createDescriptionPreview();
    const nextButtonClick = vi.spyOn(nextButton, "click");
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);

    expect(nextButtonClick).toHaveBeenCalledTimes(1);
  });

  it("removes the loadstart listener on destroy and installs one listener after restart", () => {
    navigate(requestForUrl("/@before-destroy/videos"));

    const mainVideo = document.createElement("video");
    const otherVideo = document.createElement("video");
    mainVideo.className = "video-stream html5-main-video";
    otherVideo.className = "video-stream html5-main-video";
    Object.defineProperty(otherVideo, "paused", { value: false, configurable: true });
    const pauseSpy = vi.spyOn(otherVideo, "pause").mockImplementation((): void => {});
    document.body.append(mainVideo, otherVideo);

    router.destroy();
    mainVideo.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.LOAD_START, { bubbles: true }));
    expect(pauseSpy).not.toHaveBeenCalled();

    const restartedRouter: MinibrowserRouter = new MinibrowserRouter();
    const restartedNavigate: AnyFunction = restartedRouter.createPatchedHandleNavigate(
      (_request: unknown): unknown => undefined
    );
    try {
      restartedNavigate(requestForUrl("/@after-destroy/videos"));
      mainVideo.dispatchEvent(new Event(PAGE_CONSTANTS.DOM_EVENTS.LOAD_START, { bubbles: true }));
      expect(pauseSpy).toHaveBeenCalledTimes(1);
    } finally {
      restartedRouter.destroy();
    }
  });
});
