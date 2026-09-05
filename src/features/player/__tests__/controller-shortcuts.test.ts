import { describe, it, expect, beforeEach } from "vitest";
import { PlayerController } from "../controller";

describe("PlayerController Core State Machine", () => {
  beforeEach(() => {
    PlayerController.getInstance().resetSpeed(false);
    PlayerController.getInstance().setLoop(false, false);
  });

  it("should initialize with default playback settings", () => {
    const controller = PlayerController.getInstance();
    expect(controller.getSpeed()).toBe(1.0);
    expect(controller.isLoopEnabled()).toBe(false);
  });

  it("should correctly adjust speed within bounds", () => {
    const controller = PlayerController.getInstance();

    controller.increaseSpeed(0.25, false);
    expect(controller.getSpeed()).toBe(1.25);

    controller.decreaseSpeed(0.5, false);
    expect(controller.getSpeed()).toBe(0.75);

    controller.resetSpeed(false);
    expect(controller.getSpeed()).toBe(1.0);
  });

  it("should support toggling and explicitly setting loop state", () => {
    const controller = PlayerController.getInstance();

    controller.setLoop(true, false);
    expect(controller.isLoopEnabled()).toBe(true);

    controller.toggleLoop(undefined, false);
    expect(controller.isLoopEnabled()).toBe(false);

    // 显式静默重置
    controller.setLoop(false, false);
    expect(controller.isLoopEnabled()).toBe(false);
  });
});
