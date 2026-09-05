import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Toolbar } from "../toolbar";
import { ToolbarRenderers } from "../renderers";
import { TOOLBAR_CONSTANTS } from "../constants";
import type { ActionConfig } from "../types";

describe("Toolbar Actions Lifecycle Unit Tests", (): void => {
  beforeEach((): void => {
    Object.defineProperty(window, "location", {
      value: new URL("https://www.youtube.com/watch?v=test_action"),
      writable: true,
      configurable: true
    });
    Toolbar.destroy();
  });

  afterEach((): void => {
    Toolbar.destroy();
    vi.restoreAllMocks();
  });

  it("should validate registration inputs and reject invalid parameters atomically", (): void => {
    // 1. 数组为空
    expect((): void => {
      Toolbar.registerActions([]);
    }).toThrow(/non-empty array/);

    // 2. 缺少 ID
    expect((): void => {
      Toolbar.registerAction({
        id: "",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "test",
        defaultTitle: "Test",
        icon: "test",
        onClick: (): void => {}
      });
    }).toThrow(/invalid or empty ID/);

    // 2.1 缺少合法 onClick
    expect((): void => {
      Toolbar.registerAction({
        id: "no-click-action",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "test",
        defaultTitle: "Test",
        icon: "test",
        onClick: null as unknown as () => void
      });
    }).toThrow(/must provide an onClick function/);

    // 3. 不支持的 slot
    expect((): void => {
      Toolbar.registerAction({
        id: "unsupported-slot-action",
        slot: "slot:non_existent",
        titleKey: "test",
        defaultTitle: "Test",
        icon: "test",
        onClick: (): void => {}
      });
    }).toThrow(/unsupported slot/);

    // 4. 批内重复 ID
    expect((): void => {
      Toolbar.registerActions([
        {
          id: "dup-id",
          slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
          titleKey: "test1",
          defaultTitle: "Test 1",
          icon: "test1",
          onClick: (): void => {}
        },
        {
          id: "dup-id",
          slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
          titleKey: "test2",
          defaultTitle: "Test 2",
          icon: "test2",
          onClick: (): void => {}
        }
      ]);
    }).toThrow(/Duplicate action ID "dup-id"/);

    // 5. 与已有 action 冲突
    const disposer = Toolbar.registerAction({
      id: "action-a",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "testA",
      defaultTitle: "Test A",
      icon: "testA",
      onClick: (): void => {}
    });

    expect((): void => {
      Toolbar.registerAction({
        id: "action-a",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "testA2",
        defaultTitle: "Test A2",
        icon: "testA2",
        onClick: (): void => {}
      });
    }).toThrow(/already registered/);

    disposer();

    // 6. 批量注册时局部失败触发原子回滚（验证零污染）
    expect((): void => {
      Toolbar.registerActions([
        {
          id: "valid-first-action",
          slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
          titleKey: "valid",
          defaultTitle: "Valid",
          icon: "valid",
          onClick: (): void => {}
        },
        {
          id: "",
          slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
          titleKey: "invalid",
          defaultTitle: "Invalid",
          icon: "invalid",
          onClick: (): void => {}
        }
      ]);
    }).toThrow();

    // 验证 valid-first-action 未被部分写入，可以正常重新注册
    expect((): void => {
      const rollbackDisposer = Toolbar.registerAction({
        id: "valid-first-action",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "valid",
        defaultTitle: "Valid",
        icon: "valid",
        onClick: (): void => {}
      });
      rollbackDisposer();
    }).not.toThrow();
  });

  it("should isolate disposer ownership and prevent stale disposer from deleting newer action", (): void => {
    // 注册 action-1
    const disposer1 = Toolbar.registerAction({
      id: "reusable-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "v1",
      defaultTitle: "V1",
      icon: "v1",
      onClick: (): void => {}
    });

    // 释放 action-1
    disposer1();

    // 重新注册同名 action-1 (版本 2)
    const disposer2 = Toolbar.registerAction({
      id: "reusable-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "v2",
      defaultTitle: "V2",
      icon: "v2",
      onClick: (): void => {}
    });

    // 再次调用旧的 disposer1，不应影响当前已存在的 action
    disposer1();

    // 验证重复注册同一 ID 仍会报错，证明动作依然存在
    expect((): void => {
      Toolbar.registerAction({
        id: "reusable-action",
        slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
        titleKey: "v3",
        defaultTitle: "V3",
        icon: "v3",
        onClick: (): void => {}
      });
    }).toThrow(/already registered/);

    // 调用正确的 disposer2 清理
    disposer2();

    // 此时应可成功重新注册
    const disposer3 = Toolbar.registerAction({
      id: "reusable-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "v3",
      defaultTitle: "V3",
      icon: "v3",
      onClick: (): void => {}
    });
    disposer3();
  });

  it("should batch microtask invalidation when multiple state changes occur synchronously", async (): Promise<void> => {
    let bindCallback: (() => void) | null = null;
    const bindSpy = vi.fn((notify: () => void): (() => void) => {
      bindCallback = notify;
      return (): void => {};
    });

    const disposer = Toolbar.registerAction({
      id: "batched-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "test",
      defaultTitle: "Test",
      icon: "test",
      onClick: (): void => {},
      onStateBind: bindSpy
    });

    const refreshSpy = vi.spyOn(ToolbarRenderers, "refreshToolboxGrid");

    // 初始化 Toolbar
    Toolbar.init();
    expect(bindSpy).toHaveBeenCalledTimes(1);

    // 清除初始化引发的刷新计数
    refreshSpy.mockClear();

    // 连续同步调用 5 次状态通知
    if (bindCallback) {
      const cb = bindCallback as () => void;
      cb();
      cb();
      cb();
      cb();
      cb();
    }

    // 验证同步阶段尚未触发协调刷新（微任务挂起中）
    expect(refreshSpy).toHaveBeenCalledTimes(0);

    // 等待微任务队列清空
    await Promise.resolve();

    // 真实断言：5 次连续状态通知被精确合并为单次刷新协调
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    disposer();
  });

  it("should prevent concurrent execution of async action until settled", async (): Promise<void> => {
    let resolveAction: (() => void) | null = null;
    let executeCount: number = 0;

    const actionConfig: ActionConfig = {
      id: "async-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "async",
      defaultTitle: "Async",
      icon: "async",
      onClick: (): Promise<void> => {
        executeCount++;
        return new Promise<void>((resolve): void => {
          resolveAction = resolve;
        });
      }
    };

    const disposer = Toolbar.registerAction(actionConfig);

    // 搭建宿主 DOM
    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    playerContainer.appendChild(controls);
    document.body.appendChild(playerContainer);

    Toolbar.init();

    const actionBtn = document.getElementById("action_async-action");
    expect(actionBtn).not.toBeNull();

    // 第一次点击：发起异步动作
    actionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(1);

    // 异步执行中第二次点击：互斥锁拦截
    actionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(1);

    // 完成异步操作
    if (resolveAction) {
      (resolveAction as () => void)();
    }
    // 推进 Promise 链及其 finally 微任务
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // 锁释放后获取最新按钮引用进行第三次点击：可以再次执行
    const freshBtn: HTMLElement | null = document.getElementById("action_async-action");
    freshBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(2);

    if (resolveAction) {
      (resolveAction as () => void)();
    }
    await Promise.resolve();
    await Promise.resolve();

    disposer();
    playerContainer.remove();
  });

  it("should recover automatically via safety watchdog timer if async action hangs", async (): Promise<void> => {
    vi.useFakeTimers();
    let executeCount: number = 0;

    const actionConfig: ActionConfig = {
      id: "hanging-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "hang",
      defaultTitle: "Hang",
      icon: "hang",
      onClick: (): Promise<void> => {
        executeCount++;
        // 永远不 resolve 的挂起 Promise
        return new Promise<void>((): void => {});
      }
    };

    const disposer = Toolbar.registerAction(actionConfig);

    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    playerContainer.appendChild(controls);
    document.body.appendChild(playerContainer);

    Toolbar.init();

    const actionBtn = document.getElementById("action_hanging-action");
    expect(actionBtn).not.toBeNull();

    // 第一次点击发起
    actionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(1);

    // 此时连击被拦截
    actionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(1);

    // 时间快进到看门狗超时 (5000ms)
    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.ACTION_EXECUTION_TIMEOUT_MS);

    // 看门狗强制释放互斥锁，再次点击可以执行
    actionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(2);

    vi.useRealTimers();
    disposer();
    playerContainer.remove();
  });

  it("should apply best-effort teardown and never throw unhandled exceptions during destroy", (): void => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation((): void => {});

    // 注册一个故意在注销时抛错的动作
    const disposer = Toolbar.registerAction({
      id: "faulty-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "faulty",
      defaultTitle: "Faulty",
      icon: "faulty",
      onClick: (): void => {},
      onStateBind: (): (() => void) => {
        return (): void => {
          throw new Error("Simulated unbind failure");
        };
      }
    });

    Toolbar.init();

    // 调用 disposer，不应抛出异常
    expect((): void => {
      disposer();
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalled();

    // 调用 destroy()，不应抛出任何未捕获异常
    expect((): void => {
      Toolbar.destroy();
    }).not.toThrow();

    errorSpy.mockRestore();
  });

  it("should isolate execution epochs and prevent late promise from releasing newer lock", async (): Promise<void> => {
    vi.useFakeTimers();
    let resolveFirstPromise: (() => void) | null = null;
    let executeCount: number = 0;

    const actionConfig: ActionConfig = {
      id: "epoch-test-action",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "epoch",
      defaultTitle: "Epoch",
      icon: "epoch",
      onClick: (): Promise<void> => {
        executeCount++;
        if (executeCount === 1) {
          return new Promise<void>((resolve): void => {
            resolveFirstPromise = resolve;
          });
        }
        // 第二次点击返回永久挂起的 Promise
        return new Promise<void>((): void => {});
      }
    };

    const disposer = Toolbar.registerAction(actionConfig);

    const playerContainer = document.createElement("div");
    playerContainer.id = "movie_player";
    const controls = document.createElement("div");
    controls.className = "ytp-right-controls";
    playerContainer.appendChild(controls);
    document.body.appendChild(playerContainer);

    Toolbar.init();

    const actionBtn = document.getElementById("action_epoch-test-action");
    expect(actionBtn).not.toBeNull();

    // 第一次点击
    actionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(1);

    // 5000ms 超时，看门狗强制解锁第一次执行
    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.ACTION_EXECUTION_TIMEOUT_MS);

    // 发起第二次点击，生成新的 epoch
    actionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(2);

    // 此时第一次的迟到 Promise resolve
    if (resolveFirstPromise) {
      (resolveFirstPromise as () => void)();
    }
    // 推进微任务
    await Promise.resolve();
    await Promise.resolve();

    // 核心断言：迟到的第一次 Promise resolve 绝不能误解开第二次点击的锁！
    // 再次点击必须依然被互斥锁拦截
    actionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(executeCount).toBe(2);

    vi.useRealTimers();
    disposer();
    playerContainer.remove();
  });
});
