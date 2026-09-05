import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlayerController } from "../controller";
import { ShortcutDispatcher } from "../../../core/shortcuts";

describe("PlayerController Shortcuts Transaction", () => {
  beforeEach(() => {
    PlayerController.getInstance().disableSpeedControl();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    PlayerController.getInstance().disableSpeedControl();
    vi.restoreAllMocks();
  });

  it("should register all 6 shortcuts and commit active state on success", () => {
    const registerSpy = vi.spyOn(ShortcutDispatcher, "register");

    PlayerController.getInstance().enableSpeedControl();

    expect(registerSpy).toHaveBeenCalledTimes(6);
    expect(PlayerController.getInstance().isSpeedControlActive()).toBe(true);

    // 验证按键覆盖完整性：>, <, r, s, p, l
    const registeredKeys: string[] = registerSpy.mock.calls.map((call) => call[0].key);
    expect(registeredKeys).toEqual([">", "<", "r", "s", "p", "l"]);
  });

  it("should rollback previously acquired shortcuts in reverse order when registration fails", () => {
    const mockCleanups: Array<() => void> = [];
    const rollbackCalls: number[] = [];

    // 为前 3 次成功注册返回带编号的 cleanup
    let callCount: number = 0;
    vi.spyOn(ShortcutDispatcher, "register").mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        const index: number = callCount;
        const cleanup = vi.fn((): void => {
          rollbackCalls.push(index);
        });
        mockCleanups.push(cleanup);
        return cleanup;
      }
      throw new Error(`Failed registering shortcut index ${callCount}`);
    });

    expect(() => PlayerController.getInstance().enableSpeedControl()).toThrow(
      "Failed registering shortcut index 4"
    );

    // 前 3 个 disposer 应该严格逆序调用（3, 2, 1）
    expect(rollbackCalls).toEqual([3, 2, 1]);
    expect(PlayerController.getInstance().isSpeedControlActive()).toBe(false);
  });

  it("should execute all disposers during teardown even if one throws", () => {
    const cleanups: Array<() => void> = [];
    let callCount: number = 0;

    vi.spyOn(ShortcutDispatcher, "register").mockImplementation(() => {
      callCount++;
      const index: number = callCount;
      const cleanup = vi.fn((): void => {
        if (index === 2) {
          throw new Error("Teardown error at index 2");
        }
      });
      cleanups.push(cleanup);
      return cleanup;
    });

    PlayerController.getInstance().enableSpeedControl();
    expect(PlayerController.getInstance().isSpeedControlActive()).toBe(true);

    expect(() => PlayerController.getInstance().disableSpeedControl()).not.toThrow();

    // 验证所有 6 个 cleanup 均被尝试执行
    expect(cleanups).toHaveLength(6);
    cleanups.forEach((cleanup: () => void): void => {
      expect(cleanup).toHaveBeenCalledTimes(1);
    });
    expect(PlayerController.getInstance().isSpeedControlActive()).toBe(false);
  });
});
