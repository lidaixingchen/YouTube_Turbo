import { PAGE_CONSTANTS } from "./constants";
import { ObserverRegistry } from "./observer-registry";
import { PolymerPatcher } from "./polymer-patcher";
import { PolymerHelper } from "./polymer-helper";
import { DOMRelocator } from "./relocator";
import { ExpanderFixer } from "./expander-fixer";
import { InfoMirrorEngine } from "./info-mirror-engine";
import { ChannelHoverAdapter } from "./channel-hover-adapter";
import type { NavigationState, PageType, LocaleSnapshot, TabKey } from "./types";

export class TabviewLifecycleCoordinator {
  private static instance: TabviewLifecycleCoordinator | null = null;
  private observerRegistry: ObserverRegistry = ObserverRegistry.getInstance();
  private polymerPatcher: PolymerPatcher = PolymerPatcher.getInstance();
  private relocator: DOMRelocator = DOMRelocator.getInstance();
  private channelHoverAdapter: ChannelHoverAdapter = ChannelHoverAdapter.getInstance();
  private expanderFixer: ExpanderFixer | null = null;

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

  public static getInstance(): TabviewLifecycleCoordinator {
    if (!TabviewLifecycleCoordinator.instance) {
      TabviewLifecycleCoordinator.instance = new TabviewLifecycleCoordinator();
    }
    return TabviewLifecycleCoordinator.instance;
  }

  public init(
    initialLocale: LocaleSnapshot,
    callbacks?: {
      onTabChanged?: (tabKey: TabKey) => void;
      onFontSizeChanged?: (tabKey: TabKey, fontSize: number) => void;
    }
  ): void {
    if (this.isInitialized) {
      return;
    }
    this.localeSnapshot = initialLocale;
    this.onTabChangedCallback = callbacks?.onTabChanged;
    this.onFontSizeChangedCallback = callbacks?.onFontSizeChanged;

    this.polymerPatcher.applyPatches();
    this.channelHoverAdapter.activate();
    this.bindNavigationEvents();
    this.handleRouteChange();
    this.isInitialized = true;
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
    this.relocator.getTabsView().setActiveTab(tabKey);
    const contentSelector = `#tab-${tabKey === "playlist" ? "list" : tabKey}`;
    this.expanderFixer?.fixForTabDisplay(false, contentSelector);
  }

  public setFontSize(tabKey: TabKey, fontSize: number): void {
    this.relocator.getTabsView().setFontSize(tabKey, fontSize);
  }

  public destroy(): void {
    this.channelHoverAdapter.destroy();
    this.unmountTabview();
    this.relocator.destroy();
    this.polymerPatcher.restorePatches();
    this.observerRegistry.clearAll();
    InfoMirrorEngine.getInstance().destroy();
    this.isInitialized = false;
  }

  private bindNavigationEvents(): void {
    this.observerRegistry.addDOMListener(
      document,
      PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH as any,
      () => this.handleRouteChange()
    );

    this.observerRegistry.addDOMListener(
      document,
      PAGE_CONSTANTS.DOM_EVENTS.YT_PAGE_TYPE_CHANGED as any,
      () => this.handleRouteChange()
    );

    this.observerRegistry.addDOMListener(
      document,
      PAGE_CONSTANTS.DOM_EVENTS.YT_ACTION as any,
      () => {
        if (this.currentState.pageType === "watch" && !this.relocator.isContainerMounted()) {
          this.tryMount();
        }
      }
    );

    this.observerRegistry.addDOMListener(
      window,
      "popstate",
      () => this.handleRouteChange()
    );

    document.addEventListener(
      PAGE_CONSTANTS.DOM_EVENTS.ANIMATION_START,
      (evt: Event) => {
        const animEvt = evt as AnimationEvent;
        if (animEvt.animationName === PAGE_CONSTANTS.ANIMATIONS.RELATED_ELEMENT_PROVIDED) {
          if (this.currentState.pageType === "watch") {
            this.tryMount();
            this.relocator.refreshAllSlots();
            InfoMirrorEngine.getInstance().runInfoFix();
          }
        }
      },
      { capture: true, passive: true }
    );

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          this.handleRouteChange();
        },
        { once: true }
      );
    }
  }

  private handleRouteChange(): void {
    const nextState = this.resolveNavigationState();
    const prevPageType = this.currentState.pageType;
    this.currentState = nextState;

    if (nextState.pageType === "watch") {
      const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
      if (flexy) {
        flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER);
      }
      this.tryMount();
      this.relocator.resetSlotState();
      this.relocator.refreshAllSlots();
      this.updatePlaylistTabVisibility();
      this.expanderFixer?.updateCommentsCounter();
      this.expanderFixer?.fixForTabDisplay(false);
      this.relocator.checkAndHandleLinkedComment();
      InfoMirrorEngine.getInstance().syncMainDescriptionData();
      this.channelHoverAdapter.onNavigateFinish();
    } else if (prevPageType === "watch") {
      this.unmountTabview();
    }
  }

  public tryMount(): void {
    if (this.isMounting || !this.localeSnapshot) {
      return;
    }

    const secondaryInner = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_EXACT);
    if (!secondaryInner) {
      return;
    }

    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);

    this.isMounting = true;
    try {
      if (flexy) {
        this.polymerPatcher.patchFlexyInstance(flexy);
        flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.HIDE_DEFAULT_TEXT_INLINE_EXPANDER, "");
      }

      document.documentElement.setAttribute(
        PAGE_CONSTANTS.ATTRIBUTES.TABVIEW_LOADED,
        PAGE_CONSTANTS.VALUES.TABVIEW_LOADED_ICP
      );

      const rightTabs = this.relocator.mountTabsContainer(secondaryInner, {
        localeSnapshot: this.localeSnapshot,
        onTabSelected: (tabKey) => {
          this.onTabChangedCallback?.(tabKey);
          const contentSelector = `#tab-${tabKey === "playlist" ? "list" : tabKey}`;
          this.expanderFixer?.fixForTabDisplay(false, contentSelector);
        },
        onFontSizeChanged: (tabKey, delta) => {
          this.onFontSizeChangedCallback?.(tabKey, delta);
        }
      });

      if (rightTabs) {
        this.observerRegistry.observeRightTabs(rightTabs);
      }

      this.observerRegistry.observeSecondaryInner(secondaryInner, () => {
        this.relocator.sweepSecondary();
      });

      this.relocator.registerDefaultSlots();
      this.relocator.refreshAllSlots();

      if (!this.expanderFixer) {
        this.expanderFixer = new ExpanderFixer(this.relocator.getTabsView());
      }
      this.expanderFixer.init();

      if (flexy) {
        this.fixInitialTabState(flexy);
      }
      this.observerRegistry.activate();
      this.relocator.checkAndHandleLinkedComment();
      InfoMirrorEngine.getInstance().runInfoFix();
    } finally {
      this.isMounting = false;
    }
  }

  public updatePlaylistTabVisibility(): void {
    const playlistTabBtn = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_BTN_PLAYLIST);
    if (!playlistTabBtn) {
      return;
    }

    const playlistPanel = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL);
    const hasListParam = /[?&]list=[^&]+/.test(window.location.search);
    const isPanelAvailable =
      Boolean(playlistPanel) &&
      !playlistPanel?.hasAttribute("hidden") &&
      !playlistPanel?.hasAttribute("collapsed") &&
      !playlistPanel?.closest("[hidden]");

    const shouldShow = Boolean(hasListParam && isPanelAvailable);
    playlistTabBtn.classList.toggle(PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN, !shouldShow);

    if (!shouldShow && this.relocator.getTabsView().getActiveTab() === "playlist") {
      this.setActiveTab("info");
    }
  }

  private fixInitialTabState(flexy: HTMLElement): void {
    const searchParams = new URLSearchParams(window.location.search);
    const initialTab: TabKey = searchParams.has("lc") ? "comments" : "info";
    this.setActiveTab(initialTab);
    flexy.setAttribute(
      PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB,
      initialTab === "comments" ? PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER : PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER
    );

    this.updatePlaylistTabVisibility();
    this.expanderFixer?.updateCommentsCounter();
    this.expanderFixer?.fixForTabDisplay(false);
  }

  private unmountTabview(): void {
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (flexy) {
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.HIDE_DEFAULT_TEXT_INLINE_EXPANDER);
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB);
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER);
    }

    this.expanderFixer?.destroy();
    this.expanderFixer = null;

    this.relocator.restoreAll();
    this.observerRegistry.deactivate();
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

export { TabviewLifecycleCoordinator as NavigationCoordinator };
