import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlayerSpeedFeature } from "../speed-feature";
import { PlayerSpeedButtonView } from "../speed-button-view";
import { ShortcutDispatcher } from "../../../core/shortcuts";

describe("PlayerSpeedFeature", () => {
  beforeEach(() => {
    PlayerSpeedFeature.disable();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    PlayerSpeedFeature.disable();
    vi.restoreAllMocks();
  });

  it("should register 3 speed shortcuts and mount view on enable", () => {
    const registerSpy = vi.spyOn(ShortcutDispatcher, "register");
    const mountSpy = vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {});

    PlayerSpeedFeature.enable();

    expect(registerSpy).toHaveBeenCalledTimes(3);
    const keys = registerSpy.mock.calls.map((call) => call[0].key);
    expect(keys).toEqual([">", "<", "r"]);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(PlayerSpeedFeature.isActive()).toBe(true);
  });

  it("should be idempotent when enable is called multiple times", () => {
    const registerSpy = vi.spyOn(ShortcutDispatcher, "register");
    const mountSpy = vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {});

    PlayerSpeedFeature.enable();
    PlayerSpeedFeature.enable();
    PlayerSpeedFeature.enable();

    expect(registerSpy).toHaveBeenCalledTimes(3);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(PlayerSpeedFeature.isActive()).toBe(true);
  });

  it("should teardown components in View -> Shortcuts reverse order (LIFO)", () => {
    const callOrder: string[] = [];
    const cleanups: Array<() => void> = [];

    vi.spyOn(ShortcutDispatcher, "register").mockImplementation(() => {
      const cleanup = vi.fn(() => {
        callOrder.push("shortcut");
      });
      cleanups.push(cleanup);
      return cleanup;
    });

    vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {});
    PlayerSpeedFeature.enable();

    vi.spyOn(PlayerSpeedButtonView, "unmount").mockImplementation(() => {
      callOrder.push("view");
    });

    PlayerSpeedFeature.disable();

    expect(callOrder[0]).toBe("view");
    expect(callOrder.slice(1)).toEqual(["shortcut", "shortcut", "shortcut"]);
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });

  it("should be idempotent when disable is called multiple times", () => {
    const unmountSpy = vi.spyOn(PlayerSpeedButtonView, "unmount").mockImplementation(() => {});

    PlayerSpeedFeature.disable();
    PlayerSpeedFeature.disable();

    expect(unmountSpy).not.toHaveBeenCalled();
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });

  it("should rollback shortcuts in reverse order if view mount fails during enable", () => {
    const rollbackCalls: number[] = [];
    let count = 0;

    vi.spyOn(ShortcutDispatcher, "register").mockImplementation(() => {
      count++;
      const id = count;
      return () => {
        rollbackCalls.push(id);
      };
    });

    const viewError = new Error("View mount failed");
    vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {
      throw viewError;
    });

    expect(() => PlayerSpeedFeature.enable()).toThrow(viewError);
    expect(rollbackCalls).toEqual([3, 2, 1]);
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });

  it("should isolate teardown exceptions and continue releasing other resources", () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();
    const cleanup3 = vi.fn();

    vi.spyOn(ShortcutDispatcher, "register")
      .mockReturnValueOnce(cleanup1)
      .mockReturnValueOnce(cleanup2)
      .mockReturnValueOnce(cleanup3);

    vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {});
    PlayerSpeedFeature.enable();

    vi.spyOn(PlayerSpeedButtonView, "unmount").mockImplementation(() => {
      throw new Error("View unmount error");
    });

    expect(() => PlayerSpeedFeature.disable()).not.toThrow();
    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(cleanup2).toHaveBeenCalledTimes(1);
    expect(cleanup3).toHaveBeenCalledTimes(1);
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });
});
