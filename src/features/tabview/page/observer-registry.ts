import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { ExpanderFixer } from "./expander-fixer";
import type {
  ObserverConfig,
  MutationObserverConfig,
  ResizeObserverConfig,
  IntersectionObserverConfig
} from "./types";

interface ActiveObserverEntry {
  config: ObserverConfig;
  instance: MutationObserver | ResizeObserver | IntersectionObserver | null;
  active: boolean;
}

export class ObserverRegistry {
  private static instance: ObserverRegistry | null = null;
  private observers: Map<string, ActiveObserverEntry> = new Map();
  private eventCleanupFns: Array<() => void> = [];

  private chatObserver: MutationObserver | null = null;
  private playlistObserver: MutationObserver | null = null;
  private egmPanelsObserver: MutationObserver | null = null;
  private commentsObserver: MutationObserver | null = null;
  private commentIntersectionObserver: IntersectionObserver | null = null;
  private rightTabsResizeObserver: ResizeObserver | null = null;
  private roChannelHover: ResizeObserver | null = null;
  private linkedCommentObserver: MutationObserver | null = null;
  private linkedCommentTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private secondaryInnerObserver: MutationObserver | null = null;
  private lastTabsWidth: number = 0;

  public static getInstance(): ObserverRegistry {
    if (!ObserverRegistry.instance) {
      ObserverRegistry.instance = new ObserverRegistry();
    }
    return ObserverRegistry.instance;
  }

  public registerChannelHoverObserver(callback: ResizeObserverCallback): void {
    if (this.roChannelHover) {
      this.roChannelHover.disconnect();
    }
    this.roChannelHover = new ResizeObserver(callback);
  }

  public observeChannelHover(element: HTMLElement): void {
    this.roChannelHover?.observe(element);
  }

  public unobserveChannelHover(element: HTMLElement): void {
    this.roChannelHover?.unobserve(element);
  }

  public clearChannelHoverObserver(): void {
    this.roChannelHover?.disconnect();
    this.roChannelHover = null;
  }

  public register(config: ObserverConfig): void {
    if (this.observers.has(config.id)) {
      this.deactivate(config.id);
    }
    this.observers.set(config.id, {
      config,
      instance: null,
      active: false
    });
  }

  public activate(id?: string): void {
    if (id) {
      const entry = this.observers.get(id);
      if (entry && !entry.active) {
        this.bindObserver(entry);
      }
      return;
    }

    for (const entry of this.observers.values()) {
      if (!entry.active) {
        this.bindObserver(entry);
      }
    }
  }

  public deactivate(id?: string): void {
    if (id) {
      const entry = this.observers.get(id);
      if (entry && entry.active) {
        this.unbindObserver(entry);
      }
      return;
    }

    for (const entry of this.observers.values()) {
      if (entry.active) {
        this.unbindObserver(entry);
      }
    }
  }

  public observeChat(chatElement: HTMLElement): void {
    if (!this.chatObserver) {
      this.chatObserver = new MutationObserver(() => {
        this.updateChatStatus();
      });
    }
    this.chatObserver.disconnect();
    this.chatObserver.observe(chatElement, {
      attributes: true,
      attributeFilter: [PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED]
    });
    this.updateChatStatus();
  }

  public disconnectChat(): void {
    if (this.chatObserver) {
      this.chatObserver.disconnect();
    }
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (flexy) {
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED);
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT);
    }
  }

  public updateChatStatus(): void {
    const chatElm = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.LIVE_CHAT_FRAME);
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (!chatElm || !flexy) {
      return;
    }
    const isCollapsed = chatElm.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED);
    if (isCollapsed) {
      flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED, "");
    } else {
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED);
    }
    flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT, isCollapsed ? "-" : "+");
  }

  public observePlaylist(playlistElement: HTMLElement): void {
    if (!this.playlistObserver) {
      this.playlistObserver = new MutationObserver(() => {
        this.updatePlaylistStatus();
      });
    }
    this.playlistObserver.disconnect();
    this.playlistObserver.observe(playlistElement, {
      attributes: true,
      attributeFilter: ["hidden", PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED]
    });
    this.updatePlaylistStatus();
  }

  public disconnectPlaylist(): void {
    if (this.playlistObserver) {
      this.playlistObserver.disconnect();
    }
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (flexy) {
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED);
    }
  }

  public updatePlaylistStatus(): void {
    const playlist = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL);
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (!flexy) {
      return;
    }

    let isExpanded = false;
    if (playlist) {
      if (playlist.closest("[hidden]")) {
        isExpanded = false;
      } else if (playlist.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED)) {
        isExpanded = false;
      } else {
        isExpanded = true;
      }
    }

    if (isExpanded) {
      if (flexy.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED) !== "") {
        flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED, "");
      }
    } else {
      if (flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED)) {
        flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED);
      }
    }
  }

  public observeEgmPanel(panelElement: HTMLElement): void {
    if (!this.egmPanelsObserver) {
      this.egmPanelsObserver = new MutationObserver(() => {
        this.updateEgmPanelsStatus();
      });
    }
    this.egmPanelsObserver.observe(panelElement, {
      attributes: true,
      attributeFilter: ["visibility", "hidden"]
    });
    this.updateEgmPanelsStatus();
  }

  public updateEgmPanelsStatus(): void {
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (!flexy) {
      return;
    }

    const panels = document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TYT_EGM_PANEL_ACTIVE);
    const allVisiblePanels: HTMLElement[] = [];

    for (let i = 0; i < panels.length; i++) {
      const panelElm = panels[i];
      const visibility = panelElm.getAttribute("visibility");
      const isHidden =
        visibility === PAGE_CONSTANTS.ATTRIBUTES.ENGAGEMENT_PANEL_VISIBILITY_HIDDEN ||
        Boolean(panelElm.closest("[hidden]"));

      if (isHidden) {
        if (panelElm.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT)) {
          panelElm.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT);
        }
      } else if (visibility === PAGE_CONSTANTS.ATTRIBUTES.ENGAGEMENT_PANEL_VISIBILITY_EXPANDED) {
        if (!panelElm.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT)) {
          panelElm.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT, Date.now().toString());
        }
        allVisiblePanels.push(panelElm);
      }
    }

    if (allVisiblePanels.length >= 1) {
      flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL_WRAP, "");
    } else {
      flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL_WRAP);
    }
  }

  public observeComments(commentsElement: HTMLElement): void {
    if (!this.commentsObserver) {
      this.commentsObserver = new MutationObserver((mutations: MutationRecord[]) => {
        this.handleCommentsMutations(mutations, commentsElement);
      });
    }
    this.commentsObserver.disconnect();
    this.commentsObserver.observe(commentsElement, {
      attributes: true,
      attributeFilter: [
        "hidden",
        PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_VIDEO_ID,
        PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS
      ]
    });
  }

  public disconnectComments(): void {
    if (this.commentsObserver) {
      this.commentsObserver.disconnect();
    }
  }

  private handleCommentsMutations(mutations: MutationRecord[], commentsElement: HTMLElement): void {
    const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    let bfHidden = false;
    let bfDataStatus = false;

    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.attributeName === "hidden" && mutation.target === commentsElement) {
        bfHidden = true;
      } else if (mutation.attributeName === PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS) {
        bfDataStatus = true;
      }
    }

    if ((bfHidden || bfDataStatus) && flexy) {
      const dataStatus = commentsElement.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS);
      if (dataStatus === "2") {
        flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENT_DISABLED, "");
      } else if (dataStatus === "1") {
        flexy.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENT_DISABLED);
      }

      const commentsTabBtn = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS);
      if (commentsTabBtn) {
        const isVisible = !commentsElement.closest("[hidden]");
        commentsTabBtn.classList.toggle(PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN, !isVisible);
      }
    }
  }

  public observeCommentEntry(expanderElement: HTMLElement): void {
    if (!this.commentIntersectionObserver) {
      this.commentIntersectionObserver = new IntersectionObserver(
        (entries: IntersectionObserverEntry[]) => {
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const target = entry.target as HTMLElement;
            const cnt = PolymerHelper.insp(target);
            if (entry.isIntersecting && typeof cnt?.calculateCanCollapse === "function") {
              cnt.calculateCanCollapse(true);
              target.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED, "");
              const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
              if (flexy && !flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER)) {
                flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER, "");
              }
            } else if (target.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED)) {
              target.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED);
            }
          }
        },
        { threshold: [0], rootMargin: "32px" }
      );
    }
    this.commentIntersectionObserver.observe(expanderElement);
  }

  public unobserveCommentEntry(expanderElement: HTMLElement): void {
    if (this.commentIntersectionObserver) {
      this.commentIntersectionObserver.unobserve(expanderElement);
    }
  }

  public observeRightTabs(rightTabsElement: HTMLElement): void {
    if (!this.rightTabsResizeObserver) {
      this.rightTabsResizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        const entry = entries[entries.length - 1];
        if (!entry) {
          return;
        }
        const width = Math.round(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
        if (this.lastTabsWidth !== width) {
          this.lastTabsWidth = width;
          ExpanderFixer.getInstance()?.fixForTabDisplay(true);
        }
      });
    }
    this.rightTabsResizeObserver.disconnect();
    this.rightTabsResizeObserver.observe(rightTabsElement);
  }

  public observeLinkedComment(_targetLc: string, onFound: () => boolean): void {
    this.disconnectLinkedCommentSupervisor();

    const commentsContainer =
      document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER + " ytd-comments #contents") ||
      document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER + " ytd-comments") ||
      document.querySelector<HTMLElement>("ytd-comments");

    if (!commentsContainer) {
      return;
    }

    this.linkedCommentObserver = new MutationObserver(() => {
      const isSuccess = onFound();
      if (isSuccess) {
        this.disconnectLinkedCommentSupervisor();
      }
    });

    this.linkedCommentObserver.observe(commentsContainer, {
      childList: true,
      subtree: true
    });

    this.linkedCommentTimeoutTimer = setTimeout(() => {
      this.disconnectLinkedCommentSupervisor();
    }, PAGE_CONSTANTS.TIMEOUTS.LINKED_COMMENT_READY_MS);
  }

  public disconnectLinkedCommentSupervisor(): void {
    if (this.linkedCommentObserver) {
      this.linkedCommentObserver.disconnect();
      this.linkedCommentObserver = null;
    }
    if (this.linkedCommentTimeoutTimer !== null) {
      clearTimeout(this.linkedCommentTimeoutTimer);
      this.linkedCommentTimeoutTimer = null;
    }
  }

  public observeSecondaryInner(secondaryInner: HTMLElement, onMutated: () => void): void {
    if (!this.secondaryInnerObserver) {
      this.secondaryInnerObserver = new MutationObserver((mutations) => {
        let shouldSweep = false;
        for (let i = 0; i < mutations.length; i++) {
          const mutation = mutations[i];
          for (let j = 0; j < mutation.addedNodes.length; j++) {
            const node = mutation.addedNodes[j];
            if (node instanceof HTMLElement) {
              if (
                !node.matches(
                  "secondary-wrapper, ytd-live-chat-frame, [tyt-chat-container], #chat, #chat-container, .tyt-relocator-anchor, #right-tabs"
                )
              ) {
                shouldSweep = true;
                break;
              }
            }
          }
          if (shouldSweep) break;
        }
        if (shouldSweep) {
          onMutated();
        }
      });
    }

    this.secondaryInnerObserver.disconnect();
    this.secondaryInnerObserver.observe(secondaryInner, {
      childList: true,
      subtree: false
    });
  }

  public disconnectSecondaryInner(): void {
    if (this.secondaryInnerObserver) {
      this.secondaryInnerObserver.disconnect();
      this.secondaryInnerObserver = null;
    }
  }

  public addDOMListener<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (ev: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  public addDOMListener<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (ev: DocumentEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  public addDOMListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    target.addEventListener(type, listener, options);
    this.eventCleanupFns.push(() => {
      target.removeEventListener(type, listener, options);
    });
  }

  public clearAll(): void {
    this.deactivate();
    this.observers.clear();

    this.disconnectChat();
    this.disconnectPlaylist();
    this.disconnectComments();
    this.disconnectLinkedCommentSupervisor();
    this.disconnectSecondaryInner();

    if (this.egmPanelsObserver) {
      this.egmPanelsObserver.disconnect();
      this.egmPanelsObserver = null;
    }
    if (this.commentIntersectionObserver) {
      this.commentIntersectionObserver.disconnect();
      this.commentIntersectionObserver = null;
    }
    if (this.rightTabsResizeObserver) {
      this.rightTabsResizeObserver.disconnect();
      this.rightTabsResizeObserver = null;
    }
    this.clearChannelHoverObserver();

    for (let i = 0; i < this.eventCleanupFns.length; i++) {
      try {
        this.eventCleanupFns[i]();
      } catch {
        // 忽略清理异常
      }
    }
    this.eventCleanupFns = [];
  }

  private bindObserver(entry: ActiveObserverEntry): void {
    const { config } = entry;
    const target = config.getTarget();
    if (!target) {
      return;
    }

    try {
      if (config.type === "mutation") {
        const mutConfig = config as MutationObserverConfig;
        const observer = new MutationObserver(mutConfig.callback);
        observer.observe(target as Node, mutConfig.options);
        entry.instance = observer;
        entry.active = true;
      } else if (config.type === "resize") {
        const resConfig = config as ResizeObserverConfig;
        const observer = new ResizeObserver(resConfig.callback);
        observer.observe(target as Element);
        entry.instance = observer;
        entry.active = true;
      } else if (config.type === "intersection") {
        const intConfig = config as IntersectionObserverConfig;
        const observer = new IntersectionObserver(intConfig.callback, intConfig.options);
        observer.observe(target as Element);
        entry.instance = observer;
        entry.active = true;
      }
    } catch {
      // 忽略异常
    }
  }

  private unbindObserver(entry: ActiveObserverEntry): void {
    if (entry.instance) {
      try {
        entry.instance.disconnect();
      } catch {
        // 忽略异常
      }
      entry.instance = null;
    }
    entry.active = false;
  }
}

