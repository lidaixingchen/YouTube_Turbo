import { TOOLBAR_CONSTANTS } from "./constants";
import { SHORTS_PAGE_CONTAINER_SELECTOR, SHORTS_ROUTE_PREFIX, WATCH_ROUTE_PREFIX } from "../../core/constants";
import { StyleEngine } from "../../core/style-engine";
import { PLAYER_CONSTANTS } from "../../features/player/constants";
import { SlotMountBus } from "./slot-mount-bus";
import { ToolbarRenderers, type ActionExecutor } from "./renderers";
import type { ActionConfig, ActionContext, PopoverController, SlotDefinition, SlotMountContext, SlotRenderer } from "./types";

interface ToolbarActionRecord {
  readonly owner: symbol;
  readonly sequence: number;
  readonly config: Readonly<ActionConfig>;
  stateDisposer: (() => void) | null;
  stateBindingStatus: "unbound" | "bound" | "unavailable";
  isExecuting: boolean;
  executionTimer: ReturnType<typeof setTimeout> | null;
  executionEpoch: number;
}

interface ToolbarActionRegistration {
  readonly owner: symbol;
  actionIds: readonly string[];
  readonly affectedSlots: ReadonlySet<string>;
  disposed: boolean;
}

export class ToolbarController {
  private static instance: ToolbarController | null = null;
  private isInitialized: boolean = false;
  private popoverController: PopoverController | null = null;
  private toolboxPanelHost: HTMLElement | null = null;

  private readonly actionsById: Map<string, ToolbarActionRecord> = new Map<string, ToolbarActionRecord>();
  private readonly registrationsByOwner: Map<symbol, ToolbarActionRegistration> = new Map<symbol, ToolbarActionRegistration>();
  private nextRegistrationSequence: number = 0;

  private readonly pendingSlotInvalidations: Set<string> = new Set<string>();
  private invalidationScheduled: boolean = false;
  private lifecycleGeneration: number = 0;

  private readonly slotRenderers: Record<string, SlotRenderer> = {
    [TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS]: (context: SlotMountContext): HTMLElement | null =>
      this.createPlayerControlsSlotElement(context),
    [TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS]: (context: SlotMountContext): HTMLElement | null =>
      this.createShortsSlotElement(context),
    [TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA]: (context: SlotMountContext): HTMLElement | null =>
      this.createWatchMetadataSlotElement(context)
  };

  private static readonly SUPPORTED_SLOTS: ReadonlySet<string> = new Set<string>([
    TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
    TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA
  ]);

  private static readonly SLOT_DEFINITIONS: Record<string, SlotDefinition> = {
    [TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      containerSelector: PLAYER_CONSTANTS.SELECTORS.PLAYER_CONTAINER,
      targetSelector: PLAYER_CONSTANTS.SELECTORS.RIGHT_CONTROLS,
      elementId: TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID,
      isApplicable: (url: URL): boolean => !url.pathname.startsWith(SHORTS_ROUTE_PREFIX),
      mount: (target: HTMLElement, element: HTMLElement): void => {
        const speedBtn: HTMLElement | null = target.querySelector<HTMLElement>(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON);
        if (speedBtn) {
          speedBtn.after(element);
        } else if (!target.contains(element)) {
          target.prepend(element);
        }
      },
      unmount: (): void => {
        const instance: ToolbarController = ToolbarController.getInstance();
        if (instance.popoverController) {
          try {
            instance.popoverController.destroy();
          } catch (err: unknown) {
            console.error("[ToolbarController] Error destroying popover:", err);
          }
          instance.popoverController = null;
        }
        const host: HTMLElement | null = instance.toolboxPanelHost;
        if (host && host.isConnected) {
          host.querySelector<HTMLElement>(`#${TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID}`)?.remove();
        }
        instance.toolboxPanelHost = null;
      }
    },
    [TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
      containerSelector: SHORTS_PAGE_CONTAINER_SELECTOR,
      targetSelector: TOOLBAR_CONSTANTS.SHORTS_TARGET_SELECTOR,
      elementId: TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID,
      isApplicable: (url: URL): boolean => url.pathname.startsWith(SHORTS_ROUTE_PREFIX),
      mount: (target: HTMLElement, element: HTMLElement): void => {
        if (!target.parentElement?.contains(element)) {
          target.after(element);
        }
      }
    },
    [TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
      containerSelector: TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_SELECTOR,
      targetSelector: TOOLBAR_CONSTANTS.WATCH_METADATA_TARGET_SELECTOR,
      elementId: TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID,
      isApplicable: (url: URL): boolean => url.pathname.startsWith(WATCH_ROUTE_PREFIX),
      mount: (target: HTMLElement, element: HTMLElement): void => {
        if (TOOLBAR_CONSTANTS.WATCH_METADATA_ACTION_HOST_IDS.has(target.id)) {
          if (!target.contains(element)) {
            target.appendChild(element);
          }
        } else {
          if (!target.contains(element)) {
            target.insertBefore(element, target.firstChild);
          }
        }
      }
    }
  };

  private constructor() {}

  public static getInstance(): ToolbarController {
    if (!ToolbarController.instance) {
      ToolbarController.instance = new ToolbarController();
    }
    return ToolbarController.instance;
  }

  public init(): void {
    if (typeof window === "undefined" || !/youtube\.com/.test(window.location.host)) {
      return;
    }
    if (this.isInitialized) {
      this.reconcileAllSlots();
      return;
    }

    this.isInitialized = true;
    this.lifecycleGeneration++;

    this.injectStyles();
    SlotMountBus.getInstance().bindNavigation();

    this.actionsById.forEach((record: ToolbarActionRecord): void => {
      this.bindActionState(record);
    });

    this.reconcileAllSlots();
  }

  public registerAction(action: ActionConfig): () => void {
    return this.registerActions([action]);
  }

  public registerActions(actions: readonly ActionConfig[]): () => void {
    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error("[ToolbarController] registerActions requires a non-empty array of ActionConfig.");
    }

    // 阶段一：前置验证（零副作用）
    const batchIds: Set<string> = new Set<string>();
    actions.forEach((config: ActionConfig, index: number): void => {
      if (!config || typeof config !== "object") {
        throw new Error(`[ToolbarController] Action at index ${index} is not a valid object.`);
      }
      if (!config.id || typeof config.id !== "string" || config.id.trim() === "") {
        throw new Error(`[ToolbarController] Action at index ${index} has an invalid or empty ID.`);
      }
      if (batchIds.has(config.id)) {
        throw new Error(`[ToolbarController] Duplicate action ID "${config.id}" within the same registration batch.`);
      }
      batchIds.add(config.id);

      if (!ToolbarController.SUPPORTED_SLOTS.has(config.slot)) {
        throw new Error(`[ToolbarController] Action "${config.id}" specified unsupported slot: "${config.slot}".`);
      }
      if (this.actionsById.has(config.id)) {
        throw new Error(`[ToolbarController] Action ID "${config.id}" is already registered.`);
      }
      if (typeof config.onClick !== "function") {
        throw new Error(`[ToolbarController] Action "${config.id}" must provide an onClick function.`);
      }
    });

    // 阶段二：原子提交
    const ownerToken: symbol = Symbol("action-registration");
    const actionIds: string[] = [];
    const affectedSlots: Set<string> = new Set<string>();

    actions.forEach((config: ActionConfig): void => {
      const record: ToolbarActionRecord = {
        owner: ownerToken,
        sequence: this.nextRegistrationSequence++,
        config: this.normalizeActionConfig(config),
        stateDisposer: null,
        stateBindingStatus: "unbound",
        isExecuting: false,
        executionTimer: null,
        executionEpoch: 0
      };

      this.actionsById.set(config.id, record);
      actionIds.push(config.id);
      affectedSlots.add(config.slot);

      if (this.isInitialized) {
        this.bindActionState(record);
      }
    });

    const registration: ToolbarActionRegistration = {
      owner: ownerToken,
      actionIds,
      affectedSlots,
      disposed: false
    };
    this.registrationsByOwner.set(ownerToken, registration);

    if (this.isInitialized) {
      affectedSlots.forEach((slotKey: string): void => {
        this.invalidateSlot(slotKey);
      });
    }

    return (): void => {
      this.unregisterBatch(ownerToken);
    };
  }

  private normalizeActionConfig(config: ActionConfig): Readonly<ActionConfig> {
    return Object.freeze({
      ...config,
      isVisible: this.createStateProbe(config.id, "isVisible", config.isVisible, TOOLBAR_CONSTANTS.DEFAULT_ACTION_VISIBLE),
      isActive: this.createStateProbe(config.id, "isActive", config.isActive, TOOLBAR_CONSTANTS.DEFAULT_ACTION_ACTIVE)
    });
  }

  private createStateProbe(
    actionId: string,
    name: "isVisible" | "isActive",
    probe: (() => boolean) | undefined,
    defaultValue: boolean
  ): () => boolean {
    let lastValue: boolean = defaultValue;
    return (): boolean => {
      if (typeof probe === "function") {
        try {
          lastValue = Boolean(probe());
        } catch (error: unknown) {
          console.error(`[ToolbarController] Error evaluating ${name} for action "${actionId}":`, error);
        }
      }
      return lastValue;
    };
  }

  public destroy(): void {
    this.isInitialized = false;
    this.lifecycleGeneration++;
    this.pendingSlotInvalidations.clear();
    this.invalidationScheduled = false;

    // 1. 释放所有状态订阅
    this.actionsById.forEach((record: ToolbarActionRecord): void => {
      if (record.executionTimer !== null) {
        clearTimeout(record.executionTimer);
        record.executionTimer = null;
      }
      record.isExecuting = false;
      record.executionEpoch++;

      if (record.stateDisposer) {
        try {
          record.stateDisposer();
        } catch (err: unknown) {
          console.error(`[ToolbarController] Error disposing state for action "${record.config.id}":`, err);
        }
        record.stateDisposer = null;
      }
      record.stateBindingStatus = "unbound";
    });

    // 2. 销毁 Popover
    if (this.popoverController) {
      try {
        this.popoverController.destroy();
      } catch (err: unknown) {
        console.error("[ToolbarController] Error destroying popover:", err);
      }
      this.popoverController = null;
    }

    // 3. 卸载 Toolbar 拥有的 3 个插槽
    ToolbarController.SUPPORTED_SLOTS.forEach((slotKey: string): void => {
      try {
        SlotMountBus.getInstance().unmountSlot(slotKey);
      } catch (err: unknown) {
        console.error(`[ToolbarController] Error unmounting slot "${slotKey}":`, err);
      }
    });

    // 4. 清理自身 DOM 与样式
    try {
      StyleEngine.remove(TOOLBAR_CONSTANTS.STYLE_ID);
      document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID)?.remove();
      document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID)?.remove();
      document.getElementById(TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID)?.remove();
      document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID)?.remove();
    } catch (err: unknown) {
      console.error("[ToolbarController] Error cleaning up DOM and styles:", err);
    }
    this.toolboxPanelHost = null;
  }

  private unregisterBatch(ownerToken: symbol): void {
    const registration: ToolbarActionRegistration | undefined = this.registrationsByOwner.get(ownerToken);
    if (!registration || registration.disposed) {
      return;
    }

    const errors: unknown[] = [];
    const remainingActionIds: string[] = [];

    // 逆序释放本批动作
    for (let i = registration.actionIds.length - 1; i >= 0; i--) {
      const id: string = registration.actionIds[i];
      const record: ToolbarActionRecord | undefined = this.actionsById.get(id);
      if (record && record.owner === ownerToken) {
        if (record.executionTimer !== null) {
          clearTimeout(record.executionTimer);
          record.executionTimer = null;
        }
        record.isExecuting = false;

        if (record.stateDisposer) {
          try {
            record.stateDisposer();
            record.stateDisposer = null;
            record.stateBindingStatus = "unbound";
            this.actionsById.delete(id);
          } catch (err: unknown) {
            errors.push(err);
            remainingActionIds.unshift(id);
          }
        } else {
          this.actionsById.delete(id);
        }
      }
    }

    if (this.isInitialized) {
      registration.affectedSlots.forEach((slotKey: string): void => {
        this.invalidateSlot(slotKey);
      });
    }

    if (errors.length > 0) {
      registration.actionIds = remainingActionIds;
      throw new AggregateError(errors, "[ToolbarController] Failed to cleanly unregister action batch");
    }

    registration.disposed = true;
    this.registrationsByOwner.delete(ownerToken);
  }

  private bindActionState(record: ToolbarActionRecord): void {
    if (record.stateBindingStatus === "bound" || !record.config.onStateBind) {
      return;
    }

    const currentGen: number = this.lifecycleGeneration;
    const slotKey: string = record.config.slot;
    const ownerToken: symbol = record.owner;

    const notifyChanged = (): void => {
      if (!this.isInitialized || this.lifecycleGeneration !== currentGen) {
        return;
      }
      const reg: ToolbarActionRegistration | undefined = this.registrationsByOwner.get(ownerToken);
      if (!reg || reg.disposed) {
        return;
      }
      this.invalidateSlot(slotKey);
    };

    try {
      const unbind: (() => void) | void = record.config.onStateBind(notifyChanged);
      record.stateDisposer = typeof unbind === "function" ? unbind : null;
      record.stateBindingStatus = "bound";
    } catch (err: unknown) {
      console.error(`[ToolbarController] onStateBind failed for action "${record.config.id}":`, err);
      record.stateBindingStatus = "unavailable";
      record.stateDisposer = null;
    }
  }

  private invalidateSlot(slotKey: string): void {
    if (!this.isInitialized) {
      return;
    }

    this.pendingSlotInvalidations.add(slotKey);

    if (!this.invalidationScheduled) {
      this.invalidationScheduled = true;
      const gen: number = this.lifecycleGeneration;

      queueMicrotask((): void => {
        if (!this.isInitialized || this.lifecycleGeneration !== gen) {
          return;
        }
        this.invalidationScheduled = false;

        const slotsToReconcile: string[] = Array.from(this.pendingSlotInvalidations);
        this.pendingSlotInvalidations.clear();

        slotsToReconcile.forEach((slot: string): void => {
          this.reconcileSlot(slot);
        });
      });
    }
  }

  private reconcileAllSlots(): void {
    ToolbarController.SUPPORTED_SLOTS.forEach((slotKey: string): void => {
      this.reconcileSlot(slotKey);
    });
  }

  private reconcileSlot(slotKey: string): void {
    const def: SlotDefinition | undefined = ToolbarController.SLOT_DEFINITIONS[slotKey];
    if (!def) {
      return;
    }

    try {
      const actions: ActionConfig[] = this.getVisibleActionsBySlot(slotKey);

      if (actions.length === 0) {
        SlotMountBus.getInstance().unmountSlot(slotKey);
        return;
      }

      const element: HTMLElement | null = SlotMountBus.getInstance().mountSlot(
        def,
        this.slotRenderers[slotKey]
      );

      if (element && slotKey === TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS) {
        ToolbarRenderers.refreshToolboxGrid(actions, this.executeActionWrapper, this.toolboxPanelHost);
      }
    } catch (error: unknown) {
      console.error(`[ToolbarController] Error reconciling slot "${slotKey}":`, error);
    }
  }

  private getVisibleActionsBySlot(slotKey: string): ActionConfig[] {
    const matchedRecords: ToolbarActionRecord[] = [];

    this.actionsById.forEach((record: ToolbarActionRecord): void => {
      if (record.config.slot !== slotKey) {
        return;
      }
      let visible: boolean = true;
      if (typeof record.config.isVisible === "function") {
        try {
          visible = record.config.isVisible();
        } catch (err: unknown) {
          console.error(`[ToolbarController] Error evaluating isVisible for action "${record.config.id}":`, err);
          visible = true;
        }
      }
      if (visible) {
        matchedRecords.push(record);
      }
    });

    matchedRecords.sort((a: ToolbarActionRecord, b: ToolbarActionRecord): number => {
      const orderA: number = a.config.order ?? TOOLBAR_CONSTANTS.DEFAULT_ACTION_ORDER;
      const orderB: number = b.config.order ?? TOOLBAR_CONSTANTS.DEFAULT_ACTION_ORDER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.sequence - b.sequence;
    });

    return matchedRecords.map((r: ToolbarActionRecord): ActionConfig => r.config);
  }

  private readonly executeActionWrapper: ActionExecutor = (
    action: ActionConfig,
    event: MouseEvent,
    buttonElement: HTMLElement
  ): void => {
    const record: ToolbarActionRecord | undefined = this.actionsById.get(action.id);
    if (!record) {
      return;
    }

    // 并发防重入互斥锁
    if (record.isExecuting) {
      return;
    }
    record.isExecuting = true;
    const currentEpoch: number = ++record.executionEpoch;

    const releaseLock = (epoch: number): void => {
      // 严格代际校验：仅当前执行代数匹配时才执行释放与定时器清理
      if (record.executionEpoch !== epoch) {
        return;
      }
      if (record.executionTimer !== null) {
        clearTimeout(record.executionTimer);
        record.executionTimer = null;
      }
      record.isExecuting = false;
      this.invalidateSlot(record.config.slot);
    };

    // 看门狗自愈保护
    record.executionTimer = setTimeout((): void => {
      console.warn(`[ToolbarController] Action "${action.id}" execution timed out, releasing lock.`);
      releaseLock(currentEpoch);
    }, TOOLBAR_CONSTANTS.ACTION_EXECUTION_TIMEOUT_MS);

    const context: ActionContext = {
      actionId: action.id,
      slot: action.slot,
      buttonElement
    };

    try {
      const result: void | Promise<void> = action.onClick(event, context);
      if (action.dismissOnExecute !== false) {
        this.popoverController?.close();
      }

      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>)
          .catch((err: unknown): void => {
            console.error(`[ToolbarController] Async error in action "${action.id}":`, err);
          })
          .finally((): void => {
            releaseLock(currentEpoch);
          });
      } else {
        releaseLock(currentEpoch);
      }
    } catch (error: unknown) {
      console.error(`[ToolbarController] Sync error in action "${action.id}":`, error);
      releaseLock(currentEpoch);
    }
  };

  private createPlayerControlsSlotElement(context: SlotMountContext): HTMLElement | null {
    this.toolboxPanelHost = context.container;
    const actions: ActionConfig[] = this.getVisibleActionsBySlot(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
    return ToolbarRenderers.createPlayerControlsElement(
      context,
      actions,
      this.executeActionWrapper,
      (popover: PopoverController): void => {
        if (this.popoverController) {
          try {
            this.popoverController.destroy();
          } catch (err: unknown) {
            console.error("[ToolbarController] Error replacing popover:", err);
          }
        }
        this.popoverController = popover;
      }
    );
  }

  private createShortsSlotElement(context: SlotMountContext): HTMLElement | null {
    const actions: ActionConfig[] = this.getVisibleActionsBySlot(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
    return ToolbarRenderers.createShortsElement(context, actions, this.executeActionWrapper);
  }

  private createWatchMetadataSlotElement(context: SlotMountContext): HTMLElement | null {
    const actions: ActionConfig[] = this.getVisibleActionsBySlot(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
    return ToolbarRenderers.createWatchMetadataElement(context, actions, this.executeActionWrapper);
  }

  private injectStyles(): void {
    const css: string = `
      .toolbox_extension_container {
        position: absolute !important;
        bottom: ${TOOLBAR_CONSTANTS.PANEL_BOTTOM_OFFSET_PX}px !important;
        left: 0 !important;
        background: rgba(28, 28, 28, 0.92) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
        border-radius: ${TOOLBAR_CONSTANTS.PANEL_BORDER_RADIUS_PX}px !important;
        padding: ${TOOLBAR_CONSTANTS.PANEL_PADDING_PX}px !important;
        z-index: 999999999999 !important;
        display: none;
        flex-direction: column !important;
        align-items: center !important;
        box-sizing: border-box !important;
        user-select: none !important;
        pointer-events: auto !important;
        will-change: transform, opacity !important;
        transition: opacity 0.15s ease !important;
      }
      .toolbox_extension_tooltip {
        height: 18px !important;
        line-height: 18px !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        color: rgba(255, 255, 255, 0.85) !important;
        margin-bottom: 6px !important;
        text-align: center !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 126px !important;
        opacity: 0.85 !important;
        transition: opacity 0.15s ease !important;
      }
      .toolbox_extension_tools {
        display: grid !important;
        grid-template-columns: repeat(${TOOLBAR_CONSTANTS.GRID_COLUMNS}, 1fr) !important;
        gap: ${TOOLBAR_CONSTANTS.PANEL_BUTTON_GAP_PX}px !important;
      }
      .toolbox_extension_tool_btn {
        width: ${TOOLBAR_CONSTANTS.PANEL_BUTTON_SIZE_PX}px !important;
        height: ${TOOLBAR_CONSTANTS.PANEL_BUTTON_SIZE_PX}px !important;
        background: rgba(255, 255, 255, 0.08) !important;
        border: 1px solid rgba(255, 255, 255, 0.06) !important;
        cursor: pointer !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        border-radius: ${TOOLBAR_CONSTANTS.PANEL_BUTTON_RADIUS_PX}px !important;
        color: #ffffff !important;
        transition: background 0.15s ease, transform 0.1s ease, border-color 0.15s ease, box-shadow 0.15s ease !important;
        padding: 0 !important;
        outline: none !important;
      }
      .toolbox_extension_tool_btn:hover {
        background: rgba(255, 255, 255, 0.18) !important;
        border-color: rgba(255, 255, 255, 0.2) !important;
        transform: scale(1.04) !important;
      }
      .toolbox_extension_tool_btn:active {
        transform: scale(0.96) !important;
      }
      .toolbox_extension_tool_btn.active {
        background: rgba(255, 0, 0, 0.28) !important;
        border-color: rgba(255, 0, 0, 0.55) !important;
        color: #ff4e45 !important;
        box-shadow: 0 0 8px rgba(255, 0, 0, 0.35) !important;
      }
      .yt-turbo-shorts-btn {
        cursor: pointer !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        margin-top: 16px !important;
        width: 48px !important;
        height: 48px !important;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.1) !important;
        transition: background 0.2s ease, transform 0.1s ease !important;
      }
      .yt-turbo-shorts-btn:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        transform: scale(1.05) !important;
      }
      .yt-turbo-metadata-outer {
        margin-left: 8px !important;
        display: inline-flex !important;
        align-items: center !important;
        vertical-align: middle !important;
      }
      .yt-turbo-metadata-btn {
        height: ${TOOLBAR_CONSTANTS.METADATA_BUTTON_HEIGHT_PX}px !important;
        padding: 0 ${TOOLBAR_CONSTANTS.METADATA_PADDING_HORIZONTAL_PX}px !important;
        border-radius: ${TOOLBAR_CONSTANTS.METADATA_BORDER_RADIUS_PX}px !important;
        border: none !important;
        cursor: pointer !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: ${TOOLBAR_CONSTANTS.METADATA_GAP_PX}px !important;
        background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05)) !important;
        color: var(--yt-spec-text-primary, inherit) !important;
        font-family: "Roboto", "YouTube Sans", "Arial", sans-serif !important;
        font-size: ${TOOLBAR_CONSTANTS.METADATA_FONT_SIZE_PX}px !important;
        font-weight: 500 !important;
        line-height: ${TOOLBAR_CONSTANTS.METADATA_BUTTON_HEIGHT_PX}px !important;
        white-space: nowrap !important;
        user-select: none !important;
        outline: none !important;
        transition: background 0.2s ease, transform 0.1s ease !important;
      }
      .yt-turbo-metadata-btn:hover {
        background: var(--yt-spec-button-chip-background-hover, rgba(0, 0, 0, 0.1)) !important;
        transform: scale(1.02) !important;
      }
      .yt-turbo-metadata-btn:active {
        transform: scale(0.98) !important;
      }
      .yt-turbo-metadata-label {
        font-size: ${TOOLBAR_CONSTANTS.METADATA_FONT_SIZE_PX}px !important;
        font-weight: 500 !important;
        color: inherit !important;
        line-height: normal !important;
      }
    `;
    StyleEngine.inject(TOOLBAR_CONSTANTS.STYLE_ID, css);
  }
}

export const Toolbar: ToolbarController = ToolbarController.getInstance();
