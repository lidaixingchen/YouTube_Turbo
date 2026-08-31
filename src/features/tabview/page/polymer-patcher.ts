import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { ObserverRegistry } from "./observer-registry";
import { DOMRelocator } from "./relocator";
import { funcCanCollapse, fixInlineExpanderMethods, ExpanderFixer } from "./expander-fixer";
import { InfoMirrorEngine } from "./info-mirror-engine";
import { ChannelHoverAdapter } from "./channel-hover-adapter";
import { MinibrowserRouter } from "./minibrowser-router";
import type { PolymerElementInstance, AnyFunction } from "./types";

interface PrototypeRestoreEntry {
  proto: Record<string, unknown>;
  methodName: string;
  originalMethod: AnyFunction;
}

export class PolymerPatcher {
  private static instance: PolymerPatcher | null = null;
  private isPatched: boolean = false;
  private protectionDepth: number = 0;
  private restoreEntries: PrototypeRestoreEntry[] = [];

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

  public applyPatches(): void {
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

  private makeInitAttached(selector: string, handler: (hostElement: HTMLElement) => void): void {
    const elements = document.querySelectorAll<HTMLElement>(selector);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.isConnected) {
        try {
          handler(el);
        } catch {
          // 忽略初始化异常
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

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (
          hostElement instanceof HTMLElement &&
          hostElement.matches("[tyt-comments-area] #contents ytd-expander#expander") &&
          !hostElement.matches("[hidden] ytd-expander#expander")
        ) {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY, "");
          ObserverRegistry.getInstance().observeCommentEntry(hostElement);
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY)) {
            ObserverRegistry.getInstance().unobserveCommentEntry(hostElement);
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
  }

  private async patchWatchNextSecondaryResults(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE("ytd-watch-next-secondary-results-renderer");
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (
          hostElement instanceof HTMLElement &&
          hostElement.matches("#columns #related ytd-watch-next-secondary-results-renderer") &&
          !hostElement.matches("#right-tabs ytd-watch-next-secondary-results-renderer, [hidden] ytd-watch-next-secondary-results-renderer")
        ) {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST, "");
          DOMRelocator.getInstance().tryRelocateSlot("videos");
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
  }

  private async patchComments(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE("ytd-comments");
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.id === "comments") {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA, "");
          ObserverRegistry.getInstance().observeComments(hostElement);
          DOMRelocator.getInstance().tryRelocateSlot("comments");
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA);
          ObserverRegistry.getInstance().disconnectComments();
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

    this.hookMethod(proto, "dataChanged", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        ExpanderFixer.getInstance()?.updateCommentsCounter();
        return rawMethod.apply(this, args);
      };
    });
  }

  private async patchLiveChatFrame(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE("ytd-live-chat-frame");
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.id === "chat") {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME, "CF");
          ObserverRegistry.getInstance().observeChat(hostElement);
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
          ObserverRegistry.getInstance().disconnectChat();
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME);
        }
        return rawMethod.apply(this, args);
      };
    });
  }

  private async patchEngagementPanel(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM);
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.matches(PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANELS_CONTAINER + " > " + PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM)) {
          if (!hostElement.hasAttribute("target-id")) {
            hostElement.setAttribute("target-id", `tid051-${Math.random().toString(36).slice(2, 10)}`);
          }
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL, "");
          ObserverRegistry.getInstance().observeEgmPanel(hostElement);
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL);
          ObserverRegistry.getInstance().updateEgmPanelsStatus();
        }
        return rawMethod.apply(this, args);
      };
    });
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

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        ChannelHoverAdapter.getInstance().bindHoverEvents();
        return rawMethod.apply(this, args);
      };
    });

    this.makeInitAttached(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA, () => {
      ChannelHoverAdapter.getInstance().bindHoverEvents();
    });
  }

  private async patchPlaylistPanel(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL);
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          ObserverRegistry.getInstance().observePlaylist(hostElement);
          DOMRelocator.getInstance().tryRelocateSlot("playlist");
        }
        return rawMethod.apply(this, args);
      };
    });

    this.hookMethod(proto, "detached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        ObserverRegistry.getInstance().disconnectPlaylist();
        return rawMethod.apply(this, args);
      };
    });
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
        // 通道 1：镜像节点挂载完成
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
        InfoMirrorEngine.getInstance().runInfoFix();
      } else if (!hostElement.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER) && !hostElement.closest("noscript")) {
        // 通道 2：原生节点挂载完成，创建/同步镜像节点
        const sandbox = InfoMirrorEngine.getInstance().getOrCreateTemplateSandbox();
        let mirrorNode = document.querySelector<HTMLElement>(
          `${PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER}[${PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER}]`
        );
        if (!mirrorNode) {
          mirrorNode = document.createElement(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER);
          mirrorNode.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER, "");
          mirrorNode.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER_FRONT, "");
          sandbox.appendChild(mirrorNode);
        }
        hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER_BACK, "");
        const mirrorCnt = PolymerHelper.insp(mirrorNode);
        const rawCnt = PolymerHelper.insp(hostElement);
        if (mirrorCnt && rawCnt?.data) {
          mirrorCnt.data = Object.assign({}, rawCnt.data);
        }
        const inlineExpander = mirrorNode.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TEXT_INLINE_EXPANDER);
        if (inlineExpander) {
          const inlineCnt = PolymerHelper.insp(inlineExpander);
          if (inlineCnt) {
            fixInlineExpanderMethods(inlineCnt);
          }
        }
        const tabInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
        if (tabInfo && mirrorNode && !mirrorNode.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER)) {
          tabInfo.insertBefore(mirrorNode, tabInfo.firstChild);
        }
        InfoMirrorEngine.getInstance().runInfoFix();
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

    this.makeInitAttached(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER, onAttached);
  }

  public restorePatches(): void {
    for (let i = 0; i < this.restoreEntries.length; i++) {
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


