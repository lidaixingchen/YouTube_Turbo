import { TOOLBAR_CONSTANTS } from "./constants";
import { IconRegistry } from "../icons";
import { PopoverEngine } from "./popover";
import { ReactiveMounter } from "./reactive-mounter";
import { ActionRegistry } from "./action-registry";
import { StyleEngine } from "../../core/style-engine";
import { Locale } from "../../i18n";
import type { ActionConfig, SlotDefinition } from "./types";

export class ToolbarController {
  private static instance: ToolbarController | null = null;
  private isInitialized = false;
  private popoverUnbind: (() => void) | null = null;

  private static readonly SLOT_DEFINITIONS: Record<string, SlotDefinition> = {
    [TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      containerSelector: "#player-container-outer .html5-video-player, #movie_player",
      targetSelector: ".ytp-right-controls",
      elementId: "yt_extension_toolbox_root",
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (!target.contains(element)) {
          target.prepend(element);
        }
      }
    },
    [TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
      containerSelector: "ytd-shorts",
      targetSelector: "#navigation-button-down",
      elementId: "script_download_shorts",
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (!target.parentElement?.contains(element)) {
          target.after(element);
        }
      }
    },
    [TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA]: {
      slotKey: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
      containerSelector: "ytd-watch-metadata",
      targetSelector: "#owner, #actions",
      elementId: "script_outer_box",
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (target.id === "owner") {
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
    ReactiveMounter.getInstance().bindNavigation();
    this.mount(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
  }

  private injectStyles(): void {
    const css = `
      .toolbox_extension_container {
        position: absolute !important;
        background: rgba(0, 0, 0, 0.4) !important;
        color: #ffffff !important;
        border-radius: 8px !important;
        box-sizing: border-box !important;
        z-index: 999999999999 !important;
        display: none;
        padding: 13px !important;
      }
      .toolbox_extension_container .toolbox_extension_tools {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 8px !important;
      }
      .toolbox_extension_container .toolbox_extension_tool_btn {
        width: 25px !important;
        height: 25px !important;
        background: #F4F4F4 !important;
        border: none !important;
        cursor: pointer !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        border-radius: 5px !important;
        color: #000000 !important;
        transition: background 0.2s ease;
      }
      .toolbox_extension_container .toolbox_extension_tool_btn:hover {
        background: #E5E5E5 !important;
      }
      .yt-turbo-shorts-btn {
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 16px;
      }
      .yt-turbo-metadata-outer {
        margin-left: 10px;
        display: inline-flex;
        border-radius: 18px;
        overflow: hidden;
        align-items: center;
        justify-content: center;
      }
      .yt-turbo-metadata-btn {
        width: 36px;
        height: 36px;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s, transform 0.1s;
      }
      .yt-turbo-metadata-btn:hover {
        opacity: 0.85;
      }
    `;
    StyleEngine.inject(TOOLBAR_CONSTANTS.STYLE_ID, css);
  }

  public registerAction(action: ActionConfig): void {
    ActionRegistry.register(action);
    this.refresh();
  }

  public registerActions(actions: ActionConfig[]): void {
    ActionRegistry.registerAll(actions);
    this.refresh();
  }

  private createPlayerControlsSlotElement = (): HTMLElement | null => {
    const actions = ActionRegistry.getActionsBySlot(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
    if (!actions.length) return null;

    const existingBox = document.getElementById("yt_extension_toolbox_root");
    if (existingBox && existingBox.isConnected) {
      return existingBox;
    }

    const boxContainer = document.createElement("div");
    boxContainer.id = "yt_extension_toolbox_root";
    boxContainer.className = "ytp-button";
    boxContainer.style.cssText = "display: flex; justify-content: center; align-items: center; cursor: pointer;";

    const iconSvg = IconRegistry.createSvg("toolbox", { size: TOOLBAR_CONSTANTS.ICON_SIZE_PX });
    boxContainer.appendChild(iconSvg);

    const existingContainer = document.getElementById("toolbox_extension_container");
    if (existingContainer) existingContainer.remove();

    const toolBoxContainer = document.createElement("div");
    toolBoxContainer.id = "toolbox_extension_container";
    toolBoxContainer.className = "toolbox_extension_container";

    const toolsGrid = document.createElement("div");
    toolsGrid.className = "toolbox_extension_tools";

    actions.forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toolbox_extension_tool_btn";
      btn.id = "action_" + action.id;

      const updateBtn = (): void => {
        btn.innerHTML = "";
        const iconKey = ActionRegistry.resolveIconKey(action);
        btn.appendChild(IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.ACTION_ICON_SIZE }));
        btn.title = Locale.t(action.titleKey) || action.defaultTitle;
      };

      updateBtn();

      btn.addEventListener("click", (e) => {
        action.onClick(e, {
          actionId: action.id,
          slot: action.slot,
          buttonElement: btn,
          refresh: updateBtn
        });
      });

      ActionRegistry.bindActionState(action.id, updateBtn);
      toolsGrid.appendChild(btn);
    });

    toolBoxContainer.appendChild(toolsGrid);

    const player = document.querySelector<HTMLElement>("#player-container-outer .html5-video-player, #movie_player");
    if (player) {
      player.appendChild(toolBoxContainer);
      if (this.popoverUnbind) this.popoverUnbind();
      this.popoverUnbind = PopoverEngine.bind(boxContainer, toolBoxContainer, player);
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

      container.addEventListener("click", (e) => {
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
      const btn = document.createElement("div");
      btn.className = "yt-turbo-metadata-btn";
      btn.title = Locale.t(action.titleKey) || action.defaultTitle;
      const iconKey = ActionRegistry.resolveIconKey(action);
      btn.appendChild(IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.SHORTS_ICON_SIZE }));

      btn.addEventListener("click", (e) => {
        action.onClick(e, {
          actionId: action.id,
          slot: action.slot,
          buttonElement: btn,
          refresh: () => {
            btn.innerHTML = "";
            const newIconKey = ActionRegistry.resolveIconKey(action);
            btn.appendChild(IconRegistry.createSvg(newIconKey, { size: TOOLBAR_CONSTANTS.SHORTS_ICON_SIZE }));
          }
        });
      });

      outerBox.appendChild(btn);
    });

    return outerBox;
  };

  public mount(slotKey?: string): void {
    if (!slotKey || slotKey === TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS) {
      const def = ToolbarController.SLOT_DEFINITIONS[TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS];
      ReactiveMounter.getInstance().mountSlot(def, this.createPlayerControlsSlotElement);
    }
    if (!slotKey || slotKey === TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS) {
      const def = ToolbarController.SLOT_DEFINITIONS[TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS];
      ReactiveMounter.getInstance().mountSlot(def, this.createShortsSlotElement);
    }
    if (!slotKey || slotKey === TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA) {
      const def = ToolbarController.SLOT_DEFINITIONS[TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA];
      ReactiveMounter.getInstance().mountSlot(def, this.createWatchMetadataSlotElement);
    }
  }

  public unmount(slotKey?: string): void {
    if (slotKey) {
      ReactiveMounter.getInstance().unmountSlot(slotKey);
      if (slotKey === TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS && this.popoverUnbind) {
        this.popoverUnbind();
        this.popoverUnbind = null;
      }
    } else {
      ReactiveMounter.getInstance().destroy();
      document.querySelector("#yt_extension_toolbox_root")?.remove();
      document.querySelector("#toolbox_extension_container")?.remove();
      document.querySelector("#script_download_shorts")?.remove();
      document.querySelector("#script_outer_box")?.remove();
      if (this.popoverUnbind) {
        this.popoverUnbind();
        this.popoverUnbind = null;
      }
    }
  }

  public refresh(slotKey?: string): void {
    if (slotKey) {
      ReactiveMounter.getInstance().refreshSlot(slotKey);
    } else {
      ReactiveMounter.getInstance().refreshAll();
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
