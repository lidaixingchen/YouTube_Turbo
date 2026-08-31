import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import type { AppNavigateRequest, NavigationEndpoint, WatchEndpoint, AnyFunction } from "./types";

interface YtdAppResponseData {
  response?: {
    currentVideoEndpoint?: {
      watchEndpoint?: WatchEndpoint & { playlistId?: string };
    };
  };
}

export class MinibrowserRouter {
  private static instance: MinibrowserRouter | null = null;
  private navigationCounter: number = 0;
  private isLoadStartListened: boolean = false;

  public static getInstance(): MinibrowserRouter {
    if (!MinibrowserRouter.instance) {
      MinibrowserRouter.instance = new MinibrowserRouter();
    }
    return MinibrowserRouter.instance;
  }

  public createPatchedHandleNavigate(rawHandleNavigate: AnyFunction): AnyFunction {
    const self = this;

    return function (this: unknown, ...args: unknown[]): unknown {
      const req = args[0] as AppNavigateRequest | undefined;
      if (self.navigationCounter > PAGE_CONSTANTS.MASKS.TOKEN_MASK) {
        self.navigationCounter = 0;
      }
      const token = ++self.navigationCounter;

      let targetEndpoint: NavigationEndpoint | null = null;
      if (req && self.isEligibleForMiniplayer(req)) {
        targetEndpoint = self.extractBrowsableEndpoint(req);
      }

      if (!targetEndpoint || !self.shouldKeepMiniPlayer()) {
        return rawHandleNavigate.apply(this, args);
      }

      self.applyPlaylistProtection();
      self.ensureLoadStartListener();

      const url = targetEndpoint.commandMetadata?.webCommandMetadata?.url || "";
      if (self.isChannelAboutUrl(url)) {
        self.scheduleChannelAboutPopup(token);
      }

      return rawHandleNavigate.apply(this, args);
    };
  }

  private isChannelAboutUrl(url: string): boolean {
    if (!url || !url.endsWith("/about")) {
      return false;
    }
    return (
      PAGE_CONSTANTS.PATTERNS.CHANNEL_ID_ABOUT.test(url) ||
      PAGE_CONSTANTS.PATTERNS.CHANNEL_HANDLE_ABOUT.test(url) ||
      PAGE_CONSTANTS.PATTERNS.CHANNEL_CUSTOM_ABOUT.test(url)
    );
  }

  private shouldKeepMiniPlayer(): boolean {
    const isBrowseSubtype = document.querySelector(PAGE_CONSTANTS.SELECTORS.BROWSE_WITH_SUBTYPE);
    if (isBrowseSubtype) {
      return true;
    }

    const moviePlayers = Array.from(
      document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.MOVIE_PLAYER)
    );
    const moviePlayer = moviePlayers.find((el) => !el.closest(PAGE_CONSTANTS.SELECTORS.HIDDEN_CONTAINER));

    if (moviePlayer) {
      const media = moviePlayer.querySelector<HTMLMediaElement>("video, audio");
      if (
        media &&
        media.currentTime > PAGE_CONSTANTS.THRESHOLDS.MINIPLAYER_MIN_TIME_SEC &&
        media.duration - media.currentTime > PAGE_CONSTANTS.THRESHOLDS.MINIPLAYER_MIN_TIME_SEC &&
        !media.paused
      ) {
        return true;
      }
    }
    return false;
  }

  private isEligibleForMiniplayer(req: AppNavigateRequest): boolean {
    const command = req?.command || req?.endpoint || req?.navigationEndpoint;
    if (!command) {
      return false;
    }

    const hasWatch = Boolean(command.commandMetadata?.webCommandMetadata && command.watchEndpoint);
    const hasBrowse = Boolean(command.commandMetadata?.webCommandMetadata && command.browseEndpoint);
    const hasSearch = Boolean(command.browseEndpoint || command.searchEndpoint);

    if (!hasWatch && !hasBrowse && !hasSearch) {
      return false;
    }

    return this.shouldKeepMiniPlayer();
  }

  private extractBrowsableEndpoint(req: AppNavigateRequest): NavigationEndpoint | null {
    const endpoint = req?.command || req?.endpoint || req?.navigationEndpoint;
    if (!endpoint) {
      return null;
    }

    const meta = endpoint.commandMetadata?.webCommandMetadata;
    if (meta?.url && meta.webPageType) {
      return endpoint;
    }

    return null;
  }

  private applyPlaylistProtection(): void {
    const ytdAppElm = document.querySelector(PAGE_CONSTANTS.SELECTORS.YTD_APP);
    const ytdAppCnt = PolymerHelper.insp(ytdAppElm);
    const appData = ytdAppCnt?.data as YtdAppResponseData | undefined;
    const watchEndpoint = appData?.response?.currentVideoEndpoint?.watchEndpoint;

    if (!watchEndpoint || "playlistId" in watchEndpoint) {
      return;
    }

    let accessCount = 0;
    const maxAccess = PAGE_CONSTANTS.THRESHOLDS.PLAYLIST_PROTECT_MAX_ACCESS;

    Object.defineProperty(watchEndpoint, "playlistId", {
      get(): string {
        accessCount++;
        if (accessCount >= maxAccess) {
          delete watchEndpoint.playlistId;
        }
        return "*";
      },
      set(value: string): void {
        delete watchEndpoint.playlistId;
        watchEndpoint.playlistId = value;
      },
      enumerable: false,
      configurable: true
    });

    const onPageTypeChanged = (): void => {
      delete watchEndpoint.playlistId;
      document.removeEventListener(PAGE_CONSTANTS.DOM_EVENTS.YT_PAGE_TYPE_CHANGED, onPageTypeChanged);
    };

    document.addEventListener(PAGE_CONSTANTS.DOM_EVENTS.YT_PAGE_TYPE_CHANGED, onPageTypeChanged, { once: true });
  }

  private ensureLoadStartListener(): void {
    if (this.isLoadStartListened) {
      return;
    }
    this.isLoadStartListened = true;

    document.addEventListener(
      "loadstart",
      (evt: Event) => {
        const targetMedia = evt.target as HTMLMediaElement | null;
        if (!targetMedia || (targetMedia.nodeName !== "VIDEO" && targetMedia.nodeName !== "AUDIO")) {
          return;
        }

        const mainVideos = Array.from(document.querySelectorAll<HTMLMediaElement>(".video-stream.html5-main-video"));
        for (let i = 0; i < mainVideos.length; i++) {
          const video = mainVideos[i];
          if (video !== targetMedia && !video.paused) {
            void video.pause();
          }
        }
      },
      true
    );
  }

  private scheduleChannelAboutPopup(token: number): void {
    const onNavigateFinish = (): void => {
      document.removeEventListener(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH, onNavigateFinish);
      if (token !== this.navigationCounter) {
        return;
      }

      window.setTimeout(() => {
        const previewModels = Array.from(
          document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.DESCRIPTION_PREVIEW_VIEW_MODEL)
        );
        const previewModel = previewModels.find((el) => !el.closest(PAGE_CONSTANTS.SELECTORS.HIDDEN_CONTAINER));

        if (previewModel) {
          const buttons = Array.from(previewModel.querySelectorAll<HTMLButtonElement>("button"));
          const aboutBtn = buttons.find(
            (b) => !b.closest(PAGE_CONSTANTS.SELECTORS.HIDDEN_CONTAINER) && (b.textContent || "").trim().length > 0
          );
          if (aboutBtn) {
            aboutBtn.click();
          }
        }
      }, PAGE_CONSTANTS.TIMEOUTS.ABOUT_POPUP_TRIGGER_MS);
    };

    document.addEventListener(PAGE_CONSTANTS.DOM_EVENTS.YT_NAVIGATE_FINISH, onNavigateFinish, { once: true });
  }
}
