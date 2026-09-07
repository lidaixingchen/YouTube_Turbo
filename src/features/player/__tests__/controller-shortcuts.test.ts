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

  it("should recover automatically via JIT guard when bound video disconnects from DOM", () => {
    const controller = PlayerController.getInstance();

    // 模拟第一个 video 节点
    const oldVideo = document.createElement("video");
    document.body.appendChild(oldVideo);

    // 触发绑定
    controller.setSpeed(1.5, false);
    expect(oldVideo.playbackRate).toBe(1.5);
    expect(controller.getState().videoElement).toBe(oldVideo);

    // 模拟 YouTube 移除旧节点并插入新节点
    oldVideo.remove();
    const newVideo = document.createElement("video");
    document.body.appendChild(newVideo);

    // JIT 自愈：调用操作时感知旧节点已脱落，重新绑定新节点
    controller.setSpeed(1.75, false);
    expect(newVideo.playbackRate).toBe(1.75);
    expect(controller.getState().videoElement).toBe(newVideo);

    // 模拟新节点也脱离且当前 DOM 无可用视频节点，验证消除僵尸节点
    newVideo.remove();
    const stateAfterRemoval = controller.getState();
    expect(stateAfterRemoval.videoElement).toBeNull();
    expect(stateAfterRemoval.isReady).toBe(false);
  });

  it("should auto-heal and apply speed settings when receiving global play capture event", () => {
    const initialVideo = document.createElement("video");
    document.body.appendChild(initialVideo);

    const controller = PlayerController.getInstance();
    controller.init();
    controller.setSpeed(1.25, false);
    expect(initialVideo.playbackRate).toBe(1.25);

    const nextVideo = document.createElement("video");
    document.body.appendChild(nextVideo);

    // 模拟外部异步挂载后启动播放，派发原生 play 事件
    nextVideo.dispatchEvent(new Event("play", { bubbles: false }));

    expect(controller.getState().videoElement).toBe(nextVideo);
    expect(nextVideo.playbackRate).toBe(1.25);

    initialVideo.remove();
    nextVideo.remove();
    controller.destroy();
  });
});
