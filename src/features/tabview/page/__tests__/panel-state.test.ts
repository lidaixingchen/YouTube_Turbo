import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TabviewPanelState } from "../panel-state";
import { PAGE_CONSTANTS } from "../constants";
import type { RouteGeneration, WatchRouteContext, TabviewPanelStateCallbacks } from "../types";
import {
  installFakeObservers,
  resetFakeObservers,
  assertNoActiveFakeObservers,
  FakeMutationObserver
} from "../../../../test/fake-observers";

describe("TabviewPanelState", () => {
  let panelState: TabviewPanelState;
  let flexy: HTMLElement;
  let callbacks: TabviewPanelStateCallbacks;
  const gen1 = 1 as RouteGeneration;

  beforeEach(() => {
    installFakeObservers();
    resetFakeObservers();

    flexy = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    document.body.appendChild(flexy);

    callbacks = {
      onPlaylistAvailabilityChanged: vi.fn(),
      onCommentsAvailabilityChanged: vi.fn()
    };

    panelState = new TabviewPanelState(callbacks);
  });

  afterEach(() => {
    panelState.destroy();
    assertNoActiveFakeObservers();
    resetFakeObservers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("attaches chat and immediately projects collapsed/open state with dirty checks", () => {
    const context: WatchRouteContext = {
      generation: gen1,
      state: { pageType: "watch", videoId: "v1", playlistId: null, isTheater: false, isLiveStream: false },
      flexy
    };
    panelState.activateRoute(context);

    const chat = document.createElement("ytd-live-chat-frame");
    chat.id = "chat";
    document.body.appendChild(chat);

    const setAttrSpy = vi.spyOn(flexy, "setAttribute");

    // Chat open initially (no collapsed attribute)
    const disposer = panelState.attachChat(chat, gen1);

    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED)).toBe(false);
    expect(flexy.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT)).toBe("+");
    expect(FakeMutationObserver.allInstances.length).toBe(1);

    // Trigger mutation: chat collapses
    chat.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED, "");
    setAttrSpy.mockClear();

    const mo = FakeMutationObserver.allInstances[0];
    mo.trigger([{ target: chat, attributeName: PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED }]);

    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED)).toBe(true);
    expect(flexy.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT)).toBe("-");

    // Trigger identical mutation again -> Dirty Check should avoid redundant setAttribute
    setAttrSpy.mockClear();
    mo.trigger([{ target: chat, attributeName: PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED }]);
    expect(setAttrSpy).not.toHaveBeenCalled();

    // Disposer resets attributes
    disposer();
    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED)).toBe(false);
    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT)).toBe(false);
  });

  it("projects playlist expanded and availability states", () => {
    const context: WatchRouteContext = {
      generation: gen1,
      state: { pageType: "watch", videoId: "v1", playlistId: "p1", isTheater: false, isLiveStream: false },
      flexy
    };
    panelState.activateRoute(context);

    const playlist = document.createElement("ytd-playlist-panel-renderer");
    document.body.appendChild(playlist);

    panelState.attachPlaylist(playlist, gen1);

    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED)).toBe(true);
    expect(callbacks.onPlaylistAvailabilityChanged).toHaveBeenCalledWith(true);

    // Collapsed playlist
    playlist.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED, "");
    const mo = FakeMutationObserver.allInstances[0];
    mo.trigger([{ target: playlist, attributeName: PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED }]);

    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED)).toBe(false);
    expect(callbacks.onPlaylistAvailabilityChanged).toHaveBeenCalledWith(true);
  });

  it("projects comments disabled status and tab button visibility", () => {
    const context: WatchRouteContext = {
      generation: gen1,
      state: { pageType: "watch", videoId: "v1", playlistId: null, isTheater: false, isLiveStream: false },
      flexy
    };
    panelState.activateRoute(context);

    const commentsBtn = document.createElement("button");
    commentsBtn.id = PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS.slice(1);
    document.body.appendChild(commentsBtn);

    const comments = document.createElement("ytd-comments");
    comments.id = "comments";
    document.body.appendChild(comments);

    panelState.attachComments(comments, gen1);

    expect(callbacks.onCommentsAvailabilityChanged).toHaveBeenCalledWith(true);
    expect(commentsBtn.classList.contains(PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN)).toBe(false);

    // comments disabled (data-status = "2")
    comments.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS, "2");
    const mo = FakeMutationObserver.allInstances[0];
    mo.trigger([{ target: comments, attributeName: PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS }]);

    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENT_DISABLED)).toBe(true);
  });

  it("aggregates engagement panels visibility across multiple elements", () => {
    const context: WatchRouteContext = {
      generation: gen1,
      state: { pageType: "watch", videoId: "v1", playlistId: null, isTheater: false, isLiveStream: false },
      flexy
    };
    panelState.activateRoute(context);

    const panel1 = document.createElement("ytd-engagement-panel-section-list-renderer");
    panel1.setAttribute("visibility", PAGE_CONSTANTS.ATTRIBUTES.ENGAGEMENT_PANEL_VISIBILITY_HIDDEN);
    document.body.appendChild(panel1);

    const panel2 = document.createElement("ytd-engagement-panel-section-list-renderer");
    panel2.setAttribute("visibility", PAGE_CONSTANTS.ATTRIBUTES.ENGAGEMENT_PANEL_VISIBILITY_HIDDEN);
    document.body.appendChild(panel2);

    const disp1 = panelState.attachEngagementPanel(panel1, gen1);
    const disp2 = panelState.attachEngagementPanel(panel2, gen1);

    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL_WRAP)).toBe(false);

    // Panel 1 expands
    panel1.setAttribute("visibility", PAGE_CONSTANTS.ATTRIBUTES.ENGAGEMENT_PANEL_VISIBILITY_EXPANDED);
    const mo1 = FakeMutationObserver.allInstances[0];
    mo1.trigger([{ target: panel1, attributeName: "visibility" }]);

    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL_WRAP)).toBe(true);

    // Disposing panel 1 leaves only panel 2 (which is hidden)
    disp1();
    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL_WRAP)).toBe(false);

    disp2();
  });

  it("cleans up all projections on route deactivation and rejects stale generation calls", () => {
    const context: WatchRouteContext = {
      generation: gen1,
      state: { pageType: "watch", videoId: "v1", playlistId: null, isTheater: false, isLiveStream: false },
      flexy
    };
    panelState.activateRoute(context);

    const chat = document.createElement("ytd-live-chat-frame");
    document.body.appendChild(chat);
    panelState.attachChat(chat, gen1);

    expect(FakeMutationObserver.activeInstances.size).toBe(1);

    // Deactivate gen1
    panelState.deactivateRoute(gen1);

    expect(FakeMutationObserver.activeInstances.size).toBe(0);
    expect(flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED)).toBe(false);

    // Late attachment with gen1 should be rejected
    const lateDisposer = panelState.attachChat(chat, gen1);
    expect(FakeMutationObserver.allInstances.length).toBe(1); // No new observer
    lateDisposer();
  });
});
