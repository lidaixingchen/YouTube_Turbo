import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { MinibrowserRouter } from "./minibrowser-router";
import { InfoMirrorEngine } from "./info-mirror-engine";
import { funcCanCollapse, fixInlineExpanderMethods } from "./expander-fixer";
import type {
  PolymerElementInstance,
  AnyFunction,
  PolymerSemanticHooks,
  IdempotentDisposer
} from "./types";

interface PrototypeRestoreEntry {
  proto: Record<string, unknown>;
  methodName: string;
  originalMethod: AnyFunction;
}

interface DisposerEntry {
  readonly element: HTMLElement;
  readonly kind: string;
  readonly disposer: IdempotentDisposer;
}

export class PolymerPatcher {
  private static instance: PolymerPatcher | null = null;
  private isPatched: boolean = false;
  private protectionDepth: number = 0;
  private restoreEntries: PrototypeRestoreEntry[] = [];
  private disposerEntries: DisposerEntry[] = [];
  private hooks: PolymerSemanticHooks | null = null;

  public static getInstance(): PolymerPatcher {
    if (!PolymerPatcher.instance) {
      PolymerPatcher.instance = new PolymerPatcher();
    }
    return PolymerPatcher.instance;
  }

  public runInProtectedContext<R>(callback: () => R): R {
    if (this.protectionDepth > 0) {
      this.protectionDepth++;
      try {
        return callback();
      } finally {
        this.protectionDepth--;
      }
    }

    const ea = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER);
    const eb = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);
    if (ea && eb) {
      this.protectionDepth++;
      ea.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER_TEMP;
      eb.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
      try {
        return callback();
      } finally {
        ea.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
        eb.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER_WRAPPER;
        this.protectionDepth--;
      }
    }

    return callback();
  }

  public applyPatches(hooks?: PolymerSemanticHooks): void {
    if (hooks) {
      this.hooks = hooks;
    }
    if (this.isPatched) {
      return;
    }
    this.isPatched = true;

    this.patchYtdApp();
    this.patchWatchFlexy();
    this.patchExpander();
    this.patchWatchNextSecondaryResults();
    this.patchComments();
    this.patchCommentsHeader();
    this.patchLiveChatFrame();
    this.patchEngagementPanel();
    this.patchWatchMetadata();
    this.patchPlaylistPanel();
    this.patchExpandableDescription();
  }

  private hookMethod(
    proto: Record<string, unknown>,
    methodName: string,
    factory: (original: AnyFunction) => AnyFunction
  ): void {
    const rawMethod = proto[methodName];
    if (typeof rawMethod === "function") {
      const patchedMethod = factory(rawMethod as AnyFunction);
      this.restoreEntries.push({
        proto,
        methodName,
        originalMethod: rawMethod as AnyFunction
      });
      proto[methodName] = patchedMethod;
    }
  }

  private registerDisposer(element: HTMLElement, kind: string, disposer: IdempotentDisposer): void {
    this.runDisposer(element, kind);
    this.disposerEntries.push({ element, kind, disposer });
  }

  private runDisposer(element: HTMLElement, kind: string): void {
    const idx = this.disposerEntries.findIndex((e) => e.element === element && e.kind === kind);
    if (idx !== -1) {
      const [entry] = this.disposerEntries.splice(idx, 1);
      try {
        entry.disposer();
      } catch {
        // 忽略清理异常
      }
    }
  }

  private hasDisposer(element: HTMLElement, kind: string): boolean {
    return this.disposerEntries.some((e) => e.element === element && e.kind === kind);
  }

  public clearAllDisposers(): void {
    while (this.disposerEntries.length > 0) {
      const entry = this.disposerEntries.pop()!;
      try {
        entry.disposer();
      } catch {
        // 忽略清理异常
      }
    }
  }

  public pruneDisconnectedDisposers(): void {
    const remaining: DisposerEntry[] = [];
    for (let i = 0; i < this.disposerEntries.length; i++) {
      const entry = this.disposerEntries[i];
      if (!entry.element.isConnected) {
        try {
          entry.disposer();
        } catch {
          // 忽略清理异常
        }
      } else {
        remaining.push(entry);
      }
    }
    this.disposerEntries = remaining;
  }

  public replayConnected(): void {
    this.replayChatConnected();
    this.replayPlaylistConnected();
    this.replayCommentsConnected();
    this.replayEngagementPanelsConnected();
    this.replayMetadataConnected();
    this.replayRelatedConnected();
    this.replayCommentEntriesConnected();
    this.replayExpandableDescriptionConnected();
  }

  private replayChatConnected(): void {
    const chat = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.LIVE_CHAT_FRAME);
    if (chat && chat.isConnected && !this.hasDisposer(chat, "chat")) {
      chat.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME, "CF");
      const chatContainer = chat.closest("#chat-container") || chat;
      if (chatContainer instanceof HTMLElement && !chatContainer.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_CONTAINER)) {
        chatContainer.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_CONTAINER, "");
      }
      if (this.hooks?.onChatAttached) {
        const disposer = this.hooks.onChatAttached(chat);
        this.registerDisposer(chat, "chat", disposer);
      }
    }
  }

  private replayPlaylistConnected(): void {
    const playlist = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL);
    if (playlist && playlist.isConnected && !this.hasDisposer(playlist, "playlist")) {
      if (this.hooks?.onPlaylistAttached) {
        const disposer = this.hooks.onPlaylistAttached(playlist);
        this.registerDisposer(playlist, "playlist", disposer);
      }
    }
  }

  private replayCommentsConnected(): void {
    const comments = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.COMMENTS_SECTION);
    if (comments && comments.isConnected && !this.hasDisposer(comments, "comments")) {
      comments.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA, "");
      if (this.hooks?.onCommentsAttached) {
        const disposer = this.hooks.onCommentsAttached(comments);
        this.registerDisposer(comments, "comments", disposer);
      }
    }
  }

  private replayEngagementPanelsConnected(): void {
    const panels = document.querySelectorAll<HTMLElement>(
      PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANELS_CONTAINER + " > " + PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM
    );
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      if (panel.isConnected && !this.hasDisposer(panel, "engagementPanel")) {
        if (!panel.hasAttribute("target-id")) {
          panel.setAttribute("target-id", `tid051-${Math.random().toString(36).slice(2, 10)}`);
        }
        panel.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL, "");
        if (this.hooks?.onEngagementPanelAttached) {
          const disposer = this.hooks.onEngagementPanelAttached(panel);
          this.registerDisposer(panel, "engagementPanel", disposer);
        }
      }
    }
  }

  private replayMetadataConnected(): void {
    const metadata = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
    if (metadata && metadata.isConnected && !this.hasDisposer(metadata, "metadata")) {
      InfoMirrorEngine.getInstance().syncMainDescriptionData();
      if (this.hooks?.onMetadataAttached) {
        const disposer = this.hooks.onMetadataAttached(metadata);
        this.registerDisposer(metadata, "metadata", disposer);
      }
    }
  }

  private replayRelatedConnected(): void {
    const relatedList = document.querySelectorAll<HTMLElement>(
      `ytd-watch-next-secondary-results-renderer, ${PAGE_CONSTANTS.SELECTORS.RELATED_SECTION}`
    );
    for (let i = 0; i < relatedList.length; i++) {
      const related = relatedList[i];
      if (
        related.isConnected &&
        !related.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)
      ) {
        related.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST, "");
        this.hooks?.onRelatedAttached(related);
      }
    }
  }

  private replayCommentEntriesConnected(): void {
    const expanders = document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.COMMENT_ENTRY_EXPANDER);
    for (let i = 0; i < expanders.length; i++) {
      const expander = expanders[i];
      if (expander.isConnected && !this.hasDisposer(expander, "commentEntry")) {
        expander.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY, "");
        if (this.hooks?.onCommentEntryAttached) {
          const disposer = this.hooks.onCommentEntryAttached(expander);
          this.registerDisposer(expander, "commentEntry", disposer);
        }
      }
    }
  }

  private replayExpandableDescriptionConnected(): void {
    const descriptions = document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER);
    for (let i = 0; i < descriptions.length; i++) {
      const desc = descriptions[i];
      if (desc.isConnected) {
        if (desc.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER)) {
          desc.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO, "");
          desc.classList.add(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO);
          const inlineExpander = desc.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TEXT_INLINE_EXPANDER);
          if (inlineExpander) {
            const inlineCnt = PolymerHelper.insp(inlineExpander);
            if (inlineCnt) {
              fixInlineExpanderMethods(inlineCnt);
            }
          }
          const tabInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
          if (tabInfo && !desc.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER)) {
            tabInfo.insertBefore(desc, tabInfo.firstChild);
          }
        } else if (!desc.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER) && !desc.closest("noscript")) {
          InfoMirrorEngine.getInstance().syncMainDescriptionData();
        }
      }
    }
  }

  private async patchWatchFlexy(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (!proto) {
      return;
    }

    const locationMethods: ReadonlyArray<string> = [
      "isTwoColumnsChanged_",
      "defaultTwoColumnLayoutChanged",
      "updatePlayerLocation",
      "updateCinematicsLocation",
      "updatePanelsLocation",
      "swatcherooUpdatePanelsLocation",
      "updateErrorScreenLocation",
      "updateFullBleedElementLocations"
    ];

    const patcher = this;
    for (let i = 0; i < locationMethods.length; i++) {
      const method = locationMethods[i];
      this.hookMethod(proto, method, (rawMethod) => {
        return function (this: unknown, ...args: unknown[]): unknown {
          return patcher.runInProtectedContext(() => {
            return rawMethod.apply(this, args);
          });
        };
      });
    }

    this.hookMethod(proto, "updateChatLocation", () => {
      return function (this: PolymerElementInstance): void {
        if (this.is !== "ytd-watch-grid") {
          patcher.runInProtectedContext(() => {
            this.updatePageMediaQueries?.();
            this.schedulePlayerSizeUpdate_?.();
          });
        }
      };
    });
  }

  private async patchExpander(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE("ytd-expander");
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "calculateCanCollapse", () => {
      return funcCanCollapse as AnyFunction;
    });

    const patcher = this;
    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (
          hostElement instanceof HTMLElement &&
          hostElement.matches("[tyt-comments-area] #contents ytd-expander#expander") &&
          !hostElement.matches("[hidden] ytd-expander#expander")
        ) {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY, "");
          if (patcher.hooks?.onCommentEntryAttached) {
            const disposer = patcher.hooks.onCommentEntryAttached(hostElement);
            patcher.registerDisposer(hostElement, "commentEntry", disposer);
          }
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY)) {
            patcher.runDisposer(hostElement, "commentEntry");
            hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY);
          } else if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO)) {
            hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO);
          }
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "childrenChanged", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (
          hostElement instanceof HTMLElement &&
          hostElement.hasAttribute("hidden") &&
          hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO) &&
          hostElement.firstElementChild
        ) {
          hostElement.removeAttribute("hidden");
        }
        return rawMethod.apply(this, args);
      };
    });

    this.replayCommentEntriesConnected();
  }

  private async patchWatchNextSecondaryResults(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE("ytd-watch-next-secondary-results-renderer");
    if (!proto) {
      return;
    }

    const patcher = this;
    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (
          hostElement instanceof HTMLElement &&
          !hostElement.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER)
        ) {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST, "");
          patcher.hooks?.onRelatedAttached(hostElement);
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST);
        }
        return rawMethod.apply(this, args);
      };
    });

    this.replayRelatedConnected();
  }

  private async patchComments(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE("ytd-comments");
    if (!proto) {
      return;
    }

    const patcher = this;
    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.id === "comments") {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA, "");
          if (patcher.hooks?.onCommentsAttached) {
            const disposer = patcher.hooks.onCommentsAttached(hostElement);
            patcher.registerDisposer(hostElement, "comments", disposer);
          }
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA);
          patcher.runDisposer(hostElement, "comments");
        }
        return rawMethod.apply(this, args);
      };
    });

    if (typeof proto._createPropertyObserver === "function") {
      try {
        proto._createPropertyObserver("data", "_dataChanged498", undefined);
        proto._dataChanged498 = function (this: PolymerElementInstance): void {
          const hostElement = this.hostElement || (this as unknown as HTMLElement);
          if (hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA)) {
            const data = this.data as { contents?: Array<{ messageRenderer?: unknown; commentThreadRenderer?: unknown }> } | undefined;
            const contents = data?.contents;
            let status = 0;
            if (contents && contents.length === 1 && contents[0].messageRenderer) {
              status = 2;
            } else if (contents && contents.length > 1 && contents[0].commentThreadRenderer) {
              status = 1;
            }
            if (status > 0) {
              hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS, status.toString());
            } else {
              hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS);
            }
          }
        };
      } catch {
        // 忽略属性观察者注入异常
      }
    }

    this.replayCommentsConnected();
  }

  private async patchCommentsHeader(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.COMMENTS_HEADER_RENDERER);
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.classList.contains("ytd-item-section-renderer")) {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_HEADER_FIELD, "");
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.FIELD_OF_CM_COUNT)) {
            hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.FIELD_OF_CM_COUNT);
            const cmBadge = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.COMMENT_COUNT_BADGE);
            if (cmBadge) {
              cmBadge.textContent = "";
            }
          }
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_HEADER_FIELD);
        }
        return rawMethod.apply(this, args);
      };
    });

    const patcher = this;
    this.hookMethod(proto, "dataChanged", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          patcher.hooks?.onCommentsHeaderDataChanged(hostElement);
        }
        return rawMethod.apply(this, args);
      };
    });
  }

  private async patchLiveChatFrame(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE("ytd-live-chat-frame");
    if (!proto) {
      return;
    }

    const patcher = this;
    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.id === "chat") {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME, "CF");
          if (patcher.hooks?.onChatAttached) {
            const disposer = patcher.hooks.onChatAttached(hostElement);
            patcher.registerDisposer(hostElement, "chat", disposer);
          }
          const chatContainer = hostElement.closest("#chat-container") || hostElement;
          if (chatContainer instanceof HTMLElement && !chatContainer.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_CONTAINER)) {
            chatContainer.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_CONTAINER, "");
          }
        }
        return rawMethod.apply(this, args);
      };
    });

    const chatFrameTokens = new WeakMap<PolymerElementInstance, number>();
    this.hookMethod(proto, "urlChanged", (rawMethod) => {
      return async function (this: PolymerElementInstance): Promise<void> {
        const nextToken = ((chatFrameTokens.get(this) ?? 0) & PAGE_CONSTANTS.MASKS.TOKEN_MASK) + 1;
        chatFrameTokens.set(this, nextToken);

        const chatframe = (this.chatframe || (this.$ && this.$.chatframe)) as HTMLIFrameElement | undefined;

        if (chatframe instanceof HTMLIFrameElement) {
          if (!chatframe.contentDocument) {
            await Promise.resolve();
            if (chatFrameTokens.get(this) !== nextToken) return;
          }

          const isBlank = !this.data || Boolean(this.collapsed);
          let activeObserver: IntersectionObserver | null = null;

          try {
            const timeoutPromise = new Promise<boolean>((resolve) =>
              setTimeout(() => resolve(false), PAGE_CONSTANTS.TIMEOUTS.CHAT_FRAME_READY_MS)
            );
            const intersectionPromise = new Promise<boolean>((resolve) => {
              activeObserver = new IntersectionObserver((entries) => {
                for (let i = 0; i < entries.length; i++) {
                  const rect = entries[i].boundingClientRect;
                  if (isBlank || (rect.width > 0 && rect.height > 0)) {
                    resolve(true);
                    break;
                  }
                }
              });
              activeObserver.observe(chatframe);
            });

            await Promise.race([timeoutPromise, intersectionPromise]);
          } finally {
            if (activeObserver) {
              (activeObserver as IntersectionObserver).disconnect();
            }
          }

          if (chatFrameTokens.get(this) !== nextToken) return;
        }
        rawMethod.apply(this);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME)) {
          patcher.runDisposer(hostElement, "chat");
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME);
        }
        return rawMethod.apply(this, args);
      };
    });

    this.replayChatConnected();
  }

  private async patchEngagementPanel(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM);
    if (!proto) {
      return;
    }

    const patcher = this;
    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (
          hostElement instanceof HTMLElement &&
          hostElement.matches(PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANELS_CONTAINER + " > " + PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM)
        ) {
          if (!hostElement.hasAttribute("target-id")) {
            hostElement.setAttribute("target-id", `tid051-${Math.random().toString(36).slice(2, 10)}`);
          }
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL, "");
          if (patcher.hooks?.onEngagementPanelAttached) {
            const disposer = patcher.hooks.onEngagementPanelAttached(hostElement);
            patcher.registerDisposer(hostElement, "engagementPanel", disposer);
          }
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL);
          patcher.runDisposer(hostElement, "engagementPanel");
        }
        return rawMethod.apply(this, args);
      };
    });

    this.replayEngagementPanelsConnected();
  }

  private async patchYtdApp(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.YTD_APP);
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "handleNavigate", (rawMethod) => {
      return MinibrowserRouter.getInstance().createPatchedHandleNavigate(rawMethod as AnyFunction);
    });
  }

  private async patchWatchMetadata(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
    if (!proto) {
      return;
    }

    const patcher = this;
    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          InfoMirrorEngine.getInstance().syncMainDescriptionData();
          if (patcher.hooks?.onMetadataAttached) {
            const disposer = patcher.hooks.onMetadataAttached(hostElement);
            patcher.registerDisposer(hostElement, "metadata", disposer);
          }
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          patcher.runDisposer(hostElement, "metadata");
        }
        return rawMethod.apply(this, args);
      };
    });

    this.replayMetadataConnected();
  }

  private async patchPlaylistPanel(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL);
    if (!proto) {
      return;
    }

    const patcher = this;
    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          if (patcher.hooks?.onPlaylistAttached) {
            const disposer = patcher.hooks.onPlaylistAttached(hostElement);
            patcher.registerDisposer(hostElement, "playlist", disposer);
          }
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          patcher.runDisposer(hostElement, "playlist");
        }
        return rawMethod.apply(this, args);
      };
    });

    this.replayPlaylistConnected();
  }

  private async patchExpandableDescription(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER);
    if (!proto) {
      return;
    }

    const onAttached = (hostElement: HTMLElement): void => {
      if (!(hostElement instanceof HTMLElement) || !hostElement.isConnected) {
        return;
      }
      if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER)) {
        hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO, "");
        hostElement.classList.add(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO);
        const inlineExpander = hostElement.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TEXT_INLINE_EXPANDER);
        if (inlineExpander) {
          const inlineCnt = PolymerHelper.insp(inlineExpander);
          if (inlineCnt) {
            fixInlineExpanderMethods(inlineCnt);
          }
        }
        const tabInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
        if (tabInfo && !hostElement.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER)) {
          tabInfo.insertBefore(hostElement, tabInfo.firstChild);
        }
      } else if (!hostElement.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER) && !hostElement.closest("noscript")) {
        InfoMirrorEngine.getInstance().syncMainDescriptionData();
      }
    };

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          onAttached(hostElement);
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO);
        }
        return rawMethod.apply(this, args);
      };
    });

    this.replayExpandableDescriptionConnected();
  }

  public restorePatches(): void {
    this.clearAllDisposers();

    for (let i = this.restoreEntries.length - 1; i >= 0; i--) {
      const entry = this.restoreEntries[i];
      entry.proto[entry.methodName] = entry.originalMethod;
    }
    this.restoreEntries = [];
    this.isPatched = false;
    this.protectionDepth = 0;
  }

  public patchFlexyInstance(_element: HTMLElement): void {
    this.applyPatches();
  }
}
