import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PlayerSpeedFeature } from "../speed-feature";
import { SlotMountBus } from "../../../ui/toolbar/slot-mount-bus";
import { PLAYER_CONSTANTS } from "../constants";
import { TOOLBAR_CONSTANTS } from "../../../ui/toolbar/constants";
import { defaultFeatureDescriptors } from "../../../registry/descriptors";
import { PlayerSpeedButtonView } from "../speed-button-view";
import { StyleEngine } from "../../../core/style-engine";

import type { FeatureDescriptor } from "../../../types";

describe("PlayerSpeedFeature Integration", () => {
  beforeEach(() => {
    // 模拟 YouTube 域名环境
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=test"),
      writable: true,
      configurable: true
    });
    PlayerSpeedFeature.disable();
  });

  afterEach(() => {
    PlayerSpeedFeature.disable();
  });

  it("should integrate with FeatureDescriptor smoothly", async () => {
    const descriptor: FeatureDescriptor | undefined = defaultFeatureDescriptors.find(
      (d: FeatureDescriptor): boolean => d.id === "isOpenSpeedControl"
    );
    expect(descriptor).toBeDefined();

    expect(PlayerSpeedFeature.isActive()).toBe(false);

    await descriptor?.setup();
    expect(PlayerSpeedFeature.isActive()).toBe(true);
    expect(PlayerSpeedButtonView.isMounted()).toBe(true);

    await descriptor?.teardown?.();
    expect(PlayerSpeedFeature.isActive()).toBe(false);
    expect(PlayerSpeedButtonView.isMounted()).toBe(false);
  });

  it("should register slot to SlotMountBus and inject styles on enable, then unmount and clean up on disable", () => {
    PlayerSpeedFeature.enable();

    expect(PlayerSpeedButtonView.isMounted()).toBe(true);
    // 验证样式已注入
    expect(StyleEngine.has(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID)).toBe(true);

    // 验证 SlotMountBus 拥有对应 slotKey
    const bus: SlotMountBus = SlotMountBus.getInstance();
    expect(bus.hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);

    // 禁用特性
    PlayerSpeedFeature.disable();

    expect(PlayerSpeedButtonView.isMounted()).toBe(false);
    expect(bus.hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(false);

    // 验证样式已被清理
    expect(StyleEngine.has(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID)).toBe(false);
  });

  it("should maintain feature registration and active status across route changes (/watch -> /shorts -> /watch)", () => {
    const watchPage = document.createElement("ytd-watch-flexy");
    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    playerContainer.appendChild(controls);
    watchPage.appendChild(playerContainer);
    document.body.appendChild(watchPage);

    PlayerSpeedFeature.enable();
    expect(PlayerSpeedFeature.isActive()).toBe(true);
    expect(PlayerSpeedButtonView.isMounted()).toBe(true);
    expect(SlotMountBus.getInstance().hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);

    const speedBtn = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(speedBtn).not.toBeNull();
    expect(playerContainer.contains(speedBtn as HTMLElement)).toBe(true);
    expect(controls.firstElementChild).toBe(speedBtn);

    // 模拟路由切换至 /shorts (不适用倍速按钮)
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/shorts/sample_short_id"),
      writable: true,
      configurable: true
    });
    SlotMountBus.getInstance().refreshAll();

    // 特性本身依旧激活并挂载在总线上，展示已释放且注册保留
    expect(PlayerSpeedFeature.isActive()).toBe(true);
    expect(PlayerSpeedButtonView.isMounted()).toBe(true);
    expect(SlotMountBus.getInstance().hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);
    expect(document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID)).toBeNull();

    // 模拟路由切回 /watch
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=sample_watch_id"),
      writable: true,
      configurable: true
    });
    SlotMountBus.getInstance().refreshAll();

    expect(PlayerSpeedFeature.isActive()).toBe(true);
    expect(PlayerSpeedButtonView.isMounted()).toBe(true);
    expect(SlotMountBus.getInstance().hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);

    const restoredBtn = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(restoredBtn).not.toBeNull();
    expect(playerContainer.contains(restoredBtn as HTMLElement)).toBe(true);

    watchPage.remove();
  });

  it("keeps the speed button before an existing toolbox root inside the right controls", () => {
    const watchPage = document.createElement("ytd-watch-flexy");
    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    const toolboxRoot = document.createElement("div");
    toolboxRoot.id = TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID;
    controls.appendChild(toolboxRoot);
    playerContainer.appendChild(controls);
    watchPage.appendChild(playerContainer);
    document.body.appendChild(watchPage);

    PlayerSpeedFeature.enable();

    const speedBtn = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(speedBtn).not.toBeNull();
    expect(controls.firstElementChild).toBe(speedBtn);
    expect(speedBtn?.nextElementSibling).toBe(toolboxRoot);

    PlayerSpeedFeature.disable();
    watchPage.remove();
  });

  it("should ignore late mutations after disable and rebuild after re-enable", () => {
    const watchPage = document.createElement("ytd-watch-flexy");
    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    playerContainer.appendChild(controls);
    watchPage.appendChild(playerContainer);
    document.body.appendChild(watchPage);

    PlayerSpeedFeature.enable();
    expect(document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID)).not.toBeNull();

    PlayerSpeedFeature.disable();
    expect(document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID)).toBeNull();
    expect(SlotMountBus.getInstance().hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(false);

    const lateMutationNode = document.createElement("div");
    controls.appendChild(lateMutationNode);
    expect(document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID)).toBeNull();

    PlayerSpeedFeature.enable();
    const reenabledBtn = document.getElementById(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID);
    expect(reenabledBtn).not.toBeNull();
    expect(playerContainer.contains(reenabledBtn as HTMLElement)).toBe(true);

    watchPage.remove();
  });

  it("should handle repeated enable/disable cycles without leaking DOM or listeners", () => {
    for (let i: number = 0; i < 3; i++) {
      PlayerSpeedFeature.enable();
      expect(PlayerSpeedFeature.isActive()).toBe(true);
      expect(PlayerSpeedButtonView.isMounted()).toBe(true);

      PlayerSpeedFeature.disable();
      expect(PlayerSpeedFeature.isActive()).toBe(false);
      expect(PlayerSpeedButtonView.isMounted()).toBe(false);
    }
  });
});
