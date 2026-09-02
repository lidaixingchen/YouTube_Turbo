import { TOOLBAR_CONSTANTS } from "./constants";
import { IconRegistry } from "../icons";
import { PopoverEngine } from "./popover";
import { SlotMountBus } from "./slot-mount-bus";
import { ActionRegistry } from "./action-registry";
import { StyleEngine } from "../../core/style-engine";
import { Locale } from "../../i18n";
import { PLAYER_CONSTANTS } from "../../features/player/constants";
import type { ActionConfig, PopoverController, SlotDefinition } from "./types";

export class ToolbarController {
  private static instance: ToolbarController | null = null;
  private isInitialized: boolean = false;
  private popoverController: PopoverController | null = null;

  private static readonly SLOT_DEFINITIONS: Record<string, SlotDefinition> = {
    [TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      containerSelector: "#player-container-outer .html5-video-player, #movie_player",
      targetSelector: ".ytp-right-controls",
      elementId: TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID,
      isApplicable: (url: URL) => !url.pathname.startsWith("/shorts"),
      mount: (target: HTMLElement, element: HTMLElement) => {
        const speedBtn = target.querySelector<HTMLElement>(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON);
        if (speedBtn) {
          speedBtn.after(element);
        } else if (!target.contains(element)) {
          target.prepend(element);
        }
      },
      unmount: () => {
        const instance = ToolbarController.getInstance();
        if (instance.popoverController) {
          instance.popoverController.destroy();
          instance.popoverController = null;
        }
        const container = document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID);
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    },
    [TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
      containerSelector: "ytd-shorts",
      targetSelector: "#navigation-button-down",
      elementId: "script_download_shorts",
      isApplicable: (url: URL) => url.pathname.startsWith("/shorts"),
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (!target.parentElement?.contains(element)) {
          target.after(element);
        }
      }
    },
    [TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
      containerSelector: "ytd-watch-metadata",
      targetSelector: "#top-level-buttons-computed, #actions-inner, #actions, #owner",
      elementId: "script_outer_box",
      isApplicable: (url: URL) => url.pathname.startsWith("/watch"),
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (target.id === "top-level-buttons-computed" || target.id === "actions-inner") {
          if (!target.contains(element)) {
            target.appendChild(element);
          }
        } else if (target.id === "owner") {
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

  public static getInstance(): ToolbarController {
    if (!this.instance) {
      this.instance = new ToolbarController();
    }
    return this.instance;
  }

  public init(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    if (this.isInitialized) {
      this.mount();
      return;
    }
    this.isInitialized = true;

    this.injectStyles();
    SlotMountBus.getInstance().bindNavigation();
    this.mount(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
    this.syncSlots();
  }

  private injectStyles(): void {
    const css = `
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

  public registerAction(action: ActionConfig): () => void {
    const unregister = ActionRegistry.register(action);
    this.syncSlots();
    return () => {
      unregister();
      this.syncSlots();
    };
  }

  public registerActions(actions: ActionConfig[]): () => void {
    const unregister = ActionRegistry.registerAll(actions);
    this.syncSlots();
    return () => {
      unregister();
      this.syncSlots();
    };
  }

  public syncSlots(): void {
    const shortsActions = ActionRegistry.getActionsBySlot(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
    if (shortsActions.length > 0) {
      this.mount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
    } else {
      this.unmount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
    }

    const metadataActions = ActionRegistry.getActionsBySlot(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
    if (metadataActions.length > 0) {
      this.mount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
    } else {
      this.unmount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
    }

    this.refreshPopoverTools();
    this.refresh();
  }

  private renderToolboxGrid(toolsGrid: HTMLElement, tooltipEl: HTMLElement): void {
    toolsGrid.innerHTML = "";
    const actions = ActionRegistry.getActionsBySlot(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
    const defaultTooltipText = "YouTube Turbo";

    actions.forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toolbox_extension_tool_btn";
      btn.id = "action_" + action.id;

      const updateBtn = (): void => {
        btn.innerHTML = "";
        const iconKey = ActionRegistry.resolveIconKey(action);
        btn.appendChild(IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.ACTION_ICON_SIZE }));
        const titleText = Locale.t(action.titleKey) || action.defaultTitle;
        btn.setAttribute("aria-label", titleText);

        const isActive = action.isActive ? action.isActive() : false;
        if (isActive) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      };

      updateBtn();

      btn.addEventListener("mouseenter", () => {
        const titleText = Locale.t(action.titleKey) || action.defaultTitle;
        tooltipEl.textContent = titleText;
      });

      btn.addEventListener("mouseleave", () => {
        tooltipEl.textContent = defaultTooltipText;
      });

      btn.addEventListener("click", (e: MouseEvent) => {
        action.onClick(e, {
          actionId: action.id,
          slot: action.slot,
          buttonElement: btn,
          refresh: updateBtn
        });

        const shouldDismiss = action.dismissOnExecute !== false;
        if (shouldDismiss) {
          this.popoverController?.close();
        }
      });

      ActionRegistry.bindActionState(action.id, updateBtn);
      toolsGrid.appendChild(btn);
    });
  }

  private refreshPopoverTools(): void {
    const toolsGrid = document.querySelector<HTMLElement>("#toolbox_extension_container .toolbox_extension_tools");
    const tooltipEl = document.querySelector<HTMLElement>("#toolbox_extension_container .toolbox_extension_tooltip");
    if (toolsGrid && tooltipEl) {
      this.renderToolboxGrid(toolsGrid, tooltipEl);
    }
  }

  private createPlayerControlsSlotElement = (): HTMLElement | null => {
    const actions = ActionRegistry.getActionsBySlot(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
    if (!actions.length) return null;

    const existingBox = document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID);
    if (existingBox && existingBox.isConnected) {
      return existingBox;
    }

    const boxContainer = document.createElement("div");
    boxContainer.id = TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID;
    boxContainer.className = "ytp-button";
    boxContainer.style.cssText = "display: flex; justify-content: center; align-items: center; cursor: pointer;";

    const iconSvg = IconRegistry.createSvg("toolbox", { size: TOOLBAR_CONSTANTS.ICON_SIZE_PX });
    boxContainer.appendChild(iconSvg);

    const existingContainer = document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID);
    if (existingContainer) existingContainer.remove();

    const toolBoxContainer = document.createElement("div");
    toolBoxContainer.id = TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID;
    toolBoxContainer.className = "toolbox_extension_container";

    const tooltipEl = document.createElement("div");
    tooltipEl.className = "toolbox_extension_tooltip";
    const defaultTooltipText = "YouTube Turbo";
    tooltipEl.textContent = defaultTooltipText;
    toolBoxContainer.appendChild(tooltipEl);

    const toolsGrid = document.createElement("div");
    toolsGrid.className = "toolbox_extension_tools";
    this.renderToolboxGrid(toolsGrid, tooltipEl);

    toolBoxContainer.appendChild(toolsGrid);

    const player = document.querySelector<HTMLElement>("#player-container-outer .html5-video-player, #movie_player");
    if (player) {
      player.appendChild(toolBoxContainer);
      if (this.popoverController) {
        this.popoverController.destroy();
      }
      this.popoverController = PopoverEngine.bind(boxContainer, toolBoxContainer, player);
    }

    return boxContainer;
  };

  private createShortsSlotElement = (): HTMLElement | null => {
    if (!window.location.pathname.startsWith("/shorts")) {
      return null;
    }
    const actions = ActionRegistry.getActionsBySlot(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
    if (!actions.length) return null;

    const existing = document.getElementById("script_download_shorts");
    if (existing && existing.isConnected) {
      return existing;
    }

    const container = document.createElement("div");
    container.id = "script_download_shorts";
    container.className = "navigation-button style-scope ytd-shorts yt-turbo-shorts-btn";

    actions.forEach((action) => {
      const iconKey = ActionRegistry.resolveIconKey(action);
      const iconSvg = IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.SHORTS_ICON_SIZE });
      container.appendChild(iconSvg);
      container.title = Locale.t(action.titleKey) || action.defaultTitle;

      container.addEventListener("click", (e: MouseEvent) => {
        action.onClick(e, {
          actionId: action.id,
          slot: action.slot,
          buttonElement: container,
          refresh: () => {
            container.innerHTML = "";
            const newIconKey = ActionRegistry.resolveIconKey(action);
            container.appendChild(IconRegistry.createSvg(newIconKey, { size: TOOLBAR_CONSTANTS.SHORTS_ICON_SIZE }));
          }
        });
      });
    });

    return container;
  };

  private createWatchMetadataSlotElement = (): HTMLElement | null => {
    const actions = ActionRegistry.getActionsBySlot(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
    if (!actions.length) return null;

    const existing = document.getElementById("script_outer_box");
    if (existing && existing.isConnected) {
      return existing;
    }

    const outerBox = document.createElement("div");
    outerBox.id = "script_outer_box";
    outerBox.className = "yt-turbo-metadata-outer";

    actions.forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "yt-turbo-metadata-btn";

      const renderContent = (): void => {
        btn.innerHTML = "";
        const iconKey = ActionRegistry.resolveIconKey(action);
        const iconEl = IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.METADATA_ICON_SIZE });
        btn.appendChild(iconEl);

        const titleText = Locale.t(action.titleKey) || action.defaultTitle;
        const labelSpan = document.createElement("span");
        labelSpan.className = "yt-turbo-metadata-label";
        labelSpan.textContent = titleText;
        btn.appendChild(labelSpan);
        btn.title = titleText;
        btn.setAttribute("aria-label", titleText);
      };

      renderContent();

      btn.addEventListener("click", (e: MouseEvent) => {
        action.onClick(e, {
          actionId: action.id,
          slot: action.slot,
          buttonElement: btn,
          refresh: renderContent
        });
      });

      outerBox.appendChild(btn);
    });

    return outerBox;
  };

  public mount(slotKey?: string): void {
    if (!slotKey || slotKey === TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS) {
      const def = ToolbarController.SLOT_DEFINITIONS[TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS];
      SlotMountBus.getInstance().mountSlot(def, this.createPlayerControlsSlotElement);
    }
    if (!slotKey || slotKey === TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS) {
      const def = ToolbarController.SLOT_DEFINITIONS[TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS];
      SlotMountBus.getInstance().mountSlot(def, this.createShortsSlotElement);
    }
    if (!slotKey || slotKey === TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA) {
      const def = ToolbarController.SLOT_DEFINITIONS[TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA];
      SlotMountBus.getInstance().mountSlot(def, this.createWatchMetadataSlotElement);
    }
  }

  public unmount(slotKey?: string): void {
    if (slotKey) {
      SlotMountBus.getInstance().unmountSlot(slotKey);
      if (slotKey === TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS && this.popoverController) {
        this.popoverController.destroy();
        this.popoverController = null;
      }
    } else {
      SlotMountBus.getInstance().destroy();
      Object.values(ToolbarController.SLOT_DEFINITIONS).forEach((def: SlotDefinition) => {
        document.getElementById(def.elementId)?.remove();
      });
      document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID)?.remove();
      if (this.popoverController) {
        this.popoverController.destroy();
        this.popoverController = null;
      }
    }
  }

  public refresh(slotKey?: string): void {
    if (slotKey) {
      SlotMountBus.getInstance().refreshSlot(slotKey);
    } else {
      SlotMountBus.getInstance().refreshAll();
    }
  }

  public destroy(): void {
    this.unmount();
    ActionRegistry.clearAllBindings();
    StyleEngine.remove(TOOLBAR_CONSTANTS.STYLE_ID);
    this.isInitialized = false;
  }
}

export const Toolbar = ToolbarController.getInstance();
