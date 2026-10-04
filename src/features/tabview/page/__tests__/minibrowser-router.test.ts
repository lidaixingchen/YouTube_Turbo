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
});
