import { PAGE_CONSTANTS } from "./constants";
import { PolymerPatcher } from "./polymer-patcher";
import { PolymerHelper } from "./polymer-helper";
import { DOMRelocator } from "./relocator";
import { LinkedCommentAdapter } from "./linked-comment-adapter";
import { ExpanderFixer } from "./expander-fixer";
import { InfoMirrorEngine } from "./info-mirror-engine";
import { ChannelHoverAdapter } from "./channel-hover-adapter";
import { MinibrowserRouter } from "./minibrowser-router";
import { TabviewPanelState } from "./panel-state";
import type {
  NavigationState,
  PageType,
  LocaleSnapshot,
  TabKey,
  RouteGeneration,
  IdempotentDisposer,
  WatchRouteContext
} from "./types";

export interface TabviewLifecycleCallbacks {
  readonly onTabChanged?: (tabKey: TabKey) => void;
  readonly onFontSizeChanged?: (tabKey: TabKey, fontSize: number) => void;
}

export class TabviewLifecycleCoordinator {
  private static instance: TabviewLifecycleCoordinator | null = null;
  private polymerPatcher: PolymerPatcher = PolymerPatcher.getInstance();
  private relocator: DOMRelocator = DOMRelocator.getInstance();
  private linkedCommentAdapter: LinkedCommentAdapter = LinkedCommentAdapter.getInstance();
  private channelHoverAdapter: ChannelHoverAdapter = ChannelHoverAdapter.getInstance();
  private expanderFixer: ExpanderFixer | null = null;
  private panelState: TabviewPanelState | null = null;

  private routeGeneration: RouteGeneration = 0 as RouteGeneration;
  private navListenerCleanupFns: Array<() => void> = [];

  private currentState: NavigationState = {
    pageType: "unknown",
    videoId: null,
    playlistId: null,
    isTheater: false,
    isLiveStream: false
  };

  private localeSnapshot: LocaleSnapshot | null = null;
  private onTabChangedCallback?: (tabKey: TabKey) => void;
  private onFontSizeChangedCallback?: (tabKey: TabKey, fontSize: number) => void;
  private isInitialized: boolean = false;
  private isMounting: boolean = false;
  private isDestroyed: boolean = false;
  private activeInitToken: object | null = null;

  public static getInstance(): TabviewLifecycleCoordinator {
    if (!TabviewLifecycleCoordinator.instance) {
      TabviewLifecycleCoordinator.instance = new TabviewLifecycleCoordinator();
    }
    return TabviewLifecycleCoordinator.instance;
  }

  public init(
    initialLocale: LocaleSnapshot,
    callbacks?: TabviewLifecycleCallbacks
  ): boolean {
    if (this.isInitialized) {
      return true;
    }
    this.isDestroyed = false;
    const initToken: object = {};
    this.activeInitToken = initToken;
    const isInitAbandoned = (): boolean => this.activeInitToken !== initToken;

    this.localeSnapshot = initialLocale;
    this.onTabChangedCallback = callbacks?.onTabChanged;
    this.onFontSizeChangedCallback = callbacks?.onFontSizeChanged;

    this.panelState = new TabviewPanelState({
      onPlaylistAvailabilityChanged: (isAvailable: boolean): void => {
        this.updatePlaylistTabVisibility(isAvailable);
      },
      onCommentsAvailabilityChanged: (isAvailable: boolean): void => {
        this.updateCommentsTabVisibility(isAvailable);
      }
    });

    this.polymerPatcher.applyPatches({
      onChatAttached: (element: HTMLElement): IdempotentDisposer => {
        if (this.currentState.pageType !== "watch") {
          return (): void => {};
        }
        return this.panelState?.attachChat(element, this.routeGeneration) ?? ((): void => {});
      },
      onPlaylistAttached: (element: HTMLElement): IdempotentDisposer => {
        if (this.currentState.pageType !== "watch") {
          return (): void => {};
        }
        this.relocator.tryRelocateSlot("playlist");
        return this.panelState?.attachPlaylist(element, this.routeGeneration) ?? ((): void => {});
      },
      onCommentsAttached: (element: HTMLElement): IdempotentDisposer => {
        if (this.currentState.pageType !== "watch") {
          return (): void => {};
        }
        this.relocator.tryRelocateSlot("comments");
        this.linkedCommentAdapter.syncLinkedComment();
        return this.panelState?.attachComments(element, this.routeGeneration) ?? ((): void => {});
      },
      onEngagementPanelAttached: (element: HTMLElement): IdempotentDisposer => {
        if (this.currentState.pageType !== "watch") {
          return (): void => {};
        }
        return this.panelState?.attachEngagementPanel(element, this.routeGeneration) ?? ((): void => {});
      },
      onCommentEntryAttached: (element: HTMLElement): IdempotentDisposer => {
        if (this.currentState.pageType !== "watch") {
          return (): void => {};
        }
        return this.expanderFixer?.attachCommentEntry(element, this.routeGeneration) ?? ((): void => {});
      },
      onMetadataAttached: (metadata: HTMLElement): IdempotentDisposer => {
        if (this.currentState.pageType !== "watch") {
          return (): void => {};
        }
        InfoMirrorEngine.getInstance().syncMainDescriptionData();
        return this.channelHoverAdapter.attachMetadata(metadata, this.routeGeneration);
      },
      onRelatedAttached: (): void => {
        if (this.currentState.pageType !== "watch") {
          return;
        }
        this.relocator.tryRelocateSlot("videos");
      },
      onCommentsHeaderDataChanged: (): void => {
        if (this.currentState.pageType !== "watch") {
          return;
        }
        this.expanderFixer?.updateCommentsCounter();
      }
    });
    if (isInitAbandoned()) {
      return false;
    }

    this.bindNavigationEvents();
    if (isInitAbandoned()) {
      return false;
    }
    this.handleRouteChange();
    if (isInitAbandoned()) {
      return false;
    }

    this.isInitialized = true;
    return true;
  }

  public getState(): Readonly<NavigationState> {
    return this.currentState;
  }

  public setLocale(snapshot: LocaleSnapshot): void {
    this.localeSnapshot = snapshot;
    if (this.currentState.pageType === "watch") {
      this.tryMount();
    }
  }

  public setActiveTab(tabKey: TabKey): void {
    this.relocator.tryRelocateSlot(tabKey);
    this.relocator.getTabsView().setActiveTab(tabKey);
    this.expanderFixer?.setActiveTab(tabKey, this.routeGeneration);
    if (tabKey === "comments") {
      this.expanderFixer?.updateCommentsCounter();
      this.linkedCommentAdapter.syncLinkedComment();
    }
  }

  public setFontSize(tabKey: TabKey, fontSize: number): void {
    this.relocator.getTabsView().setFontSize(tabKey, fontSize);
  }

  public destroy(): void {
    this.activeInitToken = null;
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;

    const oldGeneration = this.routeGeneration;
    this.advanceRouteGeneration();

    const errors: unknown[] = [];

    for (let i = 0; i < this.navListenerCleanupFns.length; i++) {
      try {
        this.navListenerCleanupFns[i]();
      } catch (err: unknown) {
        errors.push(err);
      }
    }
    this.navListenerCleanupFns = [];

    try {
      this.deactivateCurrentRoute(oldGeneration);
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.polymerPatcher.restorePatches();
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      MinibrowserRouter.getInstance().destroy();
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.channelHoverAdapter.destroy();
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.expanderFixer?.destroy();
      this.expanderFixer = null;
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.panelState?.destroy();
      this.panelState = null;
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.relocator.destroy();
    } catch (err: unknown) {
      errors.push(err);
    }

    this.localeSnapshot = null;
    this.onTabChangedCallback = undefined;
    this.onFontSizeChangedCallback = undefined;
    this.isInitialized = false;

    if (errors.length > 0) {
      throw new AggregateError(errors, "[TabviewLifecycleCoordinator] Teardown failed");
    }
  }

  private advanceRouteGeneration(): RouteGeneration {
    this.routeGeneration = (
      (Number(this.routeGeneration) & PAGE_CONSTANTS.MASKS.ROUTE_GENERATION_MASK) + 1
    ) as RouteGeneration;
    return this.routeGeneration;
  }

  private bindNavigationEvents(): void {
    const addListener = (
      target: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void => {
      target.addEventListener(type, listener, options);
      this.navListenerCleanupFns.push((): void => {
        target.removeEventListener(type, listener, options);
      });
    };

    addListener(document, PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH, (): void => {
      this.handleRouteChange();
    });

    addListener(document, PAGE_CONSTANTS.DOM_EVENTS.YT_PAGE_TYPE_CHANGED, (): void => {
      this.handleRouteChange();
    });

    addListener(document, PAGE_CONSTANTS.DOM_EVENTS.YT_ACTION, (): void => {
      if (this.currentState.pageType === "watch") {
        if (!this.relocator.isContainerMounted()) {
          this.tryMount();
        } else if (!this.relocator.isSlotRelocated("comments")) {
          const relocated = this.relocator.tryRelocateSlot("comments");
          if (relocated) {
            this.expanderFixer?.updateCommentsCounter();
            this.linkedCommentAdapter.syncLinkedComment();
          }
        }
      }
    });

    addListener(window, "popstate", (): void => {
      this.handleRouteChange();
    });

    addListener(
      document,
      PAGE_CONSTANTS.DOM_EVENTS.ANIMATION_START,
      ((evt: Event): void => {
        const animEvt = evt as AnimationEvent;
        if (animEvt.animationName === PAGE_CONSTANTS.ANIMATIONS.RELATED_ELEMENT_PROVIDED) {
          if (this.currentState.pageType === "watch") {
            const target = animEvt.target as HTMLElement | null;
            if (target && target.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)) {
              return;
            }
            this.tryMount();
            this.relocator.refreshAllSlots();
            InfoMirrorEngine.getInstance().runInfoFix();
          }
        }
      }) as EventListener,
      { capture: true, passive: true }
    );

    if (document.readyState === "loading") {
      const onDomReady = (): void => {
        document.removeEventListener("DOMContentLoaded", onDomReady);
        this.handleRouteChange();
      };
      document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
      this.navListenerCleanupFns.push((): void => {
        document.removeEventListener("DOMContentLoaded", onDomReady);
      });
    }
  }

  private handleRouteChange(): void {
    const nextState = this.resolveNavigationState();
    const isWatchRoute = nextState.pageType === "watch";
    const wasWatchRoute = this.currentState.pageType === "watch";

    if (wasWatchRoute && isWatchRoute) {
      this.currentState = nextState;
      this.handleWatchRouteUpdate(nextState);
      return;
    }

    const oldGeneration = this.routeGeneration;
    const generation = this.advanceRouteGeneration();

    this.deactivateCurrentRoute(oldGeneration);
    this.currentState = nextState;

    if (isWatchRoute) {
      this.activateWatchRoute(generation, nextState);
    }
  }

  private handleWatchRouteUpdate(nextState: NavigationState): void {
    if (!this.relocator.isContainerMounted()) {
      this.activateWatchRoute(this.routeGeneration, nextState);
      return;
    }

    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (flexy) {
      this.polymerPatcher.patchFlexyInstance(flexy);
      flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.HIDE_DEFAULT_TEXT_INLINE_EXPANDER, "");
      this.polymerPatcher.replayConnected(this.buildRouteContext(this.routeGeneration, nextState, flexy));
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has("lc")) {
      this.setActiveTab("comments");
    }

    this.relocator.refreshAllSlots();
    this.updatePlaylistTabVisibility();
    this.expanderFixer?.updateCommentsCounter();
    this.linkedCommentAdapter.syncLinkedComment();
    InfoMirrorEngine.getInstance().runInfoFix();
    InfoMirrorEngine.getInstance().syncMainDescriptionData();
    this.polymerPatcher.pruneDisconnectedDisposers();
  }

  private buildRouteContext(
    generation: RouteGeneration,
    state: NavigationState,
    flexy: HTMLElement
  ): WatchRouteContext {
    return { generation, state, flexy };
  }

  public tryMount(): void {
    if (this.currentState.pageType === "watch") {
      if (this.relocator.isContainerMounted()) {
        this.relocator.refreshAllSlots();
      } else {
        this.activateWatchRoute(this.routeGeneration, this.currentState);
      }
    }
  }

  private activateWatchRoute(generation: RouteGeneration, nextState: NavigationState): void {
    if (this.isMounting || !this.localeSnapshot) {
      return;
    }

    const secondaryInner = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_EXACT);
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);

    if (!secondaryInner || !flexy) {
      return;
    }

    this.isMounting = true;
    try {
      const routeContext = this.buildRouteContext(generation, nextState, flexy);

      this.polymerPatcher.patchFlexyInstance(flexy);
      flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.HIDE_DEFAULT_TEXT_INLINE_EXPANDER, "");
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER);

      document.documentElement.setAttribute(
        PAGE_CONSTANTS.ATTRIBUTES.TABVIEW_LOADED,
        PAGE_CONSTANTS.VALUES.TABVIEW_LOADED_ICP
      );

      this.panelState?.activateRoute({
        generation,
        state: nextState,
        flexy
      });

      const rightTabs = this.relocator.mountRoute({
        generation,
        secondaryInner,
        tabsOptions: {
          localeSnapshot: this.localeSnapshot,
          onTabSelected: (tabKey: TabKey): void => {
            this.onTabChangedCallback?.(tabKey);
            this.relocator.tryRelocateSlot(tabKey);
            this.expanderFixer?.setActiveTab(tabKey, generation);
            if (tabKey === "comments") {
              this.expanderFixer?.updateCommentsCounter();
              this.linkedCommentAdapter.syncLinkedComment();
            }
          },
          onFontSizeChanged: (tabKey: TabKey, delta: number): void => {
            this.onFontSizeChangedCallback?.(tabKey, delta);
          }
        }
      });

      if (!this.expanderFixer) {
        this.expanderFixer = new ExpanderFixer(this.relocator.getTabsView());
      }

      const searchParams = new URLSearchParams(window.location.search);
      const initialTab: TabKey = searchParams.has("lc") ? "comments" : "info";

      this.expanderFixer.activateRoute({
        generation,
        rightTabs,
        initialTab
      });

      this.channelHoverAdapter.activateRoute(generation);

      this.setActiveTab(initialTab);
      flexy.setAttribute(
        PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB,
        initialTab === "comments" ? PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER : PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER
      );

      this.relocator.refreshAllSlots();
      this.updatePlaylistTabVisibility();
      this.expanderFixer.updateCommentsCounter();
      this.linkedCommentAdapter.syncLinkedComment();
      InfoMirrorEngine.getInstance().runInfoFix();
      InfoMirrorEngine.getInstance().syncMainDescriptionData();
      this.polymerPatcher.replayConnected(routeContext);
    } finally {
      this.isMounting = false;
    }
  }

  private deactivateCurrentRoute(generation: RouteGeneration = this.routeGeneration): void {
    const errors: unknown[] = [];

    try {
      this.polymerPatcher.suspendRoute();
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.channelHoverAdapter.deactivateRoute(generation);
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.expanderFixer?.deactivateRoute(generation);
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.panelState?.deactivateRoute(generation);
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.relocator.unmountRoute(generation);
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      this.linkedCommentAdapter.destroy();
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      InfoMirrorEngine.getInstance().destroy();
    } catch (err: unknown) {
      errors.push(err);
    }

    try {
      const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
      if (flexy) {
        flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.HIDE_DEFAULT_TEXT_INLINE_EXPANDER);
        flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB);
        flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER);
      }
    } catch (err: unknown) {
      errors.push(err);
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "[TabviewLifecycleCoordinator] Route deactivation failed");
    }
  }

  public updatePlaylistTabVisibility(isPanelAvailable?: boolean): void {
    const playlistTabBtn = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_BTN_PLAYLIST);
    if (!playlistTabBtn) {
      return;
    }

    const playlistPanel = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL);
    const hasListParam = /[?&]list=[^&]+/.test(window.location.search);
    const available =
      typeof isPanelAvailable === "boolean"
        ? isPanelAvailable
        : Boolean(playlistPanel) &&
          !playlistPanel?.hasAttribute("hidden") &&
          !playlistPanel?.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED) &&
          !playlistPanel?.closest(PAGE_CONSTANTS.SELECTORS.HIDDEN_CONTAINER);

    const shouldShow = Boolean(hasListParam && available);
    playlistTabBtn.classList.toggle(PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN, !shouldShow);

    if (!shouldShow && this.relocator.getTabsView().getActiveTab() === "playlist") {
      this.setActiveTab("info");
    }
  }

  private updateCommentsTabVisibility(isAvailable: boolean): void {
    const commentsTabBtn = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS);
    if (commentsTabBtn) {
      commentsTabBtn.classList.toggle(PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN, !isAvailable);
    }
  }

  private resolveNavigationState(): NavigationState {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    let pageType: PageType = "unknown";
    if (pathname.startsWith("/watch")) {
      pageType = "watch";
    } else if (pathname.startsWith("/shorts")) {
      pageType = "shorts";
    } else if (pathname.startsWith("/channel") || pathname.startsWith("/c/") || pathname.startsWith("/@")) {
      pageType = "channel";
    } else if (pathname === "/" || pathname.startsWith("/feed")) {
      pageType = "home";
    }

    const videoId = searchParams.get("v");
    const playlistId = searchParams.get("list");
    const isTheater = PolymerHelper.isTheater();
    const isLiveStream = document.querySelector(PAGE_CONSTANTS.SELECTORS.LIVE_CHAT_FRAME) !== null;

    return {
      pageType,
      videoId,
      playlistId,
      isTheater,
      isLiveStream
    };
  }
}
