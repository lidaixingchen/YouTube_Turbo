import type { SlotDefinition, SlotMountContext, SlotRenderer } from "./types";
import { TOOLBAR_CONSTANTS } from "./constants";
import { ReactiveDOMRegistry } from "../../core/dom-registry";

type SlotDisplayState = "inactive" | "pending" | "mounted";

interface SlotRecord {
  readonly identity: object;
  readonly definition: SlotDefinition;
  readonly renderer: SlotRenderer;
  state: SlotDisplayState;
  container: HTMLElement | null;
  target: HTMLElement | null;
  element: HTMLElement | null;
}

interface ObservationRootSpec {
  readonly node: Node;
  readonly subtree: boolean;
}

interface ObservationRootInfo {
  subtree: boolean;
  slotKeys: Set<string>;
}

export class SlotMountBus {
  private static instance: SlotMountBus | null = null;

  private readonly records = new Map<string, SlotRecord>();
  private readonly dirtySlots = new Set<string>();
  private readonly windowPausedSlots = new Set<string>();
  private readonly ownedElements = new WeakSet<HTMLElement>();
  private readonly observedRoots = new Map<Node, ObservationRootInfo>();
  private readonly nodeSequences = new WeakMap<Node, number>();
  private observationSignature: string = "";

  private activeObserver: MutationObserver | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private nextNodeSequence: number = 0;

  private isNavigationBound: boolean = false;
  private navigationHandler: (() => void) | null = null;
  private domContentLoadedHandler: (() => void) | null = null;

  private lifecycleEpoch: number = 0;
  private routeSnapshotHref: string | null = null;
  private isCoordinationScheduled: boolean = false;
  private hasWarnedMissingPageRoot: boolean = false;

  public static getInstance(): SlotMountBus {
    if (!this.instance) {
      this.instance = new SlotMountBus();
    }
    return this.instance;
  }

  public bindNavigation(): void {
    if (this.isNavigationBound || typeof document === "undefined") {
      return;
    }
    this.isNavigationBound = true;
    this.navigationHandler = (): void => {
      this.handleRouteEvent();
    };
    document.addEventListener(TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT, this.navigationHandler, false);
    document.addEventListener(TOOLBAR_CONSTANTS.PAGE_TYPE_CHANGED_EVENT, this.navigationHandler, false);
    document.addEventListener(TOOLBAR_CONSTANTS.PAGE_DATA_UPDATED_EVENT, this.navigationHandler, false);
    if (document.readyState === "loading") {
      this.domContentLoadedHandler = (): void => {
        this.domContentLoadedHandler = null;
        this.handleRouteEvent();
      };
      document.addEventListener("DOMContentLoaded", this.domContentLoadedHandler, { once: true });
    }
  }

  public mountSlot(definition: SlotDefinition, renderer: SlotRenderer): HTMLElement | null {
    this.bindNavigation();
    const slotKey: string = definition.slotKey;
    const existing: SlotRecord | undefined = this.records.get(slotKey);
    if (existing && existing.definition === definition && existing.renderer === renderer) {
      this.coordinateSlots([slotKey], null);
      return this.resolveExposedElement(slotKey);
    }
    if (existing) {
      this.releaseDisplay(existing);
      this.records.delete(slotKey);
    }
    const record: SlotRecord = {
      identity: {},
      definition,
      renderer,
      state: "inactive",
      container: null,
      target: null,
      element: null
    };
    this.records.set(slotKey, record);
    try {
      this.coordinateSlots([slotKey], slotKey);
    } catch (error: unknown) {
      if (this.records.get(slotKey) === record) {
        this.releaseDisplay(record);
        this.records.delete(slotKey);
        if (this.records.size === 0) {
          this.unbindNavigation();
          this.stopWindow();
        } else {
          this.rebuildObservation();
        }
      }
      throw error;
    }
    return this.resolveExposedElement(slotKey);
  }

  public unmountSlot(slotKey: string): void {
    this.dirtySlots.delete(slotKey);
    this.windowPausedSlots.delete(slotKey);
    const record: SlotRecord | undefined = this.records.get(slotKey);
    if (record) {
      this.releaseDisplay(record);
      this.records.delete(slotKey);
    }
    if (this.records.size === 0) {
      this.unbindNavigation();
      this.stopWindow();
    } else {
      this.rebuildObservation();
    }
  }

  public refreshSlot(slotKey: string): HTMLElement | null {
    if (!this.records.has(slotKey)) {
      return null;
    }
    this.coordinateSlots([slotKey], null);
    return this.resolveExposedElement(slotKey);
  }

  public hasSlot(slotKey: string): boolean {
    return this.records.has(slotKey);
  }

  public isSlotPending(slotKey: string): boolean {
    return this.records.get(slotKey)?.state === "pending";
  }

  public refreshAll(): void {
    this.coordinateSlots(Array.from(this.records.keys()), null);
  }

  public destroy(): void {
    this.lifecycleEpoch++;
    this.stopWindow();
    this.records.forEach((record: SlotRecord): void => {
      this.releaseDisplay(record);
    });
    this.records.clear();
    this.dirtySlots.clear();
    this.windowPausedSlots.clear();
    this.unbindNavigation();
    this.routeSnapshotHref = null;
    this.hasWarnedMissingPageRoot = false;
  }

  private resolveExposedElement(slotKey: string): HTMLElement | null {
    const record: SlotRecord | undefined = this.records.get(slotKey);
    return record && record.state === "mounted" ? record.element : null;
  }

  private coordinateSlots(keys: ReadonlyArray<string>, initialKey: string | null): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    const epoch: number = this.lifecycleEpoch;
    this.syncRouteSnapshot();
    const playerCache = new Map<HTMLElement, HTMLElement | null>();
    for (const slotKey of keys) {
      if (epoch !== this.lifecycleEpoch) {
        return;
      }
      const record: SlotRecord | undefined = this.records.get(slotKey);
      if (!record) {
        continue;
      }
      try {
        this.coordinateSingleSlot(slotKey, record, playerCache, initialKey === slotKey, epoch);
      } catch (error: unknown) {
        if (initialKey === slotKey) {
          throw error;
        }
        console.error(`[SlotMountBus] error coordinating slot "${slotKey}":`, error);
        this.windowPausedSlots.add(slotKey);
      }
    }
    if (epoch !== this.lifecycleEpoch) {
      return;
    }
    this.rebuildObservation();
  }

  private coordinateSingleSlot(
    slotKey: string,
    record: SlotRecord,
    playerCache: Map<HTMLElement, HTMLElement | null>,
    isInitial: boolean,
    epoch: number
  ): void {
    const url = new URL(window.location.href);
    if (!this.evaluateApplicable(record.definition, url)) {
      if (record.state !== "inactive") {
        this.releaseDisplay(record);
      }
      record.state = "inactive";
      this.dirtySlots.delete(slotKey);
      this.windowPausedSlots.delete(slotKey);
      return;
    }

    const container: HTMLElement | null = this.resolveContainer(record.definition, playerCache);
    const target: HTMLElement | null = container ? this.resolveTarget(container, record.definition) : null;

    if (
      record.state === "mounted" &&
      record.element &&
      record.container &&
      record.target &&
      record.container === container &&
      record.target === target &&
      record.element.isConnected &&
      container !== null &&
      container.contains(record.element)
    ) {
      return;
    }
    if (record.state === "mounted") {
      this.releaseDisplay(record);
    }
    record.state = "pending";
    record.container = container;
    record.target = target;

    if (container === null || target === null) {
      return;
    }

    const hrefAtStart: string = url.href;
    let rendered: HTMLElement | null = null;
    try {
      const context: SlotMountContext = { container, target };
      rendered = record.renderer(context);
    } catch (error: unknown) {
      if (isInitial) {
        throw error;
      }
      console.error(`[SlotMountBus] renderer failed for slot "${slotKey}":`, error);
      this.windowPausedSlots.add(slotKey);
      return;
    }
    if (!rendered) {
      return;
    }

    if (
      this.records.get(slotKey) !== record ||
      epoch !== this.lifecycleEpoch ||
      window.location.href !== hrefAtStart ||
      !container.isConnected ||
      !target.isConnected
    ) {
      return;
    }

    try {
      record.definition.mount(target, rendered);
    } catch (error: unknown) {
      this.discardAttempt(rendered);
      if (isInitial) {
        throw error;
      }
      console.error(`[SlotMountBus] mount failed for slot "${slotKey}":`, error);
      this.windowPausedSlots.add(slotKey);
      return;
    }

    if (this.records.get(slotKey) !== record || epoch !== this.lifecycleEpoch || window.location.href !== hrefAtStart) {
      this.discardAttempt(rendered);
      return;
    }
    if (!rendered.isConnected || !container.contains(rendered)) {
      this.discardAttempt(rendered);
      return;
    }

    record.element = rendered;
    this.ownedElements.add(rendered);
    record.state = "mounted";
    this.windowPausedSlots.delete(slotKey);
    this.dirtySlots.delete(slotKey);
  }

  private evaluateApplicable(definition: SlotDefinition, url: URL): boolean {
    if (!definition.isApplicable) {
      return true;
    }
    try {
      return definition.isApplicable(url);
    } catch (error: unknown) {
      console.error(`[SlotMountBus] isApplicable failed for slot "${definition.slotKey}":`, error);
      return true;
    }
  }

  private resolveContainer(
    definition: SlotDefinition,
    playerCache: Map<HTMLElement, HTMLElement | null>
  ): HTMLElement | null {
    const scope: HTMLElement | null = this.resolveRouteScope();
    if (!scope) {
      return null;
    }
    const player: HTMLElement | null = this.resolveScopedPlayer(scope, playerCache);
    if (player && player.isConnected && player.matches(definition.containerSelector)) {
      return player;
    }
    if (scope.matches(definition.containerSelector)) {
      return scope;
    }
    return scope.querySelector<HTMLElement>(definition.containerSelector);
  }

  private resolveScopedPlayer(
    scope: HTMLElement,
    playerCache: Map<HTMLElement, HTMLElement | null>
  ): HTMLElement | null {
    if (playerCache.has(scope)) {
      return playerCache.get(scope) ?? null;
    }
    const player: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer(scope);
    playerCache.set(scope, player);
    return player;
  }

  private resolveRouteScope(): HTMLElement | null {
    const pageRoot: HTMLElement | null = this.resolvePageRoot();
    if (pageRoot) {
      return pageRoot;
    }
    return this.resolveMiniplayerHost();
  }

  private resolvePageRoot(): HTMLElement | null {
    const pathname: string = window.location.pathname;
    let pageSelector: string | null = null;
    if (pathname.startsWith(TOOLBAR_CONSTANTS.SHORTS_ROUTE_PREFIX)) {
      pageSelector = TOOLBAR_CONSTANTS.SHORTS_PAGE_CONTAINER_SELECTOR;
    } else if (pathname.startsWith(TOOLBAR_CONSTANTS.WATCH_ROUTE_PREFIX)) {
      pageSelector = TOOLBAR_CONSTANTS.WATCH_PAGE_CONTAINER_SELECTOR;
    }
    if (!pageSelector) {
      return null;
    }
    const pageRoot: HTMLElement | null = document.querySelector<HTMLElement>(
      `${pageSelector}${TOOLBAR_CONSTANTS.RETAINED_PAGE_EXCLUSION}`
    );
    if (!pageRoot) {
      this.warnMissingPageRoot(pageSelector, pathname);
      return null;
    }
    this.hasWarnedMissingPageRoot = false;
    return pageRoot;
  }

  private warnMissingPageRoot(pageSelector: string, pathname: string): void {
    if (this.hasWarnedMissingPageRoot) {
      return;
    }
    this.hasWarnedMissingPageRoot = true;
    console.warn(
      `[SlotMountBus] route "${pathname}" has no connected page container matching "${pageSelector}${TOOLBAR_CONSTANTS.RETAINED_PAGE_EXCLUSION}"; slot mounting is deferred until the container appears or a route event fires`
    );
  }

  private resolveMiniplayerHost(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `${TOOLBAR_CONSTANTS.MINIPLAYER_HOST_SELECTOR}${TOOLBAR_CONSTANTS.RETAINED_PAGE_EXCLUSION}`
    );
  }

  private resolveTarget(container: HTMLElement, definition: SlotDefinition): HTMLElement | null {
    return container.querySelector<HTMLElement>(definition.targetSelector);
  }

  private releaseDisplay(record: SlotRecord): void {
    if (record.definition.unmount) {
      try {
        record.definition.unmount();
      } catch (error: unknown) {
        console.error(`[SlotMountBus] error unmounting slot "${record.definition.slotKey}":`, error);
      }
    }
    if (record.element) {
      const element: HTMLElement = record.element;
      record.element = null;
      this.ownedElements.delete(element);
      if (element.isConnected) {
        element.remove();
      }
    }
    record.container = null;
    record.target = null;
  }

  private discardAttempt(element: HTMLElement): void {
    this.ownedElements.delete(element);
    if (element.isConnected) {
      element.remove();
    }
  }

  private resolveWaitSpec(record: SlotRecord): ObservationRootSpec | null {
    if (record.container) {
      return { node: record.container, subtree: true };
    }
    const pageRoot: HTMLElement | null = this.resolvePageRoot();
    if (pageRoot) {
      return { node: pageRoot, subtree: true };
    }
    const miniplayerHost: HTMLElement | null = this.resolveMiniplayerHost();
    if (miniplayerHost) {
      return { node: miniplayerHost, subtree: true };
    }
    const pageManager: HTMLElement | null = document.getElementById(TOOLBAR_CONSTANTS.PAGE_MANAGER_ID);
    if (pageManager) {
      return { node: pageManager, subtree: false };
    }
    return null;
  }

  private rebuildObservation(): void {
    const roots = new Map<Node, ObservationRootInfo>();
    this.records.forEach((record: SlotRecord, slotKey: string): void => {
      if (record.state !== "pending" || this.windowPausedSlots.has(slotKey)) {
        return;
      }
      const spec: ObservationRootSpec | null = this.resolveWaitSpec(record);
      if (!spec) {
        return;
      }
      const existing: ObservationRootInfo | undefined = roots.get(spec.node);
      if (existing) {
        existing.subtree = existing.subtree || spec.subtree;
        existing.slotKeys.add(slotKey);
      } else {
        roots.set(spec.node, { subtree: spec.subtree, slotKeys: new Set<string>([slotKey]) });
      }
    });

    const signature: string = this.computeObservationSignature(roots);
    if (signature !== this.observationSignature) {
      const hadObserver: boolean = this.activeObserver !== null;
      if (hadObserver) {
        this.records.forEach((record: SlotRecord, slotKey: string): void => {
          if (record.state !== "pending" || this.windowPausedSlots.has(slotKey)) {
            return;
          }
          const spec: ObservationRootSpec | null = this.resolveWaitSpec(record);
          if (!spec) {
            return;
          }
          const previous: ObservationRootInfo | undefined = this.observedRoots.get(spec.node);
          if (!previous || !previous.slotKeys.has(slotKey)) {
            this.dirtySlots.add(slotKey);
          }
        });
      }
      this.disconnectObserver();
      if (roots.size > 0) {
        if (!this.activeObserver) {
          this.activeObserver = new MutationObserver(this.handleMutations);
        }
        roots.forEach((info: ObservationRootInfo, node: Node): void => {
          this.activeObserver?.observe(node, { childList: true, subtree: info.subtree });
          this.observedRoots.set(node, { subtree: info.subtree, slotKeys: new Set<string>(info.slotKeys) });
        });
        if (hadObserver) {
          this.scheduleCoordination();
        }
      }
      this.observationSignature = signature;
    } else {
      this.observedRoots.clear();
      roots.forEach((info: ObservationRootInfo, node: Node): void => {
        this.observedRoots.set(node, { subtree: info.subtree, slotKeys: new Set<string>(info.slotKeys) });
      });
    }

    if (roots.size > 0) {
      this.ensureDeadline();
    } else {
      this.stopWindow();
    }
  }

  private computeObservationSignature(roots: Map<Node, ObservationRootInfo>): string {
    if (roots.size === 0) {
      return "";
    }
    const entries: string[] = [];
    roots.forEach((info: ObservationRootInfo, node: Node): void => {
      entries.push(`${this.nodeSequence(node)}:${info.subtree ? "subtree" : "direct"}`);
    });
    return entries.sort().join("|");
  }

  private nodeSequence(node: Node): number {
    const existing: number | undefined = this.nodeSequences.get(node);
    if (existing !== undefined) {
      return existing;
    }
    this.nextNodeSequence++;
    this.nodeSequences.set(node, this.nextNodeSequence);
    return this.nextNodeSequence;
  }

  private readonly handleMutations = (mutationRecords: MutationRecord[]): void => {
    if (!this.activeObserver) {
      return;
    }
    for (const mutation of mutationRecords) {
      if (this.isSelfOwnedMutation(mutation)) {
        continue;
      }
      this.observedRoots.forEach((info: ObservationRootInfo, root: Node): void => {
        if (root === mutation.target || root.contains(mutation.target)) {
          info.slotKeys.forEach((slotKey: string): void => {
            if (!this.windowPausedSlots.has(slotKey)) {
              this.dirtySlots.add(slotKey);
            }
          });
        }
      });
    }
    if (this.dirtySlots.size > 0) {
      this.scheduleCoordination();
    }
  };

  private isSelfOwnedMutation(mutation: MutationRecord): boolean {
    const movedNodes: Node[] = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    if (movedNodes.length === 0) {
      return false;
    }
    return movedNodes.every(
      (node: Node): boolean => node instanceof HTMLElement && this.ownedElements.has(node)
    );
  }

  private scheduleCoordination(): void {
    if (this.isCoordinationScheduled) {
      return;
    }
    this.isCoordinationScheduled = true;
    const epoch: number = this.lifecycleEpoch;
    queueMicrotask((): void => {
      this.isCoordinationScheduled = false;
      if (epoch !== this.lifecycleEpoch) {
        return;
      }
      const keys: string[] = Array.from(this.dirtySlots);
      this.dirtySlots.clear();
      if (keys.length === 0) {
        return;
      }
      this.coordinateSlots(keys, null);
    });
  }

  private ensureDeadline(): void {
    if (this.deadlineTimer !== null) {
      return;
    }
    const epoch: number = this.lifecycleEpoch;
    this.deadlineTimer = setTimeout((): void => {
      this.deadlineTimer = null;
      if (epoch !== this.lifecycleEpoch) {
        return;
      }
      this.stopWindow();
    }, TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS);
  }

  private disconnectObserver(): void {
    if (this.activeObserver) {
      this.activeObserver.disconnect();
    }
    this.observedRoots.clear();
  }

  private stopWindow(): void {
    this.disconnectObserver();
    this.activeObserver = null;
    if (this.deadlineTimer !== null) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
    this.windowPausedSlots.clear();
    this.dirtySlots.clear();
    this.observationSignature = "";
  }

  private syncRouteSnapshot(): void {
    if (typeof window === "undefined") {
      return;
    }
    const href: string = window.location.href;
    if (this.routeSnapshotHref === href) {
      return;
    }
    this.routeSnapshotHref = href;
    this.dirtySlots.clear();
    this.stopWindow();
  }

  private handleRouteEvent(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    this.syncRouteSnapshot();
    this.coordinateSlots(Array.from(this.records.keys()), null);
  }

  private unbindNavigation(): void {
    if (!this.isNavigationBound || typeof document === "undefined") {
      return;
    }
    if (this.navigationHandler) {
      document.removeEventListener(TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT, this.navigationHandler, false);
      document.removeEventListener(TOOLBAR_CONSTANTS.PAGE_TYPE_CHANGED_EVENT, this.navigationHandler, false);
      document.removeEventListener(TOOLBAR_CONSTANTS.PAGE_DATA_UPDATED_EVENT, this.navigationHandler, false);
      this.navigationHandler = null;
    }
    if (this.domContentLoadedHandler) {
      document.removeEventListener("DOMContentLoaded", this.domContentLoadedHandler);
      this.domContentLoadedHandler = null;
    }
    this.isNavigationBound = false;
  }
}
