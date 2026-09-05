import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Toolbar } from "../toolbar";
import { TOOLBAR_CONSTANTS } from "../constants";
import { SlotMountBus } from "../slot-mount-bus";
import { PLAYER_CONSTANTS } from "../../../features/player/constants";

describe("Toolbar Actions Integration Tests", (): void => {
  beforeEach((): void => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=integration_test"),
      writable: true,
      configurable: true
    });
    Toolbar.destroy();
    SlotMountBus.getInstance().destroy();
  });

  afterEach((): void => {
    Toolbar.destroy();
    SlotMountBus.getInstance().destroy();
    vi.restoreAllMocks();
  });

  it("should mount and unmount across player-controls, shorts, and watch-metadata slots", async (): Promise<void> => {
    // 搭建 DOM 环境
    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    playerContainer.appendChild(controls);

    const metadataContainer = document.createElement("ytd-watch-metadata");
    const actionsInner = document.createElement("div");
    actionsInner.id = "top-level-buttons-computed";
    metadataContainer.appendChild(actionsInner);

    document.body.appendChild(playerContainer);
    document.body.appendChild(metadataContainer);

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

    const metadataContainer = document.createElement("ytd-watch-metadata");
    const actionsInner = document.createElement("div");
    actionsInner.id = "top-level-buttons-computed";
    metadataContainer.appendChild(actionsInner);
    document.body.appendChild(metadataContainer);

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
