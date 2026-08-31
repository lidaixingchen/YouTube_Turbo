import { PAGE_CONSTANTS } from "./constants";
import { ObserverRegistry } from "./observer-registry";
import { PolymerPatcher } from "./polymer-patcher";
import { PolymerHelper } from "./polymer-helper";
import { DOMRelocator } from "./relocator";
import { ExpanderFixer } from "./expander-fixer";
import type { NavigationState, PageType, LocaleSnapshot, TabKey } from "./types";

export class NavigationCoordinator {
  private static instance: NavigationCoordinator | null = null;
  private observerRegistry: ObserverRegistry = ObserverRegistry.getInstance();
  private polymerPatcher: PolymerPatcher = PolymerPatcher.getInstance();
  private relocator: DOMRelocator = DOMRelocator.getInstance();
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
  private guardianTimer: ReturnType<typeof setInterval> | null = null;

  public static getInstance(): NavigationCoordinator {
    if (!NavigationCoordinator.instance) {
      NavigationCoordinator.instance = new NavigationCoordinator();
    }
    return NavigationCoordinator.instance;
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
    this.bindNavigationEvents();
    this.startGuardian();
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
  }

  public setFontSize(tabKey: TabKey, fontSize: number): void {
    this.relocator.getTabsView().setFontSize(tabKey, fontSize);
  }

  public destroy(): void {
    if (this.guardianTimer !== null) {
      clearInterval(this.guardianTimer);
      this.guardianTimer = null;
    }
    this.unmountTabview();
    this.relocator.destroy();
    this.polymerPatcher.restorePatches();
    this.observerRegistry.clearAll();
    this.isInitialized = false;
  }

  private startGuardian(): void {
    if (this.guardianTimer !== null) {
      return;
    }
    this.guardianTimer = setInterval(() => {
      const state = this.resolveNavigationState();
      if (state.pageType === "watch") {
        this.currentState = state;
        if (!this.relocator.isContainerMounted()) {
          this.tryMount();
        } else {
          this.expanderFixer?.updateCommentsCounter();
        }
      }
    }, 1000);
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
    const prevVideoId = this.currentState.videoId;
    this.currentState = nextState;

    if (nextState.pageType === "watch") {
      this.tryMount();
      if (prevVideoId !== nextState.videoId) {
        this.relocator.refreshAllSlots();
      }
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

      this.relocator.mountTabsContainer(secondaryInner, {
        localeSnapshot: this.localeSnapshot,
        onTabSelected: (tabKey) => {
          this.onTabChangedCallback?.(tabKey);
          this.expanderFixer?.fixExpanders();
        },
        onFontSizeChanged: (tabKey, delta) => {
          this.onFontSizeChangedCallback?.(tabKey, delta);
        }
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
    } finally {
      this.isMounting = false;
    }
  }

  private fixInitialTabState(flexy: HTMLElement): void {
    const initialTab: TabKey = "info";
    this.relocator.getTabsView().setActiveTab(initialTab);
    flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB, PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);

    const playlistPanel = document.querySelector(PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL);
    const playlistTabBtn = document.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_BTN_PLAYLIST);
    if (playlistTabBtn) {
      playlistTabBtn.classList.toggle(PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN, !playlistPanel);
    }

    this.expanderFixer?.updateCommentsCounter();
    this.expanderFixer?.syncDescriptionData();
    this.expanderFixer?.fixExpanders();
  }

  private unmountTabview(): void {
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (flexy) {
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.HIDE_DEFAULT_TEXT_INLINE_EXPANDER);
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB);
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
