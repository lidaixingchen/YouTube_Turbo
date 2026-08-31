import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { ObserverRegistry } from "./observer-registry";
import { DOMRelocator } from "./relocator";
import { funcCanCollapse, ExpanderFixer } from "./expander-fixer";
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
      "updateFullBleedElementLocations",
      "updateChatLocation"
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

  private async patchWatchMetadata(): Promise<void> {
    const proto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
    if (!proto) {
      return;
    }

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        return rawMethod.apply(this, args);
      };
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

    this.hookMethod(proto, "attached", (rawMethod) => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement || (this as unknown as HTMLElement);
        if (hostElement instanceof HTMLElement) {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO, "");
          DOMRelocator.getInstance().tryRelocateSlot("info");
          ExpanderFixer.getInstance()?.fixForTabDisplay(false, PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
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


