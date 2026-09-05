import { PAGE_CONSTANTS } from "./constants";
import type {
  RouteGeneration,
  IdempotentDisposer,
  WatchRouteContext,
  TabviewPanelStateCallbacks
} from "./types";

function onceDisposer(cleanup: () => void): IdempotentDisposer {
  let disposed: boolean = false;
  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    cleanup();
  };
}

interface SingleAttachment {
  readonly generation: RouteGeneration;
  readonly element: HTMLElement;
  readonly observer: MutationObserver;
  readonly dispose: IdempotentDisposer;
}

export class TabviewPanelState {
  private readonly callbacks: TabviewPanelStateCallbacks;
  private currentGeneration: RouteGeneration | null = null;
  private currentFlexy: HTMLElement | null = null;

  private chatAttachment: SingleAttachment | null = null;
  private playlistAttachment: SingleAttachment | null = null;
  private commentsAttachment: SingleAttachment | null = null;
  private egmAttachments: Set<SingleAttachment> = new Set();

  public constructor(callbacks: TabviewPanelStateCallbacks) {
    this.callbacks = callbacks;
  }

  public activateRoute(context: WatchRouteContext): void {
    if (this.currentGeneration !== null && this.currentGeneration !== context.generation) {
      this.deactivateRoute(this.currentGeneration);
    }
    this.currentGeneration = context.generation;
    this.currentFlexy = context.flexy;
  }

  public attachChat(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer {
    if (this.currentGeneration === null || this.currentGeneration !== generation) {
      return (): void => {};
    }

    if (this.chatAttachment && this.chatAttachment.element === element && this.chatAttachment.generation === generation) {
      return this.chatAttachment.dispose;
    }

    if (this.chatAttachment) {
      this.chatAttachment.dispose();
      this.chatAttachment = null;
    }

    const observer = new MutationObserver((): void => {
      if (this.currentGeneration === null || this.currentGeneration !== generation) {
        return;
      }
      this.projectChatState(element);
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: [PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED]
    });

    const disposer = onceDisposer((): void => {
      observer.disconnect();
      if (this.currentFlexy) {
        this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED, false);
        this.removeFlexyAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT);
      }
      if (this.chatAttachment?.element === element) {
        this.chatAttachment = null;
      }
    });

    this.chatAttachment = {
      generation,
      element,
      observer,
      dispose: disposer
    };

    this.projectChatState(element);
    return disposer;
  }

  public attachPlaylist(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer {
    if (this.currentGeneration === null || this.currentGeneration !== generation) {
      return (): void => {};
    }

    if (this.playlistAttachment && this.playlistAttachment.element === element && this.playlistAttachment.generation === generation) {
      return this.playlistAttachment.dispose;
    }

    if (this.playlistAttachment) {
      this.playlistAttachment.dispose();
      this.playlistAttachment = null;
    }

    const observer = new MutationObserver((): void => {
      if (this.currentGeneration === null || this.currentGeneration !== generation) {
        return;
      }
      this.projectPlaylistState(element);
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: ["hidden", PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED]
    });

    const disposer = onceDisposer((): void => {
      observer.disconnect();
      if (this.currentFlexy) {
        this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED, false);
      }
      if (this.playlistAttachment?.element === element) {
        this.playlistAttachment = null;
      }
    });

    this.playlistAttachment = {
      generation,
      element,
      observer,
      dispose: disposer
    };

    this.projectPlaylistState(element);
    return disposer;
  }

  public attachComments(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer {
    if (this.currentGeneration === null || this.currentGeneration !== generation) {
      return (): void => {};
    }

    if (this.commentsAttachment && this.commentsAttachment.element === element && this.commentsAttachment.generation === generation) {
      return this.commentsAttachment.dispose;
    }

    if (this.commentsAttachment) {
      this.commentsAttachment.dispose();
      this.commentsAttachment = null;
    }

    const observer = new MutationObserver((): void => {
      if (this.currentGeneration === null || this.currentGeneration !== generation) {
        return;
      }
      this.projectCommentsState(element);
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: [
        "hidden",
        PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_VIDEO_ID,
        PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS
      ]
    });

    const disposer = onceDisposer((): void => {
      observer.disconnect();
      if (this.currentFlexy) {
        this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENT_DISABLED, false);
      }
      const commentsTabBtn = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS);
      if (commentsTabBtn) {
        commentsTabBtn.classList.remove(PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN);
      }
      if (this.commentsAttachment?.element === element) {
        this.commentsAttachment = null;
      }
    });

    this.commentsAttachment = {
      generation,
      element,
      observer,
      dispose: disposer
    };

    this.projectCommentsState(element);
    return disposer;
  }

  public attachEngagementPanel(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer {
    if (this.currentGeneration === null || this.currentGeneration !== generation) {
      return (): void => {};
    }

    for (const att of this.egmAttachments) {
      if (att.element === element && att.generation === generation) {
        return att.dispose;
      }
    }

    const observer = new MutationObserver((): void => {
      if (this.currentGeneration === null || this.currentGeneration !== generation) {
        return;
      }
      this.projectEngagementPanelsState();
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: ["visibility", "hidden"]
    });

    let attachmentRef: SingleAttachment;
    const disposer = onceDisposer((): void => {
      observer.disconnect();
      if (element.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT)) {
        element.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT);
      }
      this.egmAttachments.delete(attachmentRef);
      this.projectEngagementPanelsState();
    });

    attachmentRef = {
      generation,
      element,
      observer,
      dispose: disposer
    };

    this.egmAttachments.add(attachmentRef);
    this.projectEngagementPanelsState();
    return disposer;
  }

  public deactivateRoute(generation: RouteGeneration): void {
    if (this.currentGeneration === generation) {
      if (this.chatAttachment) {
        this.chatAttachment.dispose();
        this.chatAttachment = null;
      }
      if (this.playlistAttachment) {
        this.playlistAttachment.dispose();
        this.playlistAttachment = null;
      }
      if (this.commentsAttachment) {
        this.commentsAttachment.dispose();
        this.commentsAttachment = null;
      }
      for (const att of Array.from(this.egmAttachments)) {
        att.dispose();
      }
      this.egmAttachments.clear();

      if (this.currentFlexy) {
        this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED, false);
        this.removeFlexyAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT);
        this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED, false);
        this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENT_DISABLED, false);
        this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL_WRAP, false);
      }

      this.currentGeneration = null;
      this.currentFlexy = null;
    }
  }

  public destroy(): void {
    if (this.currentGeneration !== null) {
      this.deactivateRoute(this.currentGeneration);
    } else {
      if (this.chatAttachment) {
        this.chatAttachment.dispose();
        this.chatAttachment = null;
      }
      if (this.playlistAttachment) {
        this.playlistAttachment.dispose();
        this.playlistAttachment = null;
      }
      if (this.commentsAttachment) {
        this.commentsAttachment.dispose();
        this.commentsAttachment = null;
      }
      for (const att of Array.from(this.egmAttachments)) {
        att.dispose();
      }
      this.egmAttachments.clear();
      this.currentFlexy = null;
    }
  }

  private projectChatState(chatElement: HTMLElement): void {
    if (!this.currentFlexy || !chatElement.isConnected) {
      return;
    }
    const isCollapsed = chatElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED);
    this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_COLLAPSED, isCollapsed);
    this.setFlexyValueAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT, isCollapsed ? "-" : "+");
  }

  private projectPlaylistState(playlistElement: HTMLElement): void {
    if (!this.currentFlexy || !playlistElement.isConnected) {
      return;
    }

    let isExpanded = false;
    let isAvailable = false;

    if (!playlistElement.closest(PAGE_CONSTANTS.SELECTORS.HIDDEN_CONTAINER)) {
      isAvailable = true;
      if (!playlistElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.COLLAPSED)) {
        isExpanded = true;
      }
    }

    this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_PLAYLIST_EXPANDED, isExpanded);
    this.callbacks.onPlaylistAvailabilityChanged(isAvailable);
  }

  private projectCommentsState(commentsElement: HTMLElement): void {
    if (!this.currentFlexy || !commentsElement.isConnected) {
      return;
    }

    const dataStatus = commentsElement.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS);
    const isDisabled = dataStatus === PAGE_CONSTANTS.COMMENTS_STATUS.DISABLED;
    this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENT_DISABLED, isDisabled);

    const isVisible = !commentsElement.closest(PAGE_CONSTANTS.SELECTORS.HIDDEN_CONTAINER);
    const commentsTabBtn = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS);
    if (commentsTabBtn) {
      commentsTabBtn.classList.toggle(PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN, !isVisible);
    }

    this.callbacks.onCommentsAvailabilityChanged(isVisible);
  }

  private projectEngagementPanelsState(): void {
    if (!this.currentFlexy) {
      return;
    }

    let hasVisiblePanel = false;
    for (const att of this.egmAttachments) {
      const panel = att.element;
      if (!panel.isConnected) {
        continue;
      }
      const visibility = panel.getAttribute("visibility");
      const isHidden =
        visibility === PAGE_CONSTANTS.ATTRIBUTES.ENGAGEMENT_PANEL_VISIBILITY_HIDDEN ||
        Boolean(panel.closest(PAGE_CONSTANTS.SELECTORS.HIDDEN_CONTAINER));

      if (isHidden) {
        if (panel.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT)) {
          panel.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT);
        }
      } else if (visibility === PAGE_CONSTANTS.ATTRIBUTES.ENGAGEMENT_PANEL_VISIBILITY_EXPANDED) {
        if (!panel.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT)) {
          panel.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VISIBLE_AT, Date.now().toString());
        }
        hasVisiblePanel = true;
      }
    }

    this.setFlexyBooleanAttribute(this.currentFlexy, PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL_WRAP, hasVisiblePanel);
  }

  private setFlexyBooleanAttribute(flexy: HTMLElement, attr: string, enable: boolean): void {
    const hasAttr = flexy.hasAttribute(attr);
    if (enable && !hasAttr) {
      flexy.setAttribute(attr, "");
    } else if (!enable && hasAttr) {
      flexy.removeAttribute(attr);
    }
  }

  private setFlexyValueAttribute(flexy: HTMLElement, attr: string, value: string): void {
    const currentValue = flexy.getAttribute(attr);
    if (currentValue !== value) {
      flexy.setAttribute(attr, value);
    }
  }

  private removeFlexyAttribute(flexy: HTMLElement, attr: string): void {
    if (flexy.hasAttribute(attr)) {
      flexy.removeAttribute(attr);
    }
  }
}
