import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PolymerPatcher } from "../polymer-patcher";
import { PolymerHelper } from "../polymer-helper";
import { PAGE_CONSTANTS } from "../constants";
import {
  installFakeObservers,
  resetFakeObservers,
  FakeIntersectionObserver
} from "../../../../test/fake-observers";
import type {
  PolymerSemanticHooks,
  PolymerElementInstance,
  RouteGeneration,
  WatchRouteContext,
  PolymerControllerPrototype,
  IdempotentDisposer
} from "../types";

function createHooks() {
  return {
    onChatAttached: vi.fn((): IdempotentDisposer => vi.fn()),
    onPlaylistAttached: vi.fn((): IdempotentDisposer => vi.fn()),
    onCommentsAttached: vi.fn((): IdempotentDisposer => vi.fn()),
    onEngagementPanelAttached: vi.fn((): IdempotentDisposer => vi.fn()),
    onCommentEntryAttached: vi.fn((): IdempotentDisposer => vi.fn()),
    onMetadataAttached: vi.fn((): IdempotentDisposer => vi.fn()),
    onRelatedAttached: vi.fn(),
    onCommentsHeaderDataChanged: vi.fn()
  };
}

type HooksMock = ReturnType<typeof createHooks>;

function asHooks(mock: HooksMock): PolymerSemanticHooks {
  return mock as unknown as PolymerSemanticHooks;
}

function createRouteContext(generation: number): WatchRouteContext {
  return {
    generation: generation as RouteGeneration,
    state: { pageType: "watch", videoId: "video1", playlistId: null, isTheater: false, isLiveStream: false },
    flexy: document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY)
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res: (value: T) => void): void => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

function mockRetrieveCEByTag(mapping: Map<string, Promise<PolymerControllerPrototype | null>>): void {
  vi.spyOn(PolymerHelper, "retrieveCE").mockImplementation(
    async (tag: string): Promise<PolymerControllerPrototype | null> => {
      const pending = mapping.get(tag);
      return pending !== undefined ? pending : null;
    }
  );
}

describe("PolymerPatcher", () => {
  let patcher: PolymerPatcher;

  beforeEach(() => {
    patcher = new PolymerPatcher();
  });

  afterEach(() => {
    patcher.restorePatches();
    resetFakeObservers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("translates attached and detached lifecycle to semantic hooks with idempotent disposers", async () => {
    const hooks = createHooks();
    const chatDisposer = vi.fn();
    hooks.onChatAttached.mockReturnValue(chatDisposer);

    const chatProto: Record<string, unknown> = {
      attached: vi.fn(),
      detached: vi.fn()
    };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, Promise.resolve(chatProto)]]));

    patcher.applyPatches(asHooks(hooks));
    patcher.replayConnected(createRouteContext(1));
    await flushMicrotasks();

    const chatElement = document.createElement("div");
    chatElement.id = "chat";
    document.body.appendChild(chatElement);

    (chatProto.attached as (this: PolymerElementInstance) => void).call({ hostElement: chatElement });

    expect(hooks.onChatAttached).toHaveBeenCalledWith(chatElement);
    expect(chatElement.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME)).toBe("CF");

    (chatProto.detached as (this: PolymerElementInstance) => void).call({ hostElement: chatElement });
    expect(chatDisposer).toHaveBeenCalledTimes(1);
    expect(chatElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME)).toBe(false);

    (chatProto.detached as (this: PolymerElementInstance) => void).call({ hostElement: chatElement });
    expect(chatDisposer).toHaveBeenCalledTimes(1);
  });

  it("prunes disconnected element disposers during pruneDisconnectedDisposers()", async () => {
    const hooks = createHooks();
    const disposerMock = vi.fn();
    hooks.onCommentsAttached.mockReturnValue(disposerMock);

    const commentsProto: Record<string, unknown> = {
      attached: vi.fn(),
      detached: vi.fn()
    };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_COMMENTS, Promise.resolve(commentsProto)]]));

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();

    const commentsElement = document.createElement("div");
    commentsElement.id = "comments";
    document.body.appendChild(commentsElement);

    patcher.replayConnected(createRouteContext(1));
    (commentsProto.attached as (this: PolymerElementInstance) => void).call({ hostElement: commentsElement });
    expect(disposerMock).not.toHaveBeenCalled();

    commentsElement.remove();
    patcher.pruneDisconnectedDisposers();
    expect(disposerMock).toHaveBeenCalledTimes(1);
  });

  it("replays attached semantic hook for already connected elements", async () => {
    const hooks = createHooks();
    const commentsElement = document.createElement("ytd-comments");
    commentsElement.id = "comments";
    document.body.appendChild(commentsElement);

    const commentsProto: Record<string, unknown> = {
      attached: vi.fn(),
      detached: vi.fn()
    };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_COMMENTS, Promise.resolve(commentsProto)]]));

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();
    patcher.replayConnected(createRouteContext(1));

    expect(hooks.onCommentsAttached).toHaveBeenCalledWith(commentsElement);
    expect(commentsElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA)).toBe(true);
  });

  it("restores all original prototype methods and runs disposers in reverse order on restorePatches()", async () => {
    const hooks = createHooks();
    const order: string[] = [];
    const disposer1 = vi.fn(() => order.push("disp1"));
    const disposer2 = vi.fn(() => order.push("disp2"));
    hooks.onChatAttached.mockReturnValue(disposer1);
    hooks.onPlaylistAttached.mockReturnValue(disposer2);

    const originalChatAttached = vi.fn();
    const chatProto: Record<string, unknown> = { attached: originalChatAttached, detached: vi.fn() };
    const originalPlaylistAttached = vi.fn();
    const playlistProto: Record<string, unknown> = { attached: originalPlaylistAttached, detached: vi.fn() };
    mockRetrieveCEByTag(new Map([
      [PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, Promise.resolve(chatProto)],
      [PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL, Promise.resolve(playlistProto)]
    ]));

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();

    const chatEl = document.createElement("div");
    chatEl.id = "chat";
    document.body.appendChild(chatEl);
    const playlistEl = document.createElement("div");
    document.body.appendChild(playlistEl);

    patcher.replayConnected(createRouteContext(1));
    (chatProto.attached as (this: PolymerElementInstance) => void).call({ hostElement: chatEl });
    (playlistProto.attached as (this: PolymerElementInstance) => void).call({ hostElement: playlistEl });
    expect(order).toEqual([]);

    patcher.restorePatches();
    expect(order).toEqual(["disp2", "disp1"]);
    expect(chatProto.attached).toBe(originalChatAttached);
    expect(playlistProto.attached).toBe(originalPlaylistAttached);
  });

  it("replays related connected and ignores skeleton elements", async () => {
    const hooks = createHooks();
    const realRenderer = document.createElement("ytd-watch-next-secondary-results-renderer");
    document.body.appendChild(realRenderer);

    const skeleton = document.createElement("div");
    skeleton.id = "related-skeleton";
    skeleton.setAttribute("hidden", "");
    const fakeRenderer = document.createElement("ytd-watch-next-secondary-results-renderer");
    skeleton.appendChild(fakeRenderer);
    document.body.appendChild(skeleton);

    const relatedProto: Record<string, unknown> = { attached: vi.fn(), detached: vi.fn() };
    mockRetrieveCEByTag(new Map([
      [PAGE_CONSTANTS.TAGS.YTD_WATCH_NEXT_SECONDARY_RESULTS, Promise.resolve(relatedProto)]
    ]));

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();
    patcher.replayConnected(createRouteContext(1));

    expect(hooks.onRelatedAttached).toHaveBeenCalledWith(realRenderer);
    expect(hooks.onRelatedAttached).not.toHaveBeenCalledWith(fakeRenderer);
    expect(realRenderer.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST)).toBe(true);
    expect(fakeRenderer.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST)).toBe(false);
  });

  it("does not write prototypes when restore happens while the CE wait is pending", async () => {
    const hooks = createHooks();
    const deferred = createDeferred<Record<string, unknown>>();
    vi.spyOn(PolymerHelper, "retrieveCE").mockImplementation(
      async (): Promise<PolymerControllerPrototype | null> => deferred.promise
    );

    patcher.applyPatches(asHooks(hooks));
    patcher.restorePatches();

    const lateProto: Record<string, unknown> = { attached: vi.fn() };
    const before = lateProto.attached;
    deferred.resolve(lateProto);
    await flushMicrotasks();

    expect(lateProto.attached).toBe(before);
    expect(hooks.onChatAttached).not.toHaveBeenCalled();
  });

  it("lets only the newest cycle install when an older cycle settles late", async () => {
    const hooksA = createHooks();
    const hooksB = createHooks();
    const deferredA = createDeferred<Record<string, unknown>>();
    const deferredB = createDeferred<Record<string, unknown>>();
    let callRound = 0;
    vi.spyOn(PolymerHelper, "retrieveCE").mockImplementation(
      async (tag: string): Promise<PolymerControllerPrototype | null> => {
        callRound += 1;
        if (callRound <= 11) {
          return deferredA.promise;
        }
        return tag === PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME ? deferredB.promise : null;
      }
    );

    patcher.applyPatches(asHooks(hooksA));
    patcher.restorePatches();
    patcher.applyPatches(asHooks(hooksB));

    const protoA: Record<string, unknown> = { attached: vi.fn() };
    const beforeA = protoA.attached;
    deferredA.resolve(protoA);
    await flushMicrotasks();
    expect(protoA.attached).toBe(beforeA);
    expect(hooksA.onChatAttached).not.toHaveBeenCalled();
    expect(hooksB.onChatAttached).not.toHaveBeenCalled();

    const protoB: Record<string, unknown> = { attached: vi.fn() };
    const beforeB = protoB.attached;
    deferredB.resolve(protoB);
    await flushMicrotasks();
    expect(protoB.attached).not.toBe(beforeB);

    const chatEl = document.createElement("div");
    chatEl.id = "chat";
    document.body.appendChild(chatEl);
    patcher.replayConnected(createRouteContext(1));
    (protoB.attached as (this: PolymerElementInstance) => void).call({ hostElement: chatEl });

    expect(hooksB.onChatAttached).toHaveBeenCalledWith(chatEl);
    expect(hooksA.onChatAttached).not.toHaveBeenCalled();
  });

  it("treats re-binding the same hooks as idempotent and different hooks as a contract error", async () => {
    const hooks = createHooks();
    const chatProto: Record<string, unknown> = { attached: vi.fn(), detached: vi.fn() };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, Promise.resolve(chatProto)]]));

    patcher.applyPatches(asHooks(hooks));
    expect(() => patcher.applyPatches(asHooks(hooks))).not.toThrow();
    expect(() => patcher.applyPatches(asHooks(createHooks()))).toThrow(/different hooks/);

    await flushMicrotasks();
    const chatEl = document.createElement("div");
    chatEl.id = "chat";
    document.body.appendChild(chatEl);
    patcher.replayConnected(createRouteContext(1));
    (chatProto.attached as (this: PolymerElementInstance) => void).call({ hostElement: chatEl });
    expect(hooks.onChatAttached).toHaveBeenCalledTimes(1);
  });

  it("restores an inherited method by deleting the installed own property", async () => {
    const hooks = createHooks();
    const base: Record<string, unknown> = { attached: vi.fn() };
    const proto: Record<string, unknown> = Object.create(base);
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, Promise.resolve(proto)]]));

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();
    expect(Object.getOwnPropertyDescriptor(proto, "attached")).toBeDefined();

    patcher.restorePatches();
    expect(Object.getOwnPropertyDescriptor(proto, "attached")).toBeUndefined();
    expect(proto.attached).toBe(base.attached);
  });

  it("keeps third-party replacements on restore and still restores untouched methods", async () => {
    const hooks = createHooks();
    const originalDetached = vi.fn();
    const proto: Record<string, unknown> = { attached: vi.fn(), detached: originalDetached };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, Promise.resolve(proto)]]));

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();
    const thirdParty = vi.fn();
    proto.attached = thirdParty;

    patcher.restorePatches();
    expect(proto.attached).toBe(thirdParty);
    expect(proto.detached).toBe(originalDetached);
  });

  it("skips non-writable descriptors and still installs the remaining methods", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hooks = createHooks();
    const originalAttached = vi.fn();
    const proto: Record<string, unknown> = { detached: vi.fn() };
    Object.defineProperty(proto, "attached", {
      value: originalAttached,
      writable: false,
      enumerable: true,
      configurable: true
    });
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, Promise.resolve(proto)]]));

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();

    expect(proto.attached).toBe(originalAttached);
    expect(typeof proto.detached).toBe("function");
    expect(proto.detached).not.toBe(originalAttached);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("attached"));
  });

  it("registers the comments data effect once per prototype across cycles", async () => {
    const observerSpy = vi.fn();
    const proto: Record<string, unknown> = {
      attached: vi.fn(),
      detached: vi.fn(),
      _createPropertyObserver: observerSpy
    };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_COMMENTS, Promise.resolve(proto)]]));

    patcher.applyPatches(asHooks(createHooks()));
    await flushMicrotasks();
    expect(observerSpy).toHaveBeenCalledTimes(1);
    expect(observerSpy).toHaveBeenCalledWith("data", PAGE_CONSTANTS.PROPERTIES.COMMENTS_DATA_CALLBACK, undefined);
    expect(typeof proto[PAGE_CONSTANTS.PROPERTIES.COMMENTS_DATA_CALLBACK]).toBe("function");

    patcher.restorePatches();
    patcher.applyPatches(asHooks(createHooks()));
    await flushMicrotasks();
    expect(observerSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the comments data callback idle-safe after restore", async () => {
    const observerSpy = vi.fn();
    const proto: Record<string, unknown> = {
      attached: vi.fn(),
      detached: vi.fn(),
      _createPropertyObserver: observerSpy
    };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_COMMENTS, Promise.resolve(proto)]]));

    patcher.applyPatches(asHooks(createHooks()));
    await flushMicrotasks();
    patcher.restorePatches();

    const commentsElement = document.createElement("ytd-comments");
    commentsElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA, "");
    document.body.appendChild(commentsElement);

    const callback = proto[PAGE_CONSTANTS.PROPERTIES.COMMENTS_DATA_CALLBACK] as (this: PolymerElementInstance) => void;
    expect(() => callback.call({ hostElement: commentsElement, data: { contents: [{ commentThreadRenderer: {} }, {}] } })).not.toThrow();
    expect(commentsElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS)).toBe(false);
  });

  it("projects comment data status only for the active route cycle", async () => {
    const observerSpy = vi.fn();
    const proto: Record<string, unknown> = {
      attached: vi.fn(),
      detached: vi.fn(),
      _createPropertyObserver: observerSpy
    };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_COMMENTS, Promise.resolve(proto)]]));

    patcher.applyPatches(asHooks(createHooks()));
    await flushMicrotasks();

    const commentsElement = document.createElement("ytd-comments");
    commentsElement.id = "comments";
    document.body.appendChild(commentsElement);
    patcher.replayConnected(createRouteContext(1));
    expect(commentsElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA)).toBe(true);

    const callback = proto[PAGE_CONSTANTS.PROPERTIES.COMMENTS_DATA_CALLBACK] as (this: PolymerElementInstance) => void;
    callback.call({ hostElement: commentsElement, data: { contents: [{ commentThreadRenderer: {} }, {}] } });
    expect(commentsElement.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS)).toBe("1");

    callback.call({ hostElement: commentsElement, data: { contents: [{ messageRenderer: {} }] } });
    expect(commentsElement.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS)).toBe("2");

    callback.call({ hostElement: commentsElement });
    expect(commentsElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS)).toBe(false);
  });

  it("does not duplicate attachments when a late tag install follows an initial replay", async () => {
    const hooks = createHooks();
    const deferredChat = createDeferred<Record<string, unknown>>();
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, deferredChat.promise]]));

    const chatEl = document.createElement("ytd-live-chat-frame");
    chatEl.id = "chat";
    document.body.appendChild(chatEl);

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();
    patcher.replayConnected(createRouteContext(1));
    expect(hooks.onChatAttached).toHaveBeenCalledTimes(1);

    const chatProto: Record<string, unknown> = { attached: vi.fn(), detached: vi.fn() };
    deferredChat.resolve(chatProto);
    await flushMicrotasks();
    expect(hooks.onChatAttached).toHaveBeenCalledTimes(1);

    (chatProto.attached as (this: PolymerElementInstance) => void).call({ hostElement: chatEl });
    expect(hooks.onChatAttached).toHaveBeenCalledTimes(1);
  });

  it("pauses semantic work on route suspension and resumes with a new context", async () => {
    const hooks = createHooks();
    const chatProto: Record<string, unknown> = { attached: vi.fn(), detached: vi.fn() };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, Promise.resolve(chatProto)]]));

    const chatEl = document.createElement("ytd-live-chat-frame");
    chatEl.id = "chat";
    document.body.appendChild(chatEl);

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();

    patcher.replayConnected(createRouteContext(1));
    expect(hooks.onChatAttached).toHaveBeenCalledTimes(1);
    const chatDisposer = hooks.onChatAttached.mock.results[0].value;

    patcher.suspendRoute();
    expect(chatDisposer).toHaveBeenCalledTimes(1);

    (chatProto.attached as (this: PolymerElementInstance) => void).call({ hostElement: chatEl });
    expect(hooks.onChatAttached).toHaveBeenCalledTimes(1);

    patcher.replayConnected(createRouteContext(2));
    expect(hooks.onChatAttached).toHaveBeenCalledTimes(2);
  });
});

describe("PolymerPatcher chat iframe waits", () => {
  let patcher: PolymerPatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    installFakeObservers();
    resetFakeObservers();
    patcher = new PolymerPatcher();
  });

  afterEach(() => {
    patcher.restorePatches();
    vi.useRealTimers();
    resetFakeObservers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  interface ChatFixture {
    hooks: HooksMock;
    chatProto: Record<string, unknown>;
    nativeUrlChanged: ReturnType<typeof vi.fn>;
    host: PolymerElementInstance;
  }

  async function setupChatWithWait(): Promise<ChatFixture> {
    const hooks = createHooks();
    const nativeUrlChanged = vi.fn();
    const chatProto: Record<string, unknown> = {
      attached: vi.fn(),
      urlChanged: nativeUrlChanged,
      detached: vi.fn()
    };
    mockRetrieveCEByTag(new Map([[PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, Promise.resolve(chatProto)]]));

    patcher.applyPatches(asHooks(hooks));
    await flushMicrotasks();

    const chatEl = document.createElement("div");
    chatEl.id = "chat";
    const iframe = document.createElement("iframe");
    chatEl.appendChild(iframe);
    document.body.appendChild(chatEl);

    const host = {
      hostElement: chatEl,
      chatframe: iframe,
      $: { chatframe: iframe },
      data: { contents: [] },
      collapsed: false
    } as unknown as PolymerElementInstance;

    return { hooks, chatProto, nativeUrlChanged, host };
  }

  it("delegates to the native method once when visibility arrives first", async () => {
    const fixture = await setupChatWithWait();
    const installed = fixture.chatProto.urlChanged as (this: PolymerElementInstance) => Promise<void>;

    const pending = installed.call(fixture.host);
    FakeIntersectionObserver.allInstances[FakeIntersectionObserver.allInstances.length - 1].trigger([
      { boundingClientRect: { width: 100, height: 40 } as DOMRectReadOnly }
    ]);
    await flushMicrotasks();
    await pending;

    expect(fixture.nativeUrlChanged).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(FakeIntersectionObserver.activeInstances.size).toBe(0);
  });

  it("releases the wait at the existing timeout limit and calls the native method once", async () => {
    const fixture = await setupChatWithWait();
    const installed = fixture.chatProto.urlChanged as (this: PolymerElementInstance) => Promise<void>;

    const pending = installed.call(fixture.host);
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.CHAT_FRAME_READY_MS);
    await flushMicrotasks();
    await pending;

    expect(fixture.nativeUrlChanged).toHaveBeenCalledTimes(1);
    expect(FakeIntersectionObserver.activeInstances.size).toBe(0);
  });

  it("cancels the superseded request when a new urlChanged arrives during the wait", async () => {
    const fixture = await setupChatWithWait();
    const installed = fixture.chatProto.urlChanged as (this: PolymerElementInstance) => Promise<void>;

    void installed.call(fixture.host);
    void installed.call(fixture.host);
    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.CHAT_FRAME_READY_MS);
    await flushMicrotasks();

    expect(fixture.nativeUrlChanged).toHaveBeenCalledTimes(1);
  });

  it("delegates the latest pending native call once when the feature is restored mid-wait", async () => {
    const fixture = await setupChatWithWait();
    const installed = fixture.chatProto.urlChanged as (this: PolymerElementInstance) => Promise<void>;

    const pending = installed.call(fixture.host);
    patcher.restorePatches();
    expect(fixture.nativeUrlChanged).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(PAGE_CONSTANTS.TIMEOUTS.CHAT_FRAME_READY_MS);
    await flushMicrotasks();
    await pending;
    expect(fixture.nativeUrlChanged).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
