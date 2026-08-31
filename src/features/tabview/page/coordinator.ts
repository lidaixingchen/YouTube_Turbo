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
      this.mountTabview();
    }
  }

  public setActiveTab(tabKey: TabKey): void {
    this.relocator.getTabsView().setActiveTab(tabKey);
  }

  public setFontSize(tabKey: TabKey, fontSize: number): void {
    this.relocator.getTabsView().setFontSize(tabKey, fontSize);
  }

  public destroy(): void {
    this.expanderFixer?.destroy();
    this.expanderFixer = null;

    this.relocator.destroy();
    this.polymerPatcher.restorePatches();
    this.observerRegistry.clearAll();
    this.isInitialized = false;
  }

  private bindNavigationEvents(): void {
    this.observerRegistry.addDOMListener(
      window,
      PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH as any,
      () => this.handleRouteChange()
    );

    this.observerRegistry.addDOMListener(
      window,
      PAGE_CONSTANTS.DOM_EVENTS.YT_PAGE_TYPE_CHANGED as any,
      () => this.handleRouteChange()
    );

    this.observerRegistry.addDOMListener(
      window,
      "popstate",
      () => this.handleRouteChange()
    );
  }

  private handleRouteChange(): void {
    const nextState = this.resolveNavigationState();
    const prevPageType = this.currentState.pageType;
    this.currentState = nextState;

    if (nextState.pageType === "watch") {
      this.mountTabview();
    } else if (prevPageType === "watch") {
      this.unmountTabview();
    }
  }

  private async mountTabview(): Promise<void> {
    if (!this.localeSnapshot) {
      return;
    }

    await this.polymerPatcher.applyPatches();

    const flexy = await PolymerHelper.waitForElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY, document.body, 8000);
    if (!flexy) {
      return;
    }

    document.documentElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TABVIEW_LOADED, "icp");

    this.relocator.mountTabsContainer({
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

    if (!this.expanderFixer) {
      this.expanderFixer = new ExpanderFixer(this.relocator.getTabsView());
    }
    this.expanderFixer.init();

    this.observerRegistry.activate();
  }

  private unmountTabview(): void {
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
