import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Toolbar } from "../toolbar";
import { TOOLBAR_CONSTANTS } from "../constants";
import { SlotMountBus } from "../slot-mount-bus";
import { PLAYER_CONSTANTS } from "../../../features/player/constants";
import { VideoDownloadService } from "../../../features/download";
import type { ActionConfig } from "../types";

interface DownloadActionSlotScenario {
  readonly actionId: string;
  readonly slotKey: string;
  readonly route: string;
  readonly buttonIdPrefix: string;
  readonly rootId: string;
  readonly createHost: () => HTMLElement;
}

function createShortsHost(): HTMLElement {
  const shortsContainer: HTMLElement = document.createElement("ytd-shorts");
  const navDown: HTMLElement = document.createElement("div");
  navDown.id = TOOLBAR_CONSTANTS.SHORTS_TARGET_SELECTOR.replace(/^#/, "");
  shortsContainer.appendChild(navDown);
  document.body.appendChild(shortsContainer);
  return shortsContainer;
}

function createWatchMetadataHost(): HTMLElement {
  const watchPage: HTMLElement = document.createElement("ytd-watch-flexy");
  const metadataContainer: HTMLElement = document.createElement("ytd-watch-metadata");
  const actionsInner: HTMLElement = document.createElement("div");
  actionsInner.id = "top-level-buttons-computed";
  metadataContainer.appendChild(actionsInner);
  watchPage.appendChild(metadataContainer);
  document.body.appendChild(watchPage);
  return watchPage;
}

async function flushToolbarUpdates(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const DOWNLOAD_ACTION_SLOT_SCENARIOS: readonly DownloadActionSlotScenario[] = [
  {
    actionId: "shorts_download",
    slotKey: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
    route: "https://www.youtube.com/shorts/integration_test",
    buttonIdPrefix: "shorts_action_",
    rootId: TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID,
    createHost: createShortsHost
  },
  {
    actionId: "watch_download",
    slotKey: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
    route: "https://www.youtube.com/watch?v=integration_test",
    buttonIdPrefix: "metadata_action_",
    rootId: TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID,
    createHost: createWatchMetadataHost
  }
];

function createPlayerHost(): HTMLElement {
  const watchPage: HTMLElement = document.createElement("ytd-watch-flexy");
  const playerContainer: HTMLElement = document.createElement("div");
  playerContainer.id = "movie_player";
  const controls: HTMLElement = document.createElement("div");
  controls.className = "ytp-right-controls";
  playerContainer.appendChild(controls);
  watchPage.appendChild(playerContainer);
  document.body.appendChild(watchPage);
  return watchPage;
}

function dispatchKey(target: HTMLElement, key: string): KeyboardEvent {
  const event: KeyboardEvent = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(event);
  return event;
}

describe("Toolbar Actions Integration Tests", (): void => {
  beforeEach((): void => {
    VideoDownloadService.disable();
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=integration_test"),
      writable: true,
      configurable: true
    });
    Toolbar.destroy();
    SlotMountBus.getInstance().destroy();
  });

  afterEach((): void => {
    VideoDownloadService.disable();
    Toolbar.destroy();
    SlotMountBus.getInstance().destroy();
    vi.restoreAllMocks();
  });

  it("should mount and unmount across player-controls, shorts, and watch-metadata slots", async (): Promise<void> => {
    // 搭建 DOM 环境：播放器与元数据容器均位于当前路由页面容器内
    const watchPage = document.createElement("ytd-watch-flexy");
    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    playerContainer.appendChild(controls);

    const metadataContainer = document.createElement("ytd-watch-metadata");
    const actionsInner = document.createElement("div");
    actionsInner.id = "top-level-buttons-computed";
    metadataContainer.appendChild(actionsInner);

    watchPage.appendChild(playerContainer);
    watchPage.appendChild(metadataContainer);
    document.body.appendChild(watchPage);

    // 注册 2 个动作：播放器控制栏与元数据栏
    const disposer = Toolbar.registerActions([
      {
        id: "ctrl-action",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "ctrl",
        defaultTitle: "Control",
        icon: "ctrl",
        onClick: (): void => {}
      },
      {
        id: "meta-action",
        slot: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
        titleKey: "meta",
        defaultTitle: "Metadata",
        icon: "meta",
        onClick: (): void => {}
      }
    ]);

    Toolbar.init();

    // 验证对应 slot 的 DOM 已挂载
    const toolboxRoot = document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID);
    const metaRoot = document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID);
    expect(toolboxRoot).not.toBeNull();
    expect(metaRoot).not.toBeNull();

    // 注销动作后等待微任务协调完成，slot 自动卸载
    disposer();
    await Promise.resolve();
    expect(document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID)).toBeNull();
    expect(document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID)).toBeNull();

    playerContainer.remove();
    metadataContainer.remove();
  });

  it("uses native menu buttons with keyboard navigation and focus dismissal", (): void => {
    const watchPage: HTMLElement = createPlayerHost();
    const outsideButton: HTMLButtonElement = document.createElement("button");
    outsideButton.type = "button";
    document.body.appendChild(outsideButton);

    let actionExecutions: number = 0;
    const disposer: () => void = Toolbar.registerActions([
      {
        id: "keyboard-first-action",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "first",
        defaultTitle: "First",
        icon: "first",
        dismissOnExecute: false,
        onClick: (): void => {
          actionExecutions += 1;
        }
      },
      {
        id: "keyboard-disabled-action",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "disabled",
        defaultTitle: "Disabled",
        icon: "disabled",
        dismissOnExecute: false,
        onClick: (): void => {
          actionExecutions += 1;
        }
      },
      {
        id: "keyboard-last-action",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "last",
        defaultTitle: "Last",
        icon: "last",
        dismissOnExecute: false,
        onClick: (): void => {
          actionExecutions += 1;
        }
      }
    ]);

    Toolbar.init();

    const triggerElement: HTMLElement | null = document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID);
    expect(triggerElement).toBeInstanceOf(HTMLButtonElement);
    if (!(triggerElement instanceof HTMLButtonElement)) {
      throw new Error("The toolbox trigger must be a native button");
    }

    const menuElement: HTMLElement | null = document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID);
    expect(menuElement).not.toBeNull();
    if (!menuElement) {
      throw new Error("The toolbox menu must be mounted");
    }

    const actionButtons: HTMLButtonElement[] = Array.from(
      menuElement.querySelectorAll<HTMLButtonElement>(".toolbox_extension_tool_btn")
    );
    const firstButton: HTMLButtonElement | undefined = actionButtons[0];
    const disabledButton: HTMLButtonElement | undefined = actionButtons[1];
    const lastButton: HTMLButtonElement | undefined = actionButtons[2];
    if (!firstButton || !disabledButton || !lastButton) {
      throw new Error("The toolbox must contain all registered actions");
    }

    expect(triggerElement.type).toBe("button");
    expect(triggerElement.getAttribute("aria-haspopup")).toBe("menu");
    expect(triggerElement.getAttribute("aria-expanded")).toBe("false");
    expect(triggerElement.getAttribute("aria-controls")).toBe(menuElement.id);
    expect(menuElement.getAttribute("role")).toBe("menu");
    actionButtons.forEach((button: HTMLButtonElement): void => {
      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(button.type).toBe("button");
      expect(button.getAttribute("role")).toBe("menuitem");
      expect(button.tabIndex).toBe(TOOLBAR_CONSTANTS.POPOVER_MENU_ITEM_TAB_INDEX);
    });

    disabledButton.disabled = true;
    triggerElement.click();
    expect(triggerElement.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(firstButton);

    let bodyKeydownCount: number = 0;
    const bodyKeydownListener: (event: KeyboardEvent) => void = (_event: KeyboardEvent): void => {
      bodyKeydownCount += 1;
    };
    document.body.addEventListener("keydown", bodyKeydownListener);
    const downEvent: KeyboardEvent = dispatchKey(firstButton, TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_DOWN);
    expect(downEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(lastButton);
    expect(bodyKeydownCount).toBe(0);
    dispatchKey(lastButton, TOOLBAR_CONSTANTS.POPOVER_KEY_HOME);
    expect(document.activeElement).toBe(firstButton);
    dispatchKey(firstButton, TOOLBAR_CONSTANTS.POPOVER_KEY_END);
    expect(document.activeElement).toBe(lastButton);

    const enterEvent: KeyboardEvent = dispatchKey(lastButton, "Enter");
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(actionExecutions).toBe(0);
    lastButton.click();
    expect(actionExecutions).toBe(1);

    const escapeEvent: KeyboardEvent = dispatchKey(lastButton, TOOLBAR_CONSTANTS.POPOVER_KEY_ESCAPE);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(triggerElement.getAttribute("aria-expanded")).toBe("false");
    expect(menuElement.style.display).toBe("none");
    expect(document.activeElement).toBe(triggerElement);

    triggerElement.click();
    expect(document.activeElement).toBe(firstButton);
    const tabEvent: KeyboardEvent = dispatchKey(firstButton, TOOLBAR_CONSTANTS.POPOVER_KEY_TAB);
    expect(tabEvent.defaultPrevented).toBe(false);
    outsideButton.focus();
    expect(triggerElement.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outsideButton);
    expect(actionExecutions).toBe(1);

    document.body.removeEventListener("keydown", bodyKeydownListener);
    disposer();
    watchPage.remove();
    outsideButton.remove();
  });

  it("should mount and unmount shorts actions slot when on /shorts route", async (): Promise<void> => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/shorts/integration_test"),
      writable: true,
      configurable: true
    });

    const shortsContainer = document.createElement("ytd-shorts");
    const navDown = document.createElement("div");
    navDown.id = "navigation-button-down";
    shortsContainer.appendChild(navDown);
    document.body.appendChild(shortsContainer);

    const disposer = Toolbar.registerAction({
      id: "shorts-action",
      slot: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
      titleKey: "shorts",
      defaultTitle: "Shorts Action",
      icon: "shorts",
      onClick: (): void => {}
    });

    Toolbar.init();

    const shortsRoot = document.getElementById(TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID);
    expect(shortsRoot).not.toBeNull();

    disposer();
    await Promise.resolve();
    expect(document.getElementById(TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID)).toBeNull();

    shortsContainer.remove();
  });

  for (const scenario of DOWNLOAD_ACTION_SLOT_SCENARIOS) {
    it(`reconciles same-target actions for ${scenario.slotKey} using the current registration`, async (): Promise<void> => {
      Object.defineProperty(window, "location", {
        value: new URL(scenario.route),
        writable: true,
        configurable: true
      });

      const host: HTMLElement = scenario.createHost();
      const downloadSpy: ReturnType<typeof vi.spyOn> = vi
        .spyOn(VideoDownloadService, "downloadCurrentVideo")
        .mockResolvedValue(undefined);
      VideoDownloadService.enable();
      Toolbar.init();

      const mountedRoot: HTMLElement | null = document.getElementById(scenario.rootId);
      const serviceButtonElement: HTMLElement | null = document.getElementById(
        `${scenario.buttonIdPrefix}${scenario.actionId}`
      );
      expect(mountedRoot).not.toBeNull();
      expect(serviceButtonElement).toBeInstanceOf(HTMLButtonElement);
      if (!mountedRoot || !serviceButtonElement) {
        throw new Error("Expected the download action to be mounted.");
      }

      const serviceButton: HTMLButtonElement = serviceButtonElement as HTMLButtonElement;
      const initialTitle: string = serviceButton.title;
      if (scenario.slotKey === TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS) {
        expect(serviceButton.type).toBe("button");
        expect(serviceButton.tabIndex).toBe(0);
        expect(serviceButton.disabled).toBe(false);
      }

      serviceButton.focus();
      expect(document.activeElement).toBe(serviceButton);
      serviceButton.click();
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      await flushToolbarUpdates();

      let siblingExecutions: number = 0;
      const siblingId: string = `${scenario.actionId}_sibling`;
      const removeSibling: () => void = Toolbar.registerAction({
        id: siblingId,
        slot: scenario.slotKey,
        titleKey: "integration_sibling",
        defaultTitle: "Sibling action",
        icon: "sibling",
        onClick: (): void => {
          siblingExecutions += 1;
        }
      });
      await flushToolbarUpdates();

      const siblingButtonElement: HTMLElement | null = document.getElementById(
        `${scenario.buttonIdPrefix}${siblingId}`
      );
      expect(document.getElementById(scenario.rootId)).toBe(mountedRoot);
      expect(document.getElementById(`${scenario.buttonIdPrefix}${scenario.actionId}`)).toBe(serviceButton);
      expect(document.activeElement).toBe(serviceButton);
      expect(siblingButtonElement).toBeInstanceOf(HTMLButtonElement);
      if (!siblingButtonElement) {
        throw new Error("Expected the sibling action to be mounted.");
      }

      siblingButtonElement.click();
      expect(siblingExecutions).toBe(1);
      await flushToolbarUpdates();

      serviceButton.focus();
      VideoDownloadService.disable();
      let replacementExecutions: number = 0;
      const removeReplacement: () => void = Toolbar.registerAction({
        id: scenario.actionId,
        slot: scenario.slotKey,
        titleKey: "integration_updated_action",
        defaultTitle: "Updated download action",
        icon: "download",
        onClick: (): void => {
          replacementExecutions += 1;
        }
      });

      serviceButton.click();
      expect(replacementExecutions).toBe(1);
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      await flushToolbarUpdates();

      const updatedSiblingButton: HTMLElement | null = document.getElementById(
        `${scenario.buttonIdPrefix}${siblingId}`
      );
      expect(document.getElementById(scenario.rootId)).toBe(mountedRoot);
      expect(document.getElementById(`${scenario.buttonIdPrefix}${scenario.actionId}`)).toBe(serviceButton);
      expect(serviceButton.title).not.toBe(initialTitle);
      expect(updatedSiblingButton).toBeInstanceOf(HTMLButtonElement);
      expect(document.activeElement).toBe(serviceButton);

      removeSibling();
      await flushToolbarUpdates();
      expect(document.getElementById(`${scenario.buttonIdPrefix}${siblingId}`)).toBeNull();
      expect(document.getElementById(`${scenario.buttonIdPrefix}${scenario.actionId}`)).toBe(serviceButton);

      removeReplacement();
      await flushToolbarUpdates();
      expect(document.getElementById(scenario.rootId)).toBeNull();
      host.remove();
    });
  }

  it("refreshes action visibility when a route changes but reuses the metadata target", async (): Promise<void> => {
    const host: HTMLElement = createWatchMetadataHost();
    let isVisible: boolean = true;
    const removeAction: () => void = Toolbar.registerAction({
      id: "route-visibility-action",
      slot: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
      titleKey: "route_visibility",
      defaultTitle: "Route visibility",
      icon: "visibility",
      isVisible: (): boolean => isVisible,
      onClick: (): void => {}
    });

    Toolbar.init();
    expect(document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID)).not.toBeNull();

    isVisible = false;
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=route_hidden"),
      writable: true,
      configurable: true
    });
    document.dispatchEvent(new Event(TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT));
    expect(document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID)).toBeNull();

    isVisible = true;
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=route_visible"),
      writable: true,
      configurable: true
    });
    document.dispatchEvent(new Event(TOOLBAR_CONSTANTS.NAVIGATION_FINISH_EVENT));
    expect(document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID)).not.toBeNull();

    removeAction();
    await flushToolbarUpdates();
    expect(document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID)).toBeNull();
    host.remove();
  });

  it("should prevent orphan DOM creation when route changes during microtask invalidation", async (): Promise<void> => {
    let notifyCallback: (() => void) | null = null;
    const disposer = Toolbar.registerAction({
      id: "watch-only-action",
      slot: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA,
      titleKey: "meta",
      defaultTitle: "Meta",
      icon: "meta",
      onClick: (): void => {},
      onStateBind: (notify): void => {
        notifyCallback = notify;
      }
    });

    const watchPage = document.createElement("ytd-watch-flexy");
    const metadataContainer = document.createElement("ytd-watch-metadata");
    const actionsInner = document.createElement("div");
    actionsInner.id = "top-level-buttons-computed";
    metadataContainer.appendChild(actionsInner);
    watchPage.appendChild(metadataContainer);
    document.body.appendChild(watchPage);

    Toolbar.init();
    expect(document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID)).not.toBeNull();

    // 触发状态变化，微任务排队
    if (notifyCallback) {
      (notifyCallback as () => void)();
    }

    // 竞态：在微任务触发前那一刻，用户路由快速切换至 Shorts 页面
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/shorts/test_race"),
      writable: true,
      configurable: true
    });

    // 等待微任务清空执行协调流水线
    await Promise.resolve();

    // 验证：因为当前路由已变为 Shorts，元数据 slot 被路由适用性前置判定拦截并卸载，无孤儿 DOM
    expect(document.getElementById(TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID)).toBeNull();

    disposer();
    metadataContainer.remove();
    watchPage.remove();
  });

  it("should restore a slot registered on an inapplicable route after navigating to its route", async (): Promise<void> => {
    // 回归场景：Shorts 动作在 Watch 路由注册时不得被注销，导航至 Shorts 后由总线恢复
    const shortsContainer = document.createElement("ytd-shorts");
    const navDown = document.createElement("div");
    navDown.id = "navigation-button-down";
    shortsContainer.appendChild(navDown);
    document.body.appendChild(shortsContainer);

    const disposer = Toolbar.registerAction({
      id: "cross-route-shorts-action",
      slot: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS,
      titleKey: "shorts",
      defaultTitle: "Shorts Action",
      icon: "shorts",
      onClick: (): void => {}
    });

    Toolbar.init();

    expect(document.getElementById(TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID)).toBeNull();
    expect(SlotMountBus.getInstance().hasSlot(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS)).toBe(true);

    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/shorts/cross_route"),
      writable: true,
      configurable: true
    });
    document.dispatchEvent(new Event("yt-navigate-finish"));

    const shortsRoot = document.getElementById(TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID);
    expect(shortsRoot).not.toBeNull();
    expect(shortsRoot?.previousElementSibling).toBe(navDown);

    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=back_to_watch"),
      writable: true,
      configurable: true
    });
    document.dispatchEvent(new Event("yt-navigate-finish"));

    expect(document.getElementById(TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID)).toBeNull();
    expect(SlotMountBus.getInstance().hasSlot(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS)).toBe(true);

    disposer();
    shortsContainer.remove();
  });

  it("unmounts and restores the slot when action visibility toggles", async (): Promise<void> => {
    const watchPage = document.createElement("ytd-watch-flexy");
    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    playerContainer.appendChild(controls);
    watchPage.appendChild(playerContainer);
    document.body.appendChild(watchPage);

    let visible: boolean = true;
    let notifyChanged: (() => void) | null = null;
    const disposer = Toolbar.registerAction({
      id: "toggle-visibility-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "toggle",
      defaultTitle: "Toggle",
      icon: "toggle",
      onClick: (): void => {},
      isVisible: (): boolean => visible,
      onStateBind: (notify: () => void): void => {
        notifyChanged = notify;
      }
    });

    Toolbar.init();
    expect(document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID)).not.toBeNull();

    visible = false;
    if (notifyChanged) {
      (notifyChanged as () => void)();
    }
    await Promise.resolve();
    expect(document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID)).toBeNull();
    expect(SlotMountBus.getInstance().hasSlot(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS)).toBe(false);

    visible = true;
    if (notifyChanged) {
      (notifyChanged as () => void)();
    }
    await Promise.resolve();
    expect(document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID)).not.toBeNull();

    disposer();
    watchPage.remove();
  });

  it("places the toolbox root after an existing speed button inside the right controls", (): void => {
    const watchPage = document.createElement("ytd-watch-flexy");
    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    const speedButton = document.createElement("div");
    speedButton.className = "ytp-button yt-turbo-speed-btn";
    controls.appendChild(speedButton);
    playerContainer.appendChild(controls);
    watchPage.appendChild(playerContainer);
    document.body.appendChild(watchPage);

    const disposer = Toolbar.registerAction({
      id: "order-toolbox-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "order",
      defaultTitle: "Order",
      icon: "order",
      onClick: (): void => {}
    });

    Toolbar.init();

    const toolboxRoot = document.getElementById(TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID);
    expect(toolboxRoot).not.toBeNull();
    expect(toolboxRoot?.previousElementSibling).toBe(speedButton);

    disposer();
    watchPage.remove();
  });

  it("restores registered actions and subscriptions after destroy and init", async (): Promise<void> => {
    const watchPage: HTMLElement = createPlayerHost();
    const notifications: Array<() => void> = [];
    let bindingCount: number = 0;
    let cleanupCount: number = 0;
    let executionCount: number = 0;
    let visible: boolean = true;
    const config: ActionConfig = {
      id: "restored-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "action_download",
      defaultTitle: "Download",
      icon: "download",
      isVisible: (): boolean => visible,
      onClick: (): void => { executionCount++; },
      onStateBind: (notify: () => void): (() => void) => {
        bindingCount++;
        notifications.push(notify);
        return (): void => { cleanupCount++; };
      }
    };
    const dispose: () => void = Toolbar.registerAction(config);

    try {
      Toolbar.init();
      const originalButton: HTMLElement | null = document.getElementById("action_restored-action");
      expect(originalButton).not.toBeNull();
      expect(bindingCount).toBe(1);

      Toolbar.destroy();
      expect(originalButton?.isConnected).toBe(false);
      expect(cleanupCount).toBe(1);
      expect((): void => { Toolbar.registerAction(config); }).toThrow(/already registered/);

      Toolbar.init();
      const restoredButton: HTMLElement | null = document.getElementById("action_restored-action");
      expect(restoredButton).not.toBeNull();
      expect(restoredButton).not.toBe(originalButton);
      expect(bindingCount).toBe(2);
      restoredButton?.click();
      expect(executionCount).toBe(1);
      await Promise.resolve();

      visible = false;
      notifications[0]();
      await Promise.resolve();
      expect(document.getElementById("action_restored-action")).not.toBeNull();
      notifications[1]();
      await Promise.resolve();
      expect(document.getElementById("action_restored-action")).toBeNull();

      Toolbar.destroy();
      expect(cleanupCount).toBe(2);
      dispose();
      dispose();
      Toolbar.init();
      expect(document.getElementById("action_restored-action")).toBeNull();
      expect(bindingCount).toBe(2);
    } finally {
      Toolbar.destroy();
      dispose();
      watchPage.remove();
    }
  });

  it("keeps the latest visibility result when its probe fails and recovers", async (): Promise<void> => {
    const watchPage: HTMLElement = createPlayerHost();
    const notifications: Array<() => void> = [];
    let visible: boolean = false;
    let probeFails: boolean = false;
    vi.spyOn(console, "error").mockImplementation((): void => {});
    const dispose: () => void = Toolbar.registerAction({
      id: "visibility-probe-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "action_download",
      defaultTitle: "Download",
      icon: "download",
      onClick: (): void => {},
      isVisible: (): boolean => {
        if (probeFails) throw new Error("Visibility unavailable");
        return visible;
      },
      onStateBind: (notify: () => void): void => { notifications.push(notify); }
    });

    try {
      Toolbar.init();
      expect(document.getElementById("action_visibility-probe-action")).toBeNull();

      probeFails = true;
      notifications[0]();
      await Promise.resolve();
      expect(document.getElementById("action_visibility-probe-action")).toBeNull();

      probeFails = false;
      visible = true;
      notifications[0]();
      await Promise.resolve();
      expect(document.getElementById("action_visibility-probe-action")).not.toBeNull();

      probeFails = true;
      notifications[0]();
      await Promise.resolve();
      expect(document.getElementById("action_visibility-probe-action")).not.toBeNull();

      probeFails = false;
      visible = false;
      notifications[0]();
      await Promise.resolve();
      expect(document.getElementById("action_visibility-probe-action")).toBeNull();
    } finally {
      Toolbar.destroy();
      dispose();
      watchPage.remove();
    }
  });

  it("keeps the latest active class and icon when its probe fails and recovers", async (): Promise<void> => {
    const watchPage: HTMLElement = createPlayerHost();
    const notifications: Array<() => void> = [];
    let active: boolean = true;
    let probeFails: boolean = false;
    vi.spyOn(console, "error").mockImplementation((): void => {});
    const dispose: () => void = Toolbar.registerAction({
      id: "active-probe-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "action_download",
      defaultTitle: "Download",
      icon: { normal: "download", active: "theme" },
      onClick: (): void => {},
      isActive: (): boolean => {
        if (probeFails) throw new Error("Active state unavailable");
        return active;
      },
      onStateBind: (notify: () => void): void => { notifications.push(notify); }
    });

    try {
      Toolbar.init();
      const initialButton: HTMLElement | null = document.getElementById("action_active-probe-action");
      const activeIcon: string | undefined = initialButton?.innerHTML;
      expect(initialButton?.classList.contains("active")).toBe(true);

      probeFails = true;
      notifications[0]();
      await Promise.resolve();
      const retainedButton: HTMLElement | null = document.getElementById("action_active-probe-action");
      expect(retainedButton?.classList.contains("active")).toBe(true);
      expect(retainedButton?.innerHTML).toBe(activeIcon);

      probeFails = false;
      active = false;
      notifications[0]();
      await Promise.resolve();
      const inactiveButton: HTMLElement | null = document.getElementById("action_active-probe-action");
      const inactiveIcon: string | undefined = inactiveButton?.innerHTML;
      expect(inactiveButton?.classList.contains("active")).toBe(false);
      expect(inactiveIcon).not.toBe(activeIcon);

      probeFails = true;
      notifications[0]();
      await Promise.resolve();
      expect(document.getElementById("action_active-probe-action")?.innerHTML).toBe(inactiveIcon);

      probeFails = false;
      active = true;
      notifications[0]();
      await Promise.resolve();
      expect(document.getElementById("action_active-probe-action")?.classList.contains("active")).toBe(true);
    } finally {
      Toolbar.destroy();
      dispose();
      watchPage.remove();
    }
  });

  it("applies new state notifications while an earlier lifecycle refresh is queued", async (): Promise<void> => {
    const watchPage: HTMLElement = createPlayerHost();
    const notifications: Array<() => void> = [];
    let visible: boolean = true;
    const dispose: () => void = Toolbar.registerAction({
      id: "queued-lifecycle-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "action_download",
      defaultTitle: "Download",
      icon: "download",
      onClick: (): void => {},
      isVisible: (): boolean => visible,
      onStateBind: (notify: () => void): void => { notifications.push(notify); }
    });

    try {
      Toolbar.init();
      notifications[0]();
      Toolbar.destroy();
      Toolbar.init();
      expect(document.getElementById("action_queued-lifecycle-action")).not.toBeNull();
      visible = false;
      notifications[1]();
      await Promise.resolve();
      expect(document.getElementById("action_queued-lifecycle-action")).toBeNull();
    } finally {
      Toolbar.destroy();
      dispose();
      watchPage.remove();
    }
  });

  it("preserves the current execution lock when an earlier lifecycle action settles", async (): Promise<void> => {
    const watchPage: HTMLElement = createPlayerHost();
    const resolveActions: Array<() => void> = [];
    const dispose: () => void = Toolbar.registerAction({
      id: "lifecycle-execution-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "action_download",
      defaultTitle: "Download",
      icon: "download",
      onClick: (): Promise<void> => new Promise<void>((resolve: () => void): void => {
        resolveActions.push(resolve);
      })
    });

    try {
      Toolbar.init();
      document.getElementById("action_lifecycle-execution-action")?.click();
      expect(resolveActions).toHaveLength(1);
      Toolbar.destroy();
      Toolbar.init();
      document.getElementById("action_lifecycle-execution-action")?.click();
      expect(resolveActions).toHaveLength(2);

      resolveActions[0]();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      document.getElementById("action_lifecycle-execution-action")?.click();
      expect(resolveActions).toHaveLength(2);

      resolveActions[1]();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      document.getElementById("action_lifecycle-execution-action")?.click();
      expect(resolveActions).toHaveLength(3);
      resolveActions[2]();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      Toolbar.destroy();
      dispose();
      watchPage.remove();
    }
  });

  it("uses safe probe defaults for a new registration with a reused action ID", async (): Promise<void> => {
    const watchPage: HTMLElement = createPlayerHost();
    const notifications: Array<() => void> = [];
    let visible: boolean = true;
    let probeFails: boolean = false;
    vi.spyOn(console, "error").mockImplementation((): void => {});
    const config: ActionConfig = {
      id: "reused-probe-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "action_download",
      defaultTitle: "Download",
      icon: { normal: "download", active: "theme" },
      onClick: (): void => {},
      isVisible: (): boolean => {
        if (probeFails) throw new Error("Visibility unavailable");
        return visible;
      },
      isActive: (): boolean => {
        if (probeFails) throw new Error("Active state unavailable");
        return true;
      },
      onStateBind: (notify: () => void): void => { notifications.push(notify); }
    };
    const disposeOriginal: () => void = Toolbar.registerAction(config);
    let disposeReplacement: (() => void) | null = null;

    try {
      Toolbar.init();
      expect(document.getElementById("action_reused-probe-action")?.classList.contains("active")).toBe(true);
      visible = false;
      notifications[0]();
      await Promise.resolve();
      expect(document.getElementById("action_reused-probe-action")).toBeNull();
      disposeOriginal();

      probeFails = true;
      disposeReplacement = Toolbar.registerAction(config);
      await Promise.resolve();
      const replacementButton: HTMLElement | null = document.getElementById("action_reused-probe-action");
      expect(replacementButton).not.toBeNull();
      expect(replacementButton?.classList.contains("active")).toBe(false);
    } finally {
      Toolbar.destroy();
      disposeOriginal();
      disposeReplacement?.();
      watchPage.remove();
    }
  });

  it("should preserve speed slot on SlotMountBus when Toolbar is destroyed", (): void => {
    // 模拟 PlayerSpeedButtonView 向共享总线挂载倍速 slot
    const speedSlotDef = {
      slotKey: PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY,
      containerSelector: "#movie_player",
      targetSelector: ".ytp-right-controls",
      elementId: "test_speed_btn",
      mount: (target: HTMLElement, el: HTMLElement): void => {
        target.appendChild(el);
      }
    };

    const speedBtn = document.createElement("div");
    speedBtn.id = "test_speed_btn";

    SlotMountBus.getInstance().mountSlot(speedSlotDef, (): HTMLElement => speedBtn);
    expect(SlotMountBus.getInstance().hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);

    // 注册并初始化 Toolbar
    const disposer = Toolbar.registerAction({
      id: "player-test-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "test",
      defaultTitle: "Test",
      icon: "test",
      onClick: (): void => {}
    });
    Toolbar.init();

    expect(SlotMountBus.getInstance().hasSlot(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS)).toBe(true);

    // 销毁 Toolbar
    Toolbar.destroy();

    // 核心红线断言：Toolbar 销毁绝对不可干预共享总线中的倍速 slot！
    expect(SlotMountBus.getInstance().hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);
    expect(SlotMountBus.getInstance().hasSlot(TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS)).toBe(false);

    disposer();
    SlotMountBus.getInstance().unmountSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY);
  });
});
