import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShortcutDispatcher } from "../../../core/shortcuts";
import { Toolbar } from "../../../ui/toolbar";
import { StorageUtil } from "../../../core/storage";
import { PlayerController } from "../controller";
import { PlayerScreenshotFeature } from "../screenshot-feature";
import { PlayerPiPFeature } from "../pip-feature";
import { PlayerLoopFeature } from "../loop-feature";
import { ReactiveDOMRegistry } from "../../../core/dom-registry";
import { createToolbarActionFeature } from "../feature-factory";

describe("Player Features Decoupling and Lifecycle", () => {
  beforeEach(() => {
    PlayerScreenshotFeature.disable();
    PlayerPiPFeature.disable();
    PlayerLoopFeature.disable();
    PlayerController.getInstance().setLoop(false, false);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    PlayerScreenshotFeature.disable();
    PlayerPiPFeature.disable();
    PlayerLoopFeature.disable();
    PlayerController.getInstance().destroy();
    vi.restoreAllMocks();
  });

  it("should independently enable and disable PlayerScreenshotFeature", () => {
    const registerShortcutSpy = vi.spyOn(ShortcutDispatcher, "register");
    const registerToolbarSpy = vi.spyOn(Toolbar, "registerActions");

    PlayerScreenshotFeature.enable();

    expect(PlayerScreenshotFeature.isActive()).toBe(true);
    expect(registerShortcutSpy).toHaveBeenCalledTimes(1);
    expect(registerShortcutSpy.mock.calls[0][0].key).toBe("s");
    expect(registerToolbarSpy).toHaveBeenCalledTimes(1);
    expect(registerToolbarSpy.mock.calls[0][0][0].id).toBe("screenshot");

    PlayerScreenshotFeature.disable();
    expect(PlayerScreenshotFeature.isActive()).toBe(false);
  });

  it("should independently enable and disable PlayerPiPFeature", () => {
    const registerShortcutSpy = vi.spyOn(ShortcutDispatcher, "register");
    const registerToolbarSpy = vi.spyOn(Toolbar, "registerActions");

    PlayerPiPFeature.enable();

    expect(PlayerPiPFeature.isActive()).toBe(true);
    expect(registerShortcutSpy).toHaveBeenCalledTimes(1);
    expect(registerShortcutSpy.mock.calls[0][0].key).toBe("p");
    expect(registerToolbarSpy).toHaveBeenCalledTimes(1);
    expect(registerToolbarSpy.mock.calls[0][0][0].id).toBe("pip");

    PlayerPiPFeature.disable();
    expect(PlayerPiPFeature.isActive()).toBe(false);
  });

  it("should independently enable and disable PlayerLoopFeature with loop state self-healing", () => {
    const registerShortcutSpy = vi.spyOn(ShortcutDispatcher, "register");
    const registerToolbarSpy = vi.spyOn(Toolbar, "registerActions");

    PlayerLoopFeature.enable();
    expect(PlayerLoopFeature.isActive()).toBe(true);
    expect(registerShortcutSpy).toHaveBeenCalledTimes(1);
    expect(registerShortcutSpy.mock.calls[0][0].key).toBe("l");
    expect(registerToolbarSpy).toHaveBeenCalledTimes(1);
    expect(registerToolbarSpy.mock.calls[0][0][0].id).toBe("loop");

    // 模拟开启循环
    PlayerController.getInstance().setLoop(true, false);
    expect(PlayerController.getInstance().isLoopEnabled()).toBe(true);

    // 禁用单曲循环特性，验证底层状态自愈重置为 false
    PlayerLoopFeature.disable();
    expect(PlayerLoopFeature.isActive()).toBe(false);
    expect(PlayerController.getInstance().isLoopEnabled()).toBe(false);
  });

  it("should trigger PlayerController methods when action onClick and shortcut handler are executed", () => {
    const shortcutSpy = vi.spyOn(ShortcutDispatcher, "register");
    const toolbarSpy = vi.spyOn(Toolbar, "registerActions");

    const captureSpy = vi.spyOn(PlayerController.getInstance(), "captureScreenshot").mockResolvedValue({
      blob: new Blob(),
      filename: "test.png"
    });
    const pipSpy = vi.spyOn(PlayerController.getInstance(), "togglePictureInPicture").mockResolvedValue(true);
    const loopSpy = vi.spyOn(PlayerController.getInstance(), "toggleLoop").mockReturnValue(true);

    // 截图执行
    PlayerScreenshotFeature.enable();
    const screenshotShortcut = shortcutSpy.mock.calls[0][0];
    const screenshotAction = toolbarSpy.mock.calls[0][0][0];
    screenshotShortcut.handler({} as KeyboardEvent);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    screenshotAction.onClick({} as MouseEvent, { actionId: "screenshot", slot: "slot", buttonElement: document.createElement("div") });
    expect(captureSpy).toHaveBeenCalledTimes(2);
    PlayerScreenshotFeature.disable();

    // 画中画执行
    shortcutSpy.mockClear();
    toolbarSpy.mockClear();
    PlayerPiPFeature.enable();
    const pipShortcut = shortcutSpy.mock.calls[0][0];
    const pipAction = toolbarSpy.mock.calls[0][0][0];
    pipShortcut.handler({} as KeyboardEvent);
    expect(pipSpy).toHaveBeenCalledTimes(1);
    pipAction.onClick({} as MouseEvent, { actionId: "pip", slot: "slot", buttonElement: document.createElement("div") });
    expect(pipSpy).toHaveBeenCalledTimes(2);
    PlayerPiPFeature.disable();

    // 循环执行
    shortcutSpy.mockClear();
    toolbarSpy.mockClear();
    PlayerLoopFeature.enable();
    const loopShortcut = shortcutSpy.mock.calls[0][0];
    const loopAction = toolbarSpy.mock.calls[0][0][0];
    loopShortcut.handler({} as KeyboardEvent);
    expect(loopSpy).toHaveBeenCalledTimes(1);
    loopAction.onClick({} as MouseEvent, { actionId: "loop", slot: "slot", buttonElement: document.createElement("div") });
    expect(loopSpy).toHaveBeenCalledTimes(2);
    PlayerLoopFeature.disable();
  });

  it("should be idempotent when createToolbarActionFeature enable/disable are called repeatedly", () => {
    const registerShortcutSpy = vi.spyOn(ShortcutDispatcher, "register");
    const registerToolbarSpy = vi.spyOn(Toolbar, "registerActions");

    PlayerScreenshotFeature.enable();
    PlayerScreenshotFeature.enable();
    PlayerScreenshotFeature.enable();

    expect(registerShortcutSpy).toHaveBeenCalledTimes(1);
    expect(registerToolbarSpy).toHaveBeenCalledTimes(1);

    PlayerScreenshotFeature.disable();
    PlayerScreenshotFeature.disable();
    PlayerScreenshotFeature.disable();

    expect(PlayerScreenshotFeature.isActive()).toBe(false);
  });

  it("should self-heal loop state on cold start when loop feature is disabled in stored state", async () => {
    vi.spyOn(ReactiveDOMRegistry.getInstance(), "waitForVideoElement").mockResolvedValue(null);

    // 模拟本地持久化存在 videoLoop: true，但 functionState 中禁用了 isOpenLoopPlayback
    StorageUtil.setValue(StorageUtil.keys.youtube.videoLoop, true);
    StorageUtil.setValue(StorageUtil.keys.youtube.functionState, {
      isOpenLoopPlayback: false
    });

    // 模拟冷启动重跑 init
    PlayerController.getInstance().destroy();
    PlayerController.getInstance().init();

    // 验证冷启动自愈：targetLoop 必须强制为 false，且 storage 已清除
    expect(PlayerController.getInstance().isLoopEnabled()).toBe(false);
    expect(StorageUtil.getValue(StorageUtil.keys.youtube.videoLoop, false)).toBe(false);

    // 清理测试数据并销毁控制器
    StorageUtil.setValue(StorageUtil.keys.youtube.functionState, {});
    PlayerController.getInstance().destroy();
  });

  it("should enforce strict LIFO teardown order (onDisable -> Toolbar -> Shortcut)", () => {
    const teardownOrder: string[] = [];
    const mockShortcutCleanup = vi.fn(() => {
      teardownOrder.push("shortcut");
    });
    const mockToolbarCleanup = vi.fn(() => {
      teardownOrder.push("toolbar");
    });

    vi.spyOn(ShortcutDispatcher, "register").mockReturnValue(mockShortcutCleanup);
    vi.spyOn(Toolbar, "registerActions").mockReturnValue(mockToolbarCleanup);

    const testFeature = createToolbarActionFeature({
      name: "TestFeature",
      shortcut: {
        key: "x",
        handler: () => {}
      },
      action: {
        id: "test-action",
        slot: "slot:player_controls",
        titleKey: "action_test",
        defaultTitle: "Test",
        icon: "test",
        onClick: () => {}
      },
      onDisable: () => {
        teardownOrder.push("onDisable");
      }
    });

    testFeature.enable();
    testFeature.disable();

    expect(teardownOrder).toEqual(["onDisable", "toolbar", "shortcut"]);
  });

  it("should rollback shortcut registration if toolbar registration fails during enable", () => {
    const rollbackCalls: string[] = [];
    const mockShortcutCleanup = vi.fn(() => {
      rollbackCalls.push("shortcut-rollback");
    });

    vi.spyOn(ShortcutDispatcher, "register").mockReturnValue(mockShortcutCleanup);
    const toolbarError = new Error("Toolbar register failed");
    vi.spyOn(Toolbar, "registerActions").mockImplementation(() => {
      throw toolbarError;
    });

    const testFeature = createToolbarActionFeature({
      name: "TestRollbackFeature",
      shortcut: {
        key: "z",
        handler: () => {}
      },
      action: {
        id: "test-rollback",
        slot: "slot:player_controls",
        titleKey: "action_test",
        defaultTitle: "Test",
        icon: "test",
        onClick: () => {}
      }
    });

    expect(() => testFeature.enable()).toThrow(toolbarError);
    expect(rollbackCalls).toEqual(["shortcut-rollback"]);
    expect(testFeature.isActive()).toBe(false);
  });

  it("should isolate teardown exceptions during composite feature disable", () => {
    const mockShortcutCleanup = vi.fn();
    const mockToolbarCleanup = vi.fn(() => {
      throw new Error("Toolbar cleanup failed");
    });

    vi.spyOn(ShortcutDispatcher, "register").mockReturnValue(mockShortcutCleanup);
    vi.spyOn(Toolbar, "registerActions").mockReturnValue(mockToolbarCleanup);

    const testFeature = createToolbarActionFeature({
      name: "TestIsolateFeature",
      shortcut: {
        key: "w",
        handler: () => {}
      },
      action: {
        id: "test-isolate",
        slot: "slot:player_controls",
        titleKey: "action_test",
        defaultTitle: "Test",
        icon: "test",
        onClick: () => {}
      },
      onDisable: () => {
        throw new Error("onDisable error");
      }
    });

    testFeature.enable();
    expect(() => testFeature.disable()).not.toThrow();
    expect(mockShortcutCleanup).toHaveBeenCalledTimes(1);
    expect(testFeature.isActive()).toBe(false);
  });
});
