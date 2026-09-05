import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlayerSpeedFeature } from "../speed-feature";
import { PlayerController } from "../controller";
import { PlayerSpeedButtonView } from "../speed-button-view";

describe("PlayerSpeedFeature", () => {
  beforeEach(() => {
    // 确保每个测试前处于干净的禁用状态
    PlayerSpeedFeature.disable();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    PlayerSpeedFeature.disable();
    vi.restoreAllMocks();
  });

  it("should enable components in Controller -> View order", () => {
    const callOrder: string[] = [];

    vi.spyOn(PlayerController.getInstance(), "enableSpeedControl").mockImplementation(() => {
      callOrder.push("controller");
    });
    vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {
      callOrder.push("view");
    });

    PlayerSpeedFeature.enable();

    expect(callOrder).toEqual(["controller", "view"]);
    expect(PlayerSpeedFeature.isActive()).toBe(true);
  });

  it("should be idempotent when enable is called multiple times", () => {
    const enableSpy = vi.spyOn(PlayerController.getInstance(), "enableSpeedControl").mockImplementation(() => {});
    const mountSpy = vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {});

    PlayerSpeedFeature.enable();
    PlayerSpeedFeature.enable();
    PlayerSpeedFeature.enable();

    expect(enableSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(PlayerSpeedFeature.isActive()).toBe(true);
  });

  it("should teardown components in View -> Controller reverse order", () => {
    const callOrder: string[] = [];

    vi.spyOn(PlayerController.getInstance(), "enableSpeedControl").mockImplementation(() => {});
    vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {});
    PlayerSpeedFeature.enable();

    vi.spyOn(PlayerSpeedButtonView, "unmount").mockImplementation(() => {
      callOrder.push("view");
    });
    vi.spyOn(PlayerController.getInstance(), "disableSpeedControl").mockImplementation(() => {
      callOrder.push("controller");
    });

    PlayerSpeedFeature.disable();

    expect(callOrder).toEqual(["view", "controller"]);
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });

  it("should be idempotent when disable is called multiple times", () => {
    const unmountSpy = vi.spyOn(PlayerSpeedButtonView, "unmount").mockImplementation(() => {});
    const disableSpy = vi.spyOn(PlayerController.getInstance(), "disableSpeedControl").mockImplementation(() => {});

    PlayerSpeedFeature.disable();
    PlayerSpeedFeature.disable();

    expect(unmountSpy).not.toHaveBeenCalled();
    expect(disableSpy).not.toHaveBeenCalled();
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });

  it("should rollback completely if view mount fails during enable", () => {
    const viewError = new Error("View mount failed");
    vi.spyOn(PlayerController.getInstance(), "enableSpeedControl").mockImplementation(() => {});
    vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {
      throw viewError;
    });

    const unmountSpy = vi.spyOn(PlayerSpeedButtonView, "unmount").mockImplementation(() => {});
    const disableSpy = vi.spyOn(PlayerController.getInstance(), "disableSpeedControl").mockImplementation(() => {});

    expect(() => PlayerSpeedFeature.enable()).toThrow(viewError);
    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(disableSpy).toHaveBeenCalledTimes(1);
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });

  it("should not call view mount if controller fails during enable", () => {
    const controllerError = new Error("Controller enable failed");
    vi.spyOn(PlayerController.getInstance(), "enableSpeedControl").mockImplementation(() => {
      throw controllerError;
    });
    const mountSpy = vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {});

    expect(() => PlayerSpeedFeature.enable()).toThrow(controllerError);
    expect(mountSpy).not.toHaveBeenCalled();
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });

  it("should isolate teardown exceptions and continue releasing other resources", () => {
    vi.spyOn(PlayerController.getInstance(), "enableSpeedControl").mockImplementation(() => {});
    vi.spyOn(PlayerSpeedButtonView, "mount").mockImplementation(() => {});
    PlayerSpeedFeature.enable();

    vi.spyOn(PlayerSpeedButtonView, "unmount").mockImplementation(() => {
      throw new Error("View unmount error");
    });
    const disableSpy = vi.spyOn(PlayerController.getInstance(), "disableSpeedControl").mockImplementation(() => {});

    expect(() => PlayerSpeedFeature.disable()).not.toThrow();
    expect(disableSpy).toHaveBeenCalledTimes(1);
    expect(PlayerSpeedFeature.isActive()).toBe(false);
  });
});
