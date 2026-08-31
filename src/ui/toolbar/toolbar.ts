import { TOOLBAR_CONSTANTS } from "./constants";
import { IconRegistry } from "../icons";
import { PopoverController } from "./popover";
import { MountAdapter } from "./mount-adapter";
import { ActionRegistry } from "./action-registry";
import { LangueUtil } from "../../i18n";
import { StorageUtil } from "../../core/storage";
import { commonUtil } from "../../core/dom-adapter";
import { Modal } from "../modal/modal";
import { Theme } from "../../features/theme";
import { PlayerController } from "../../features/player";
import { FeatureRegistry } from "../../registry/feature-registry";

export const Toolbar = (() => {
  let isInitialized = false;
  let popoverUnbind: (() => void) | null = null;

  const insertStyle = (): void => {
    const toolbarStyle = `
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
    `;
    commonUtil.addStyle(toolbarStyle);
  };

  const downloadCurrentVideo = async (): Promise<void> => {
    const language = LangueUtil.getLanguage();
    const downloadingConfirm = StorageUtil.getValue(StorageUtil.keys.youtube.downloadingConfirm, false);
    const executeDownload = (): void => {
      const url = "https://www.grabshorts.com/" + LangueUtil.getLang() + "/yt?s=40&url=" + window.location.href;
      commonUtil.openInTab(url);
    };

    if (downloadingConfirm) {
      executeDownload();
    } else {
      const confirmed = await Modal.confirm({
        title: language.content.function_setting_title,
        content: language.content.download_confirm_message,
        okText: language.content.download_enter_text,
        cancelText: language.content.download_cancel_text,
        direction: language.direction
      });
      if (confirmed) {
        StorageUtil.setValue(StorageUtil.keys.youtube.downloadingConfirm, true);
        executeDownload();
      }
    }
  };

  const createPlayerControlsSlotElement = (): HTMLElement | null => {
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
        btn.appendChild(IconRegistry.createSvg(iconKey, { size: 16 }));
        const lang = LangueUtil.getLanguage();
        btn.title = (lang.content && lang.content[action.titleKey]) || action.defaultTitle;
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
      if (popoverUnbind) popoverUnbind();
      popoverUnbind = PopoverController.bind(boxContainer, toolBoxContainer, player);
    }

    return boxContainer;
  };

  const createShortsSlotElement = (): HTMLElement | null => {
    if (window.location.href.indexOf("/shorts/") === -1) {
      return null;
    }

    const existing = document.getElementById("script_download_shorts");
    if (existing && existing.isConnected) {
      return existing;
    }

    const download = document.createElement("div");
    download.id = "script_download_shorts";
    download.className = "navigation-button style-scope ytd-shorts";
    download.setAttribute("style", "cursor: pointer; display: flex; justify-content: center; align-items: center; margin-top: 16px;");
    download.title = "下载 Shorts 视频";
    download.appendChild(IconRegistry.createSvg("shortDownload", { size: TOOLBAR_CONSTANTS.SHORTS_ICON_SIZE }));
    download.addEventListener("click", () => {
      downloadCurrentVideo();
    });
    return download;
  };

  const createWatchMetadataSlotElement = (): HTMLElement | null => {
    const outerBoxId = "script_outer_box";
    const existing = document.getElementById(outerBoxId);
    if (existing && existing.isConnected) {
      return existing;
    }

    const outerBox = document.createElement("div");
    outerBox.id = outerBoxId;
    outerBox.setAttribute("style", "margin-left: 10px; display: inline-flex; border-radius: 18px; overflow: hidden; align-items: center; justify-content: center;");

    const download = document.createElement("div");
    download.setAttribute("style", "width: 36px; height: 36px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s, transform 0.1s;");
    download.title = "下载视频";
    download.appendChild(IconRegistry.createSvg("shortDownload", { size: TOOLBAR_CONSTANTS.SHORTS_ICON_SIZE }));
    download.addEventListener("mouseenter", () => {
      download.style.opacity = "0.85";
    });
    download.addEventListener("mouseleave", () => {
      download.style.opacity = "1";
    });
    download.addEventListener("click", () => {
      downloadCurrentVideo();
    });

    outerBox.appendChild(download);
    return outerBox;
  };

  const registerDefaultActions = (): void => {
    ActionRegistry.registerAll([
      {
        id: "setting",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_setting",
        defaultTitle: "Setting",
        icon: "setting",
        order: 10,
        onClick: () => {
          FeatureRegistry.openSettingsModal();
        }
      },
      {
        id: "theme",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_switch_theme",
        defaultTitle: "Switch the theme",
        icon: "theme",
        order: 20,
        onClick: () => {
          let currentTheme = StorageUtil.getValue<string | null>(StorageUtil.keys.youtube.theme, null);
          currentTheme = (currentTheme === "light" || !currentTheme) ? "dark" : "light";
          StorageUtil.setValue(StorageUtil.keys.youtube.theme, currentTheme);
          Theme.setTheme(currentTheme, true);
        }
      },
      {
        id: "screenshot",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_screenshot",
        defaultTitle: "Screenshot",
        icon: "screenshot",
        order: 30,
        onClick: () => {
          PlayerController.captureScreenshot();
        }
      },
      {
        id: "pip",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_pip",
        defaultTitle: "Picture to picture",
        icon: "pip",
        order: 40,
        onClick: () => {
          PlayerController.togglePictureInPicture();
        }
      },
      {
        id: "loop",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_loop",
        defaultTitle: "Loop",
        icon: { normal: "loopOff", active: "loopOn" },
        order: 50,
        isActive: () => PlayerController.isLoopEnabled(),
        onClick: (_e, ctx) => {
          PlayerController.toggleLoop();
          ctx.refresh();
        },
        onStateBind: (refresh) => {
          return PlayerController.onStateChange(refresh);
        }
      },
      {
        id: "download",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "action_download",
        defaultTitle: "Download",
        icon: "download",
        order: 60,
        onClick: () => {
          downloadCurrentVideo();
        }
      }
    ]);
  };

  return {
    init(): void {
      if (!/youtube\.com/.test(window.location.host)) {
        return;
      }
      if (isInitialized) {
        this.mount();
        return;
      }
      isInitialized = true;

      registerDefaultActions();
      insertStyle();

      if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("Setting", () => {
          FeatureRegistry.openSettingsModal();
        });
      }

      commonUtil.onPageLoad(() => {
        const theme = StorageUtil.getValue<string | null>(StorageUtil.keys.youtube.theme, null);
        if (theme) {
          Theme.setTheme(theme, false);
        }
        this.mount(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
        if (FeatureRegistry.isEnabled("isOpenYoutubedownloading")) {
          this.mount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
          this.mount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
        }
      });

      document.addEventListener("yt-navigate-finish", () => {
        this.mount(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
        if (FeatureRegistry.isEnabled("isOpenYoutubedownloading")) {
          this.mount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
          this.mount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
        }
      });

      this.mount(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS);
      if (FeatureRegistry.isEnabled("isOpenYoutubedownloading")) {
        this.mount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
        this.mount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
      }
    },

    registerAction: (action: any) => ActionRegistry.register(action),
    registerActions: (actions: any[]) => ActionRegistry.registerAll(actions),

    mount(slot?: string): void {
      if (!slot || slot === TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS) {
        MountAdapter.mountSlot(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS, createPlayerControlsSlotElement);
      }
      if (!slot || slot === TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS) {
        MountAdapter.mountSlot(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS, createShortsSlotElement);
      }
      if (!slot || slot === TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA) {
        MountAdapter.mountSlot(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA, createWatchMetadataSlotElement);
      }
    },

    unmount(slot?: string): void {
      if (slot) {
        MountAdapter.unmountSlot(slot);
        if (slot === TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS) {
          document.querySelector("#yt_extension_toolbox_root")?.remove();
          document.querySelector("#toolbox_extension_container")?.remove();
          if (popoverUnbind) {
            popoverUnbind();
            popoverUnbind = null;
          }
        } else if (slot === TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS) {
          document.querySelector("#script_download_shorts")?.remove();
        } else if (slot === TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA) {
          document.querySelector("#script_outer_box")?.remove();
        }
      } else {
        MountAdapter.destroy();
        document.querySelector("#yt_extension_toolbox_root")?.remove();
        document.querySelector("#toolbox_extension_container")?.remove();
        document.querySelector("#script_download_shorts")?.remove();
        document.querySelector("#script_outer_box")?.remove();
        if (popoverUnbind) {
          popoverUnbind();
          popoverUnbind = null;
        }
      }
    },

    destroy(): void {
      this.unmount();
      ActionRegistry.clearAllBindings();
      MountAdapter.destroy();
    },

    downloadCurrentVideo,
    insertStyle
  };
})();
