import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PolymerPatcher } from "../polymer-patcher";
import { PolymerHelper } from "../polymer-helper";
import { PAGE_CONSTANTS } from "../constants";
import type { PolymerSemanticHooks } from "../types";

describe("PolymerPatcher", () => {
  let patcher: PolymerPatcher;

  beforeEach(() => {
    patcher = new PolymerPatcher();
  });

  afterEach(() => {
    patcher.restorePatches();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("translates attached and detached lifecycle to semantic hooks with idempotent disposers", async () => {
    const mockChatDisposer = vi.fn();
    const hooks: PolymerSemanticHooks = {
      onChatAttached: vi.fn(() => mockChatDisposer),
      onPlaylistAttached: vi.fn(() => vi.fn()),
      onCommentsAttached: vi.fn(() => vi.fn()),
      onEngagementPanelAttached: vi.fn(() => vi.fn()),
      onCommentEntryAttached: vi.fn(() => vi.fn()),
      onMetadataAttached: vi.fn(() => vi.fn()),
      onRelatedAttached: vi.fn(),
      onCommentsHeaderDataChanged: vi.fn()
    };

    const chatProto: Record<string, any> = {
      attached: vi.fn(),
      detached: vi.fn()
    };

    vi.spyOn(PolymerHelper, "retrieveCE").mockImplementation(async (tag: string) => {
      if (tag === "ytd-live-chat-frame") {
        return chatProto;
      }
      return null;
    });

    patcher.applyPatches(hooks);
    await Promise.resolve(); // wait for retrieveCE

    const chatElement = document.createElement("div");
    chatElement.id = "chat";
    document.body.appendChild(chatElement);

    // Trigger patched attached
    chatProto.attached.call({ hostElement: chatElement });

    expect(hooks.onChatAttached).toHaveBeenCalledWith(chatElement);
    expect(chatElement.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME)).toBe("CF");

    // Trigger patched detached
    chatProto.detached.call({ hostElement: chatElement });
    expect(mockChatDisposer).toHaveBeenCalledTimes(1);
    expect(chatElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME)).toBe(false);

    // Repeated detached is a safe no-op
    chatProto.detached.call({ hostElement: chatElement });
    expect(mockChatDisposer).toHaveBeenCalledTimes(1);
  });

  it("prunes disconnected element disposers during pruneDisconnectedDisposers()", async () => {
    const disposerMock = vi.fn();
    const hooks: PolymerSemanticHooks = {
      onChatAttached: vi.fn(() => vi.fn()),
      onPlaylistAttached: vi.fn(() => vi.fn()),
      onCommentsAttached: vi.fn(() => disposerMock),
      onEngagementPanelAttached: vi.fn(() => vi.fn()),
      onCommentEntryAttached: vi.fn(() => vi.fn()),
      onMetadataAttached: vi.fn(() => vi.fn()),
      onRelatedAttached: vi.fn(),
      onCommentsHeaderDataChanged: vi.fn()
    };

    const commentsProto: Record<string, any> = {
      attached: vi.fn(),
      detached: vi.fn()
    };

    vi.spyOn(PolymerHelper, "retrieveCE").mockImplementation(async (tag: string) => {
      if (tag === "ytd-comments") {
        return commentsProto;
      }
      return null;
    });

    patcher.applyPatches(hooks);
    await Promise.resolve();

    const commentsElement = document.createElement("div");
    commentsElement.id = "comments";
    document.body.appendChild(commentsElement);

    commentsProto.attached.call({ hostElement: commentsElement });
    expect(disposerMock).not.toHaveBeenCalled();

    // Remove element from DOM without calling detached (simulates host innerHTML wipe)
    commentsElement.remove();
    expect(commentsElement.isConnected).toBe(false);

    // Prune should detect disconnected node and call its disposer
    patcher.pruneDisconnectedDisposers();
    expect(disposerMock).toHaveBeenCalledTimes(1);
  });

  it("replays attached semantic hook for already connected elements", () => {
    const commentsMockDisposer = vi.fn();
    const hooks: PolymerSemanticHooks = {
      onChatAttached: vi.fn(() => vi.fn()),
      onPlaylistAttached: vi.fn(() => vi.fn()),
      onCommentsAttached: vi.fn(() => commentsMockDisposer),
      onEngagementPanelAttached: vi.fn(() => vi.fn()),
      onCommentEntryAttached: vi.fn(() => vi.fn()),
      onMetadataAttached: vi.fn(() => vi.fn()),
      onRelatedAttached: vi.fn(),
      onCommentsHeaderDataChanged: vi.fn()
    };

    const commentsElement = document.createElement("ytd-comments");
    commentsElement.id = "comments";
    document.body.appendChild(commentsElement);

    patcher.applyPatches(hooks);
    patcher.replayConnected();

    expect(hooks.onCommentsAttached).toHaveBeenCalledWith(commentsElement);
  });

  it("restores all original prototype methods and runs disposers in reverse order on restorePatches()", async () => {
    const order: string[] = [];
    const disposer1 = vi.fn(() => order.push("disp1"));
    const disposer2 = vi.fn(() => order.push("disp2"));

    const hooks: PolymerSemanticHooks = {
      onChatAttached: vi.fn(() => disposer1),
      onPlaylistAttached: vi.fn(() => disposer2),
      onCommentsAttached: vi.fn(() => vi.fn()),
      onEngagementPanelAttached: vi.fn(() => vi.fn()),
      onCommentEntryAttached: vi.fn(() => vi.fn()),
      onMetadataAttached: vi.fn(() => vi.fn()),
      onRelatedAttached: vi.fn(),
      onCommentsHeaderDataChanged: vi.fn()
    };

    const origChatAttached = vi.fn();
    const chatProto: Record<string, any> = { attached: origChatAttached, detached: vi.fn() };
    const origPlaylistAttached = vi.fn();
    const playlistProto: Record<string, any> = { attached: origPlaylistAttached, detached: vi.fn() };

    vi.spyOn(PolymerHelper, "retrieveCE").mockImplementation(async (tag: string) => {
      if (tag === "ytd-live-chat-frame") return chatProto;
      if (tag === PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL) return playlistProto;
      return null;
    });

    patcher.applyPatches(hooks);
    await Promise.resolve();

    const chatEl = document.createElement("div");
    chatEl.id = "chat";
    document.body.appendChild(chatEl);

    const playlistEl = document.createElement("div");
    document.body.appendChild(playlistEl);

    chatProto.attached.call({ hostElement: chatEl });
    playlistProto.attached.call({ hostElement: playlistEl });

    expect(order).toEqual([]);

    // Restore should call disposers in reverse order (disp2 then disp1)
    patcher.restorePatches();
    expect(order).toEqual(["disp2", "disp1"]);

    // Original methods should be restored
    expect(chatProto.attached).toBe(origChatAttached);
    expect(playlistProto.attached).toBe(origPlaylistAttached);
  });
});
