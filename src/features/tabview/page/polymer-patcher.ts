import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { MinibrowserRouter } from "./minibrowser-router";
import { InfoMirrorEngine } from "./info-mirror-engine";
import { funcCanCollapse, fixInlineExpanderMethods } from "./expander-fixer";
import type {
  PolymerElementInstance,
  AnyFunction,
  PolymerSemanticHooks,
  IdempotentDisposer,
  WatchRouteContext,
  PolymerControllerPrototype
} from "./types";

type PatchTagState =
  | "waiting-definition"
  | "installed"
  | "capability-unavailable"
  | "install-failed";

interface PatchMethodRecord {
  readonly tag: string;
  readonly proto: Record<string, unknown>;
  readonly methodName: string;
  readonly originalDescriptor: PropertyDescriptor | null;
  readonly originalFunction: AnyFunction;
  readonly installedFunction: AnyFunction;
}

interface DisposerEntry {
  readonly element: HTMLElement;
  readonly kind: string;
  readonly disposer: IdempotentDisposer;
}

interface ChatWaitRecord {
  readonly cycle: InstallCycle;
  readonly host: PolymerElementInstance;
  readonly frame: HTMLIFrameElement | null;
  readonly pageUrl: string;
  readonly args: unknown[];
  readonly native: AnyFunction;
  timerId: ReturnType<typeof setTimeout> | null;
  observer: IntersectionObserver | null;
  finishWait: ((visible: boolean) => void) | null;
  settled: boolean;
}

interface CommentsDataAdapterRecord {
  readonly subscriptions: Set<CommentsDataSubscription>;
  registration: "registered" | "uncertain";
}

interface CommentsDataSubscription {
  readonly cycle: InstallCycle;
}

interface InstallCycle {
  hooks: PolymerSemanticHooks | null;
  closed: boolean;
  routeContext: WatchRouteContext | null;
  restoreEntries: PatchMethodRecord[];
  disposers: DisposerEntry[];
  readonly pendingAttachments: Map<HTMLElement, Set<string>>;
  readonly abortControllers: Set<AbortController>;
  readonly activeTasks: Set<Promise<void>>;
  readonly chatWaits: Map<PolymerElementInstance, ChatWaitRecord>;
  readonly installedMethodKeys: Map<Record<string, unknown>, Set<string>>;
  readonly tagStates: Map<string, PatchTagState>;
  readonly reportedDiagnostics: Set<string>;
  commentsAdapter: { readonly record: CommentsDataAdapterRecord; readonly subscription: CommentsDataSubscription } | null;
}

interface TagInstallSpec {
  readonly tag: string;
  readonly install: (cycle: InstallCycle, proto: PolymerControllerPrototype) => void;
}

const COMMENTS_ADAPTER_KEY: symbol = Symbol.for(PAGE_CONSTANTS.SYMBOLS.COMMENTS_DATA_ADAPTER);

function createCommentsDataCallback(
  record: CommentsDataAdapterRecord
): (this: PolymerElementInstance) => void {
  return function (this: PolymerElementInstance): void {
    for (const subscription of record.subscriptions) {
      const cycle = subscription.cycle;
      if (cycle.closed || cycle.routeContext === null) {
        continue;
      }
      const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
      if (!(hostElement instanceof HTMLElement) || !hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA)) {
        continue;
      }
      const data = this.data as { contents?: Array<{ messageRenderer?: unknown; commentThreadRenderer?: unknown }> } | undefined;
      const contents = data?.contents;
      let status = 0;
      if (contents !== undefined && contents.length === 1 && contents[0].messageRenderer !== undefined) {
        status = 2;
      } else if (contents !== undefined && contents.length > 1 && contents[0].commentThreadRenderer !== undefined) {
        status = 1;
      }
      if (status > 0) {
        hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS, status.toString());
      } else {
        hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_DATA_STATUS);
      }
      return;
    }
  };
}

export class PolymerPatcher {
  private static instance: PolymerPatcher | null = null;
  private currentCycle: InstallCycle | null = null;
  private isRestoring: boolean = false;
  private protectionDepth: number = 0;

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
    if (this.isRestoring) {
      return;
    }
    const current = this.currentCycle;
    if (current !== null && !current.closed) {
      if (hooks === undefined) {
        return;
      }
      if (current.hooks !== hooks) {
        throw new Error(`${PAGE_CONSTANTS.DIAGNOSTICS.PATCH_PREFIX} active install cycle is owned by different hooks`);
      }
      return;
    }
    if (hooks === undefined) {
      return;
    }

    const cycle: InstallCycle = {
      hooks,
      closed: false,
      routeContext: null,
      restoreEntries: [],
      disposers: [],
      pendingAttachments: new Map<HTMLElement, Set<string>>(),
      abortControllers: new Set<AbortController>(),
      activeTasks: new Set<Promise<void>>(),
      chatWaits: new Map<PolymerElementInstance, ChatWaitRecord>(),
      installedMethodKeys: new Map<Record<string, unknown>, Set<string>>(),
      tagStates: new Map<string, PatchTagState>(),
      reportedDiagnostics: new Set<string>(),
      commentsAdapter: null
    };
    this.currentCycle = cycle;

    for (const spec of this.getTagInstallSpecs()) {
      this.startTagInstall(cycle, spec);
    }
  }

  public patchFlexyInstance(_element: HTMLElement): void {
    const cycle = this.currentCycle;
    if (cycle === null || cycle.closed) {
      return;
    }
    const tag = PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY;
    const state = cycle.tagStates.get(tag);
    if (state === "installed" || state === "install-failed") {
      return;
    }
    const proto = PolymerHelper.getDefinedPrototype(tag);
    if (proto === null) {
      return;
    }
    const before = cycle.restoreEntries.length;
    try {
      this.installWatchFlexyMethods(cycle, tag, proto);
      cycle.tagStates.set(tag, cycle.restoreEntries.length > before ? "installed" : "capability-unavailable");
    } catch (err: unknown) {
      cycle.tagStates.set(tag, "install-failed");
      this.diagnose(cycle, tag, null, `install failed: ${String(err)}`);
    }
  }

  public replayConnected(context: WatchRouteContext): void {
    const cycle = this.currentCycle;
    if (cycle === null || cycle.closed || cycle.hooks === null) {
      return;
    }
    if (cycle.routeContext !== null && cycle.routeContext.generation !== context.generation) {
      this.releaseAllAttachments(cycle);
    }
    cycle.routeContext = context;

    this.replayChatConnected(cycle);
    this.replayPlaylistConnected(cycle);
    this.replayCommentsConnected(cycle);
    this.replayEngagementPanelsConnected(cycle);
    this.replayMetadataConnected(cycle);
    this.replayRelatedConnected(cycle);
    this.replayCommentEntriesConnected(cycle);
    this.replayExpandableDescriptionConnected(cycle);
  }

  public suspendRoute(): void {
    const cycle = this.currentCycle;
    if (cycle === null || cycle.closed) {
      return;
    }
    cycle.routeContext = null;
    this.settleAllChatWaits(cycle, true);
    this.releaseAllAttachments(cycle);
  }

  public pruneDisconnectedDisposers(): void {
    const cycle = this.currentCycle;
    if (cycle === null || cycle.closed) {
      return;
    }

    const remaining: DisposerEntry[] = [];
    for (const entry of cycle.disposers) {
      if (entry.element.isConnected) {
        remaining.push(entry);
      } else {
        this.runDisposerSafe(entry.disposer);
      }
    }
    cycle.disposers = remaining;

    const records = Array.from(cycle.chatWaits.values());
    for (const record of records) {
      const hostElement = record.host.hostElement ?? (record.host as unknown as HTMLElement);
      if (!(hostElement instanceof HTMLElement) || !hostElement.isConnected) {
        this.settleChatWait(record, false);
      }
    }
  }

  public restorePatches(): void {
    const cycle = this.currentCycle;
    if (cycle === null || cycle.closed || this.isRestoring) {
      return;
    }
    this.isRestoring = true;
    cycle.closed = true;
    cycle.routeContext = null;
    this.currentCycle = null;

    for (const controller of Array.from(cycle.abortControllers)) {
      controller.abort();
    }
    cycle.abortControllers.clear();

    if (cycle.commentsAdapter !== null) {
      cycle.commentsAdapter.record.subscriptions.delete(cycle.commentsAdapter.subscription);
      cycle.commentsAdapter = null;
    }

    this.settleAllChatWaits(cycle, true);
    this.releaseAllAttachments(cycle);
    this.restoreMethods(cycle);
    cycle.hooks = null;
    cycle.pendingAttachments.clear();
    cycle.activeTasks.clear();
    cycle.tagStates.clear();
    cycle.reportedDiagnostics.clear();
    cycle.chatWaits.clear();
    this.isRestoring = false;
  }

  private getTagInstallSpecs(): readonly TagInstallSpec[] {
    return [
      {
        tag: PAGE_CONSTANTS.SELECTORS.YTD_APP,
        install: (cycle, proto): void => {
          this.installYtdApp(cycle, PAGE_CONSTANTS.SELECTORS.YTD_APP, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY,
        install: (cycle, proto): void => {
          this.installWatchFlexyMethods(cycle, PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.TAGS.YTD_EXPANDER,
        install: (cycle, proto): void => {
          this.installExpander(cycle, PAGE_CONSTANTS.TAGS.YTD_EXPANDER, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.TAGS.YTD_WATCH_NEXT_SECONDARY_RESULTS,
        install: (cycle, proto): void => {
          this.installWatchNextSecondaryResults(cycle, PAGE_CONSTANTS.TAGS.YTD_WATCH_NEXT_SECONDARY_RESULTS, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.TAGS.YTD_COMMENTS,
        install: (cycle, proto): void => {
          this.installComments(cycle, PAGE_CONSTANTS.TAGS.YTD_COMMENTS, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.SELECTORS.COMMENTS_HEADER_RENDERER,
        install: (cycle, proto): void => {
          this.installCommentsHeader(cycle, PAGE_CONSTANTS.SELECTORS.COMMENTS_HEADER_RENDERER, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME,
        install: (cycle, proto): void => {
          this.installLiveChatFrame(cycle, PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM,
        install: (cycle, proto): void => {
          this.installEngagementPanel(cycle, PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.SELECTORS.WATCH_METADATA,
        install: (cycle, proto): void => {
          this.installWatchMetadata(cycle, PAGE_CONSTANTS.SELECTORS.WATCH_METADATA, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL,
        install: (cycle, proto): void => {
          this.installPlaylistPanel(cycle, PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL, proto);
        }
      },
      {
        tag: PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER,
        install: (cycle, proto): void => {
          this.installExpandableDescription(cycle, PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER, proto);
        }
      }
    ];
  }

  private startTagInstall(cycle: InstallCycle, spec: TagInstallSpec): void {
    const controller = new AbortController();
    cycle.abortControllers.add(controller);
    cycle.tagStates.set(spec.tag, "waiting-definition");

    const task: Promise<void> = PolymerHelper.retrieveCE(spec.tag, controller.signal).then(
      (proto: PolymerControllerPrototype | null): void => {
        cycle.abortControllers.delete(controller);
        if (cycle.closed) {
          return;
        }
        if (proto === null) {
          if (!controller.signal.aborted) {
            cycle.tagStates.set(spec.tag, "capability-unavailable");
            this.diagnose(cycle, spec.tag, null, "controller prototype unavailable");
          }
          return;
        }
        const before = cycle.restoreEntries.length;
        try {
          spec.install(cycle, proto);
          cycle.tagStates.set(spec.tag, cycle.restoreEntries.length > before ? "installed" : "capability-unavailable");
        } catch (err: unknown) {
          cycle.tagStates.set(spec.tag, "install-failed");
          this.diagnose(cycle, spec.tag, null, `install failed: ${String(err)}`);
          return;
        }
        if (!cycle.closed && cycle.routeContext !== null) {
          this.replayTagConnected(cycle, spec.tag);
        }
      }
    );

    cycle.activeTasks.add(task);
    void task
      .catch((err: unknown): void => {
        if (!cycle.closed) {
          this.diagnose(cycle, spec.tag, null, `install task rejected: ${String(err)}`);
        }
      })
      .finally((): void => {
        cycle.activeTasks.delete(task);
      });
  }

  private replayTagConnected(cycle: InstallCycle, tag: string): void {
    switch (tag) {
      case PAGE_CONSTANTS.TAGS.YTD_EXPANDER:
        this.replayCommentEntriesConnected(cycle);
        break;
      case PAGE_CONSTANTS.TAGS.YTD_WATCH_NEXT_SECONDARY_RESULTS:
        this.replayRelatedConnected(cycle);
        break;
      case PAGE_CONSTANTS.TAGS.YTD_COMMENTS:
        this.replayCommentsConnected(cycle);
        break;
      case PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME:
        this.replayChatConnected(cycle);
        break;
      case PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM:
        this.replayEngagementPanelsConnected(cycle);
        break;
      case PAGE_CONSTANTS.SELECTORS.WATCH_METADATA:
        this.replayMetadataConnected(cycle);
        break;
      case PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL:
        this.replayPlaylistConnected(cycle);
        break;
      case PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER:
        this.replayExpandableDescriptionConnected(cycle);
        break;
      default:
        break;
    }
  }

  private diagnose(cycle: InstallCycle, tag: string, method: string | null, message: string): void {
    const key = `${tag}::${method ?? ""}::${message}`;
    if (cycle.reportedDiagnostics.has(key)) {
      return;
    }
    cycle.reportedDiagnostics.add(key);
    console.warn(`${PAGE_CONSTANTS.DIAGNOSTICS.PATCH_PREFIX} ${tag}${method !== null ? `.${method}` : ""}: ${message}`);
  }

  private installMethod(
    cycle: InstallCycle,
    tag: string,
    proto: PolymerControllerPrototype,
    methodName: string,
    factory: (original: AnyFunction) => AnyFunction
  ): boolean {
    if (cycle.closed) {
      return false;
    }
    const owned = cycle.installedMethodKeys.get(proto);
    if (owned !== undefined && owned.has(methodName)) {
      return true;
    }

    const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
    let original: AnyFunction;
    let originalDescriptor: PropertyDescriptor | null;
    if (descriptor !== undefined) {
      if (typeof descriptor.value !== "function" || descriptor.writable !== true || descriptor.configurable !== true) {
        this.diagnose(cycle, tag, methodName, "descriptor is not safely replaceable; capability skipped");
        return false;
      }
      original = descriptor.value;
      originalDescriptor = descriptor;
    } else {
      const chained = proto[methodName];
      if (typeof chained !== "function") {
        this.diagnose(cycle, tag, methodName, "method unavailable on prototype");
        return false;
      }
      original = chained as AnyFunction;
      originalDescriptor = null;
    }

    let installed: AnyFunction;
    try {
      installed = factory(original);
    } catch (err: unknown) {
      this.diagnose(cycle, tag, methodName, `patch factory failed: ${String(err)}`);
      return false;
    }

    try {
      proto[methodName] = installed;
    } catch (err: unknown) {
      this.diagnose(cycle, tag, methodName, `prototype write failed: ${String(err)}`);
      return false;
    }

    cycle.restoreEntries.push({
      tag,
      proto,
      methodName,
      originalDescriptor,
      originalFunction: original,
      installedFunction: installed
    });
    if (owned === undefined) {
      cycle.installedMethodKeys.set(proto, new Set<string>());
    }
    cycle.installedMethodKeys.get(proto)?.add(methodName);
    return true;
  }

  private restoreMethods(cycle: InstallCycle): void {
    for (let i = cycle.restoreEntries.length - 1; i >= 0; i--) {
      const record = cycle.restoreEntries[i];
      let current: PropertyDescriptor | undefined;
      try {
        current = Object.getOwnPropertyDescriptor(record.proto, record.methodName);
      } catch {
        current = undefined;
      }
      if (current === undefined) {
        continue;
      }
      if (current.value !== record.installedFunction) {
        this.diagnose(cycle, record.tag, record.methodName, "prototype method was replaced by a third party; keeping current value");
        continue;
      }
      try {
        if (record.originalDescriptor !== null) {
          Object.defineProperty(record.proto, record.methodName, record.originalDescriptor);
        } else {
          delete record.proto[record.methodName];
        }
      } catch (err: unknown) {
        this.diagnose(cycle, record.tag, record.methodName, `restore failed: ${String(err)}`);
      }
    }
    cycle.restoreEntries = [];
    cycle.installedMethodKeys.clear();
  }

  private findDisposerIndex(cycle: InstallCycle, element: HTMLElement, kind: string): number {
    for (let i = 0; i < cycle.disposers.length; i++) {
      const entry = cycle.disposers[i];
      if (entry.element === element && entry.kind === kind) {
        return i;
      }
    }
    return -1;
  }

  private runDisposerSafe(disposer: IdempotentDisposer): void {
    try {
      disposer();
    } catch {
      // 清理异常不影响其余资源释放
    }
  }

  private releaseDisposer(cycle: InstallCycle, element: HTMLElement, kind: string): void {
    const idx = this.findDisposerIndex(cycle, element, kind);
    if (idx !== -1) {
      const [entry] = cycle.disposers.splice(idx, 1);
      this.runDisposerSafe(entry.disposer);
    }
  }

  private releaseAllAttachments(cycle: InstallCycle): void {
    while (cycle.disposers.length > 0) {
      const entry = cycle.disposers.pop();
      if (entry !== undefined) {
        this.runDisposerSafe(entry.disposer);
      }
    }
  }

  private isAttachmentPending(cycle: InstallCycle, element: HTMLElement, kind: string): boolean {
    return cycle.pendingAttachments.get(element)?.has(kind) === true;
  }

  private markAttachmentPending(cycle: InstallCycle, element: HTMLElement, kind: string): void {
    let kinds = cycle.pendingAttachments.get(element);
    if (kinds === undefined) {
      kinds = new Set<string>();
      cycle.pendingAttachments.set(element, kinds);
    }
    kinds.add(kind);
  }

  private clearAttachmentPending(cycle: InstallCycle, element: HTMLElement, kind: string): void {
    const kinds = cycle.pendingAttachments.get(element);
    if (kinds !== undefined) {
      kinds.delete(kind);
      if (kinds.size === 0) {
        cycle.pendingAttachments.delete(element);
      }
    }
  }

  private attachSemanticElement(
    cycle: InstallCycle,
    element: HTMLElement,
    kind: string,
    mark: (element: HTMLElement) => void,
    createDisposer: () => IdempotentDisposer | null
  ): void {
    if (cycle.closed || cycle.routeContext === null || cycle.hooks === null || !element.isConnected) {
      return;
    }
    if (this.findDisposerIndex(cycle, element, kind) !== -1) {
      return;
    }
    if (this.isAttachmentPending(cycle, element, kind)) {
      return;
    }

    this.markAttachmentPending(cycle, element, kind);
    let disposer: IdempotentDisposer | null = null;
    try {
      mark(element);
      disposer = createDisposer();
    } catch (err: unknown) {
      this.diagnose(cycle, "", kind, `semantic attach failed: ${String(err)}`);
    }
    this.clearAttachmentPending(cycle, element, kind);

    const stillValid =
      !cycle.closed &&
      cycle.routeContext !== null &&
      cycle.hooks !== null &&
      element.isConnected &&
      this.findDisposerIndex(cycle, element, kind) === -1;
    if (!stillValid) {
      if (disposer !== null) {
        this.runDisposerSafe(disposer);
      }
      return;
    }
    if (disposer !== null) {
      cycle.disposers.push({ element, kind, disposer });
    }
  }

  private notifySemantic(cycle: InstallCycle, element: HTMLElement, tag: string, notify: () => void): void {
    if (cycle.closed || cycle.routeContext === null || cycle.hooks === null || !element.isConnected) {
      return;
    }
    try {
      notify();
    } catch (err: unknown) {
      this.diagnose(cycle, tag, null, `semantic notify failed: ${String(err)}`);
    }
  }

  private settleChatWait(record: ChatWaitRecord, delegateNative: boolean): unknown {
    if (record.settled) {
      return undefined;
    }
    record.settled = true;
    if (record.timerId !== null) {
      clearTimeout(record.timerId);
      record.timerId = null;
    }
    if (record.observer !== null) {
      record.observer.disconnect();
      record.observer = null;
    }
    if (record.finishWait !== null) {
      const finishWait = record.finishWait;
      record.finishWait = null;
      finishWait(false);
    }
    if (record.cycle.chatWaits.get(record.host) === record) {
      record.cycle.chatWaits.delete(record.host);
    }
    if (!delegateNative || !this.isChatWaitEligibleForNative(record)) {
      return undefined;
    }
    try {
      return record.native.apply(record.host, record.args);
    } catch (err: unknown) {
      this.diagnose(
        record.cycle,
        PAGE_CONSTANTS.TAGS.YTD_LIVE_CHAT_FRAME,
        PAGE_CONSTANTS.METHODS.URL_CHANGED,
        `deferred native delegation failed: ${String(err)}`
      );
      return undefined;
    }
  }

  private isChatWaitEligibleForNative(record: ChatWaitRecord): boolean {
    const hostElement = record.host.hostElement ?? (record.host as unknown as HTMLElement);
    if (!(hostElement instanceof HTMLElement) || !hostElement.isConnected) {
      return false;
    }
    if (record.pageUrl !== window.location.href) {
      return false;
    }
    if (record.frame !== null && !record.frame.isConnected) {
      return false;
    }
    return true;
  }

  private settleAllChatWaits(cycle: InstallCycle, delegateNative: boolean): void {
    const records = Array.from(cycle.chatWaits.values());
    for (const record of records) {
      this.settleChatWait(record, delegateNative);
    }
  }

  private awaitChatFrameReady(record: ChatWaitRecord): Promise<boolean> {
    return new Promise<boolean>((resolve: (visible: boolean) => void): void => {
      let finished = false;
      const finish = (visible: boolean): void => {
        if (finished) {
          return;
        }
        finished = true;
        record.finishWait = null;
        if (record.timerId !== null) {
          clearTimeout(record.timerId);
          record.timerId = null;
        }
        if (record.observer !== null) {
          record.observer.disconnect();
          record.observer = null;
        }
        resolve(visible);
      };
      record.finishWait = finish;

      record.timerId = setTimeout((): void => {
        finish(false);
      }, PAGE_CONSTANTS.TIMEOUTS.CHAT_FRAME_READY_MS);

      if (record.frame === null) {
        finish(true);
        return;
      }
      const isBlank = !record.host.data || Boolean(record.host.collapsed);
      const observer = new IntersectionObserver((entries: IntersectionObserverEntry[]): void => {
        for (let i = 0; i < entries.length; i++) {
          const rect = entries[i].boundingClientRect;
          if (isBlank || (rect.width > 0 && rect.height > 0)) {
            finish(true);
            break;
          }
        }
      });
      record.observer = observer;
      observer.observe(record.frame);
    });
  }

  private createUrlChangedWrapper(cycle: InstallCycle, native: AnyFunction): AnyFunction {
    const patcher = this;
    return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
      const host = this;
      if (cycle.closed) {
        return native.apply(host, args);
      }
      const previous = cycle.chatWaits.get(host);
      if (previous !== undefined) {
        patcher.settleChatWait(previous, false);
      }
      const frameRaw = (host.chatframe ?? (host.$ !== undefined ? host.$.chatframe : undefined)) as HTMLIFrameElement | undefined;
      const frame = frameRaw instanceof HTMLIFrameElement ? frameRaw : null;
      const record: ChatWaitRecord = {
        cycle,
        host,
        frame,
        pageUrl: window.location.href,
        args,
        native,
        timerId: null,
        observer: null,
        finishWait: null,
        settled: false
      };
      cycle.chatWaits.set(host, record);
      return patcher.runChatWait(cycle, record);
    };
  }

  private async runChatWait(cycle: InstallCycle, record: ChatWaitRecord): Promise<unknown> {
    if (record.frame !== null && !record.frame.contentDocument) {
      await Promise.resolve();
      if (record.settled || cycle.chatWaits.get(record.host) !== record) {
        return undefined;
      }
    }
    await this.awaitChatFrameReady(record);
    if (record.settled || cycle.chatWaits.get(record.host) !== record) {
      return undefined;
    }
    return this.settleChatWait(record, true);
  }

  private ensureCommentsDataAdapter(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): boolean {
    const protoWithSymbols = proto as unknown as Record<string | symbol, unknown>;
    const existing = protoWithSymbols[COMMENTS_ADAPTER_KEY] as CommentsDataAdapterRecord | undefined;
    if (existing !== undefined && existing !== null && existing.subscriptions instanceof Set) {
      return existing.registration === "registered";
    }

    const callbackName = PAGE_CONSTANTS.PROPERTIES.COMMENTS_DATA_CALLBACK;
    if (Object.prototype.hasOwnProperty.call(proto, callbackName) || proto[callbackName] !== undefined) {
      this.diagnose(cycle, tag, callbackName, "stable callback property already defined; adapter unavailable");
      return false;
    }

    const record: CommentsDataAdapterRecord = {
      subscriptions: new Set<CommentsDataSubscription>(),
      registration: "uncertain"
    };
    try {
      Object.defineProperty(protoWithSymbols, COMMENTS_ADAPTER_KEY, {
        value: record,
        writable: false,
        enumerable: false,
        configurable: true
      });
    } catch (err: unknown) {
      this.diagnose(cycle, tag, callbackName, `adapter record registration failed: ${String(err)}`);
      return false;
    }

    try {
      protoWithSymbols[callbackName] = createCommentsDataCallback(record);
    } catch (err: unknown) {
      this.diagnose(cycle, tag, callbackName, `stable callback installation failed: ${String(err)}`);
      return false;
    }

    if (typeof proto._createPropertyObserver !== "function") {
      this.diagnose(cycle, tag, PAGE_CONSTANTS.METHODS.CREATE_PROPERTY_OBSERVER, "property effect registration unavailable");
      return false;
    }
    try {
      (proto._createPropertyObserver as (property: string, observerMethod: string, options?: unknown) => void).call(
        proto,
        "data",
        callbackName,
        undefined
      );
      record.registration = "registered";
    } catch (err: unknown) {
      this.diagnose(cycle, tag, callbackName, `property effect registration failed: ${String(err)}`);
      return false;
    }
    return true;
  }

  private installYtdApp(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.HANDLE_NAVIGATE, (raw: AnyFunction): AnyFunction => {
      const adapted = MinibrowserRouter.getInstance().createPatchedHandleNavigate(raw);
      return function (this: unknown, ...args: unknown[]): unknown {
        if (cycle.closed) {
          return raw.apply(this, args);
        }
        return adapted.apply(this, args);
      };
    });
  }

  private installWatchFlexyMethods(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    for (const method of PAGE_CONSTANTS.METHODS.FLEXY_LOCATION_PROTECT) {
      this.installMethod(cycle, tag, proto, method, (raw: AnyFunction): AnyFunction => {
        return function (this: unknown, ...args: unknown[]): unknown {
          if (cycle.closed || cycle.routeContext === null) {
            return raw.apply(this, args);
          }
          return patcher.runInProtectedContext((): unknown => raw.apply(this, args));
        };
      });
    }

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.UPDATE_CHAT_LOCATION, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance): void {
        if (cycle.closed || cycle.routeContext === null) {
          raw.apply(this);
          return;
        }
        if (this.is !== "ytd-watch-grid") {
          patcher.runInProtectedContext((): void => {
            this.updatePageMediaQueries?.();
            this.schedulePlayerSizeUpdate_?.();
          });
        }
      };
    });
  }

  private installExpander(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    const kinds = PAGE_CONSTANTS.ATTACHMENT_KINDS;

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.CALCULATE_CAN_COLLAPSE, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): void {
        if (cycle.closed || cycle.routeContext === null) {
          raw.apply(this, args);
          return;
        }
        (funcCanCollapse as AnyFunction).apply(this, args);
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (
          cycle.closed ||
          !(hostElement instanceof HTMLElement) ||
          !hostElement.matches(PAGE_CONSTANTS.SELECTORS.COMMENT_ENTRY_EXPANDER) ||
          hostElement.matches(PAGE_CONSTANTS.SELECTORS.HIDDEN_COMMENT_ENTRY_EXPANDER)
        ) {
          return proceed();
        }
        patcher.attachSemanticElement(
          cycle,
          hostElement,
          kinds.COMMENT_ENTRY,
          (element: HTMLElement): void => {
            element.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY, "");
          },
          (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onCommentEntryAttached(hostElement) : null)
        );
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement) {
          if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY)) {
            patcher.releaseDisposer(cycle, hostElement, kinds.COMMENT_ENTRY);
            hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY);
          } else if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO)) {
            hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO);
          }
        }
        return raw.apply(this, args);
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.CHILDREN_CHANGED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (
          !cycle.closed &&
          cycle.routeContext !== null &&
          hostElement instanceof HTMLElement &&
          hostElement.hasAttribute("hidden") &&
          hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO) &&
          hostElement.firstElementChild !== null
        ) {
          hostElement.removeAttribute("hidden");
        }
        return raw.apply(this, args);
      };
    });
  }

  private installWatchNextSecondaryResults(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (
          cycle.closed ||
          !(hostElement instanceof HTMLElement) ||
          hostElement.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER) !== null
        ) {
          return proceed();
        }
        patcher.notifySemantic(cycle, hostElement, tag, (): void => {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST, "");
          cycle.hooks?.onRelatedAttached(hostElement);
        });
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST);
        }
        return raw.apply(this, args);
      };
    });
  }

  private installComments(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    const kinds = PAGE_CONSTANTS.ATTACHMENT_KINDS;

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (cycle.closed || !(hostElement instanceof HTMLElement) || hostElement.id !== "comments") {
          return proceed();
        }
        patcher.attachSemanticElement(
          cycle,
          hostElement,
          kinds.COMMENTS,
          (element: HTMLElement): void => {
            element.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA, "");
          },
          (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onCommentsAttached(hostElement) : null)
        );
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA);
          patcher.releaseDisposer(cycle, hostElement, kinds.COMMENTS);
        }
        return raw.apply(this, args);
      };
    });

    if (this.ensureCommentsDataAdapter(cycle, tag, proto)) {
      const record = (proto as unknown as Record<string | symbol, unknown>)[COMMENTS_ADAPTER_KEY] as CommentsDataAdapterRecord;
      const subscription: CommentsDataSubscription = { cycle };
      record.subscriptions.add(subscription);
      cycle.commentsAdapter = { record, subscription };
    }
  }

  private installCommentsHeader(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (
          !cycle.closed &&
          cycle.routeContext !== null &&
          hostElement instanceof HTMLElement &&
          hostElement.classList.contains("ytd-item-section-renderer")
        ) {
          hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_HEADER_FIELD, "");
        }
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement) {
          if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.FIELD_OF_CM_COUNT)) {
            hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.FIELD_OF_CM_COUNT);
            const cmBadge = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.COMMENT_COUNT_BADGE);
            if (cmBadge !== null) {
              cmBadge.textContent = "";
            }
          }
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_HEADER_FIELD);
        }
        return raw.apply(this, args);
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DATA_CHANGED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement) {
          patcher.notifySemantic(cycle, hostElement, tag, (): void => {
            cycle.hooks?.onCommentsHeaderDataChanged(hostElement);
          });
        }
        return raw.apply(this, args);
      };
    });
  }

  private installLiveChatFrame(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    const kinds = PAGE_CONSTANTS.ATTACHMENT_KINDS;

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (cycle.closed || !(hostElement instanceof HTMLElement) || hostElement.id !== "chat") {
          return proceed();
        }
        patcher.attachSemanticElement(
          cycle,
          hostElement,
          kinds.CHAT,
          (element: HTMLElement): void => {
            element.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME, "CF");
            const chatContainer = element.closest(PAGE_CONSTANTS.SELECTORS.CHAT_CONTAINER) ?? element;
            if (chatContainer instanceof HTMLElement && !chatContainer.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_CONTAINER)) {
              chatContainer.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_CONTAINER, "");
            }
          },
          (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onChatAttached(hostElement) : null)
        );
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.URL_CHANGED, (raw: AnyFunction): AnyFunction => {
      return patcher.createUrlChangedWrapper(cycle, raw);
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME)) {
          patcher.releaseDisposer(cycle, hostElement, kinds.CHAT);
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME);
        }
        return raw.apply(this, args);
      };
    });
  }

  private installEngagementPanel(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    const kinds = PAGE_CONSTANTS.ATTACHMENT_KINDS;
    const panelSelector = PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANELS_CONTAINER + " > " + PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM;

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (cycle.closed || !(hostElement instanceof HTMLElement) || !hostElement.matches(panelSelector)) {
          return proceed();
        }
        patcher.attachSemanticElement(
          cycle,
          hostElement,
          kinds.ENGAGEMENT_PANEL,
          (element: HTMLElement): void => {
            if (!element.hasAttribute("target-id")) {
              element.setAttribute("target-id", `${PAGE_CONSTANTS.VALUES.ENGAGEMENT_TARGET_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`);
            }
            element.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL, "");
          },
          (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onEngagementPanelAttached(hostElement) : null)
        );
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL);
          patcher.releaseDisposer(cycle, hostElement, kinds.ENGAGEMENT_PANEL);
        }
        return raw.apply(this, args);
      };
    });
  }

  private installWatchMetadata(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    const kinds = PAGE_CONSTANTS.ATTACHMENT_KINDS;

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (cycle.closed || !(hostElement instanceof HTMLElement)) {
          return proceed();
        }
        patcher.attachSemanticElement(
          cycle,
          hostElement,
          kinds.METADATA,
          (): void => {
            InfoMirrorEngine.getInstance().syncMainDescriptionData();
          },
          (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onMetadataAttached(hostElement) : null)
        );
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement) {
          patcher.releaseDisposer(cycle, hostElement, kinds.METADATA);
        }
        return raw.apply(this, args);
      };
    });
  }

  private installPlaylistPanel(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    const kinds = PAGE_CONSTANTS.ATTACHMENT_KINDS;

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (cycle.closed || !(hostElement instanceof HTMLElement)) {
          return proceed();
        }
        patcher.attachSemanticElement(
          cycle,
          hostElement,
          kinds.PLAYLIST,
          (): void => {},
          (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onPlaylistAttached(hostElement) : null)
        );
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement) {
          patcher.releaseDisposer(cycle, hostElement, kinds.PLAYLIST);
        }
        return raw.apply(this, args);
      };
    });
  }

  private installExpandableDescription(cycle: InstallCycle, tag: string, proto: PolymerControllerPrototype): void {
    const patcher = this;
    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.ATTACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        const proceed = (): unknown => raw.apply(this, args);
        if (cycle.closed || !(hostElement instanceof HTMLElement)) {
          return proceed();
        }
        patcher.adaptExpandableDescription(cycle, hostElement);
        return proceed();
      };
    });

    this.installMethod(cycle, tag, proto, PAGE_CONSTANTS.METHODS.DETACHED, (raw: AnyFunction): AnyFunction => {
      return function (this: PolymerElementInstance, ...args: unknown[]): unknown {
        const hostElement = this.hostElement ?? (this as unknown as HTMLElement);
        if (!cycle.closed && hostElement instanceof HTMLElement && hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO)) {
          hostElement.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO);
        }
        return raw.apply(this, args);
      };
    });
  }

  private adaptExpandableDescription(cycle: InstallCycle, hostElement: HTMLElement): void {
    if (cycle.closed || cycle.routeContext === null || !hostElement.isConnected) {
      return;
    }
    if (hostElement.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER)) {
      hostElement.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO, "");
      hostElement.classList.add(PAGE_CONSTANTS.ATTRIBUTES.TYT_MAIN_INFO);
      const inlineExpander = hostElement.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TEXT_INLINE_EXPANDER);
      if (inlineExpander !== null) {
        const inlineCnt = PolymerHelper.insp(inlineExpander);
        if (inlineCnt !== null) {
          fixInlineExpanderMethods(inlineCnt);
        }
      }
      const tabInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
      if (tabInfo !== null && hostElement.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER) === null) {
        tabInfo.insertBefore(hostElement, tabInfo.firstChild);
      }
    } else if (
      hostElement.closest(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER) === null &&
      hostElement.closest(PAGE_CONSTANTS.TAGS.NOSCRIPT) === null
    ) {
      InfoMirrorEngine.getInstance().syncMainDescriptionData();
    }
  }

  private replayChatConnected(cycle: InstallCycle): void {
    const chat = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.LIVE_CHAT_FRAME);
    if (chat === null || !chat.isConnected) {
      return;
    }
    this.attachSemanticElement(
      cycle,
      chat,
      PAGE_CONSTANTS.ATTACHMENT_KINDS.CHAT,
      (element: HTMLElement): void => {
        element.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_ACTIVE_CHAT_FRAME, "CF");
        const chatContainer = element.closest(PAGE_CONSTANTS.SELECTORS.CHAT_CONTAINER) ?? element;
        if (chatContainer instanceof HTMLElement && !chatContainer.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_CONTAINER)) {
          chatContainer.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CHAT_CONTAINER, "");
        }
      },
      (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onChatAttached(chat) : null)
    );
  }

  private replayPlaylistConnected(cycle: InstallCycle): void {
    const playlist = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.PLAYLIST_PANEL);
    if (playlist === null || !playlist.isConnected) {
      return;
    }
    this.attachSemanticElement(
      cycle,
      playlist,
      PAGE_CONSTANTS.ATTACHMENT_KINDS.PLAYLIST,
      (): void => {},
      (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onPlaylistAttached(playlist) : null)
    );
  }

  private replayCommentsConnected(cycle: InstallCycle): void {
    const comments = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.COMMENTS_SECTION);
    if (comments === null || !comments.isConnected) {
      return;
    }
    this.attachSemanticElement(
      cycle,
      comments,
      PAGE_CONSTANTS.ATTACHMENT_KINDS.COMMENTS,
      (element: HTMLElement): void => {
        element.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_COMMENTS_AREA, "");
      },
      (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onCommentsAttached(comments) : null)
    );
  }

  private replayEngagementPanelsConnected(cycle: InstallCycle): void {
    const panelSelector = PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANELS_CONTAINER + " > " + PAGE_CONSTANTS.SELECTORS.ENGAGEMENT_PANEL_ITEM;
    const panels = document.querySelectorAll<HTMLElement>(panelSelector);
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      if (!panel.isConnected) {
        continue;
      }
      this.attachSemanticElement(
        cycle,
        panel,
        PAGE_CONSTANTS.ATTACHMENT_KINDS.ENGAGEMENT_PANEL,
        (element: HTMLElement): void => {
          if (!element.hasAttribute("target-id")) {
            element.setAttribute("target-id", `${PAGE_CONSTANTS.VALUES.ENGAGEMENT_TARGET_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`);
          }
          element.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_EGM_PANEL, "");
        },
        (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onEngagementPanelAttached(panel) : null)
      );
    }
  }

  private replayMetadataConnected(cycle: InstallCycle): void {
    const metadata = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
    if (metadata === null || !metadata.isConnected) {
      return;
    }
    this.attachSemanticElement(
      cycle,
      metadata,
      PAGE_CONSTANTS.ATTACHMENT_KINDS.METADATA,
      (): void => {
        InfoMirrorEngine.getInstance().syncMainDescriptionData();
      },
      (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onMetadataAttached(metadata) : null)
    );
  }

  private replayRelatedConnected(cycle: InstallCycle): void {
    const relatedList = document.querySelectorAll<HTMLElement>(
      `ytd-watch-next-secondary-results-renderer, ${PAGE_CONSTANTS.SELECTORS.RELATED_SECTION}`
    );
    for (let i = 0; i < relatedList.length; i++) {
      const related = relatedList[i];
      if (!related.isConnected || related.closest(PAGE_CONSTANTS.SELECTORS.SKELETON_CONTAINER) !== null) {
        continue;
      }
      this.notifySemantic(cycle, related, PAGE_CONSTANTS.TAGS.YTD_WATCH_NEXT_SECONDARY_RESULTS, (): void => {
        related.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_VIDEOS_LIST, "");
        cycle.hooks?.onRelatedAttached(related);
      });
    }
  }

  private replayCommentEntriesConnected(cycle: InstallCycle): void {
    const expanders = document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.COMMENT_ENTRY_EXPANDER);
    for (let i = 0; i < expanders.length; i++) {
      const expander = expanders[i];
      if (!expander.isConnected) {
        continue;
      }
      this.attachSemanticElement(
        cycle,
        expander,
        PAGE_CONSTANTS.ATTACHMENT_KINDS.COMMENT_ENTRY,
        (element: HTMLElement): void => {
          element.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_CONTENT_COMMENT_ENTRY, "");
        },
        (): IdempotentDisposer | null => (cycle.hooks !== null ? cycle.hooks.onCommentEntryAttached(expander) : null)
      );
    }
  }

  private replayExpandableDescriptionConnected(cycle: InstallCycle): void {
    const descriptions = document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER);
    for (let i = 0; i < descriptions.length; i++) {
      this.adaptExpandableDescription(cycle, descriptions[i]);
    }
  }
}
