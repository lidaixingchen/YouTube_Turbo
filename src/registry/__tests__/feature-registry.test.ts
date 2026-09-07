import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeatureRegistry } from "../feature-registry";
import { StorageUtil } from "../../core/storage";
import type { FeatureDescriptor } from "../../types";

describe("FeatureRegistry Snapshot and Multi-Tab Sync", () => {
  beforeEach(() => {
    FeatureRegistry.invalidateCache();
    vi.restoreAllMocks();
  });

  it("should cache stored states in memory and avoid redundant StorageUtil.getValue calls", () => {
    const registry = FeatureRegistry.getInstance();
    const testFeature: FeatureDescriptor = {
      id: "featureA",
      order: 10,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: vi.fn(),
      teardown: vi.fn()
    };
    registry.register(testFeature);

    const getValueSpy = vi.spyOn(StorageUtil, "getValue").mockReturnValue({ featureA: true });

    // 第一次读取
    const state1 = registry.isEnabled("featureA");
    expect(state1).toBe(true);
    expect(getValueSpy).toHaveBeenCalledTimes(1);

    // 第二次和第三次读取走纯内存快照
    const state2 = registry.isEnabled("featureA");
    const state3 = registry.isEnabled("featureA");
    expect(state2).toBe(true);
    expect(state3).toBe(true);
    expect(getValueSpy).toHaveBeenCalledTimes(1);

    // invalidateCache 后再次读取应触发重新载入
    FeatureRegistry.invalidateCache();
    const state4 = registry.isEnabled("featureA");
    expect(state4).toBe(true);
    expect(getValueSpy).toHaveBeenCalledTimes(2);
  });

  it("should write-through to storage on setEnabled and update in-memory cache", async () => {
    const registry = FeatureRegistry.getInstance();
    const setupSpy = vi.fn();
    const teardownSpy = vi.fn();
    const testFeature: FeatureDescriptor = {
      id: "featureB",
      order: 20,
      i18nKey: "Feature B",
      defaultValue: false,
      setup: setupSpy,
      teardown: teardownSpy
    };
    registry.register(testFeature);

    const setValueSpy = vi.spyOn(StorageUtil, "setValue");
    vi.spyOn(StorageUtil, "getValue").mockReturnValue({ featureB: false });

    expect(registry.isEnabled("featureB")).toBe(false);

    await registry.setEnabled("featureB", true);
    expect(registry.isEnabled("featureB")).toBe(true);
    expect(setValueSpy).toHaveBeenCalledWith(
      StorageUtil.keys.youtube.functionState,
      expect.objectContaining({ featureB: true })
    );

    // 再次调用相同状态应直接短路返回
    setValueSpy.mockClear();
    await registry.setEnabled("featureB", true);
    expect(setValueSpy).not.toHaveBeenCalled();
  });

  it("should sync remote state changes across tabs and invoke corresponding lifecycle hooks", async () => {
    let capturedListener: ((key: string, oldVal: unknown, newVal: unknown, remote: boolean) => void) | null = null;
    vi.spyOn(StorageUtil, "addChangeListener").mockImplementation((_key, cb) => {
      capturedListener = cb;
      return 101;
    });

    const setupSpy = vi.fn();
    const teardownSpy = vi.fn();
    const testFeature: FeatureDescriptor = {
      id: "featureRemote",
      order: 30,
      i18nKey: "Feature Remote",
      defaultValue: true,
      setup: setupSpy,
      teardown: teardownSpy
    };

    const registry = FeatureRegistry.getInstance();
    registry.register(testFeature);
    vi.spyOn(StorageUtil, "getValue").mockReturnValue({ featureRemote: true });

    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      host: "www.youtube.com"
    } as Location);

    await registry.initAll();
    expect(capturedListener).not.toBeNull();
    expect(registry.isEnabled("featureRemote")).toBe(true);

    // 模拟来自其他标签页的远程关闭通知
    if (capturedListener) {
      (capturedListener as any)(
        StorageUtil.keys.youtube.functionState,
        { featureRemote: true },
        { featureRemote: false },
        true // remote
      );
    }

    // 快照应原子同步更新
    expect(registry.isEnabled("featureRemote")).toBe(false);
    expect(teardownSpy).toHaveBeenCalledTimes(1);
  });

  it("should rollback in-memory and persistent state when setup throws an exception", async () => {
    const registry = FeatureRegistry.getInstance();
    const failingFeature: FeatureDescriptor = {
      id: "featureFailing",
      order: 40,
      i18nKey: "Feature Failing",
      defaultValue: false,
      setup: vi.fn().mockRejectedValue(new Error("Setup failed")),
      teardown: vi.fn()
    };
    registry.register(failingFeature);

    const setValueSpy = vi.spyOn(StorageUtil, "setValue");
    vi.spyOn(StorageUtil, "getValue").mockReturnValue({ featureFailing: false });

    // 先初始化使 isInitialized 为 true
    await registry.initAll();

    expect(registry.isEnabled("featureFailing")).toBe(false);

    // 尝试启用但 setup 抛出异常，验证被回滚为 false
    await expect(registry.setEnabled("featureFailing", true)).rejects.toThrow("Setup failed");
    expect(registry.isEnabled("featureFailing")).toBe(false);
    expect(setValueSpy).toHaveBeenLastCalledWith(
      StorageUtil.keys.youtube.functionState,
      expect.objectContaining({ featureFailing: false })
    );
  });
});
