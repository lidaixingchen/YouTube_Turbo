import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PlayerSpeedFeature } from "../speed-feature";
import { SlotMountBus } from "../../../ui/toolbar/slot-mount-bus";
import { PLAYER_CONSTANTS } from "../constants";
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
    PlayerSpeedFeature.enable();
    expect(PlayerSpeedFeature.isActive()).toBe(true);
    expect(PlayerSpeedButtonView.isMounted()).toBe(true);
    expect(SlotMountBus.getInstance().hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);

    // 模拟路由切换至 /shorts (不适用倍速按钮)
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/shorts/sample_short_id"),
      writable: true,
      configurable: true
    });
    SlotMountBus.getInstance().refreshAll();

    // 特性本身依旧激活并挂载在总线上，样式仍然保留
    expect(PlayerSpeedFeature.isActive()).toBe(true);
    expect(PlayerSpeedButtonView.isMounted()).toBe(true);
    expect(SlotMountBus.getInstance().hasSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY)).toBe(true);

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
