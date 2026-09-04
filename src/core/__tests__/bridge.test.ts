import { describe, it, expect, vi } from "vitest";
import { createRuntimeChannel, type RuntimeChannel } from "../bridge";

describe("RuntimeChannel", () => {
  const TEST_EVENT = "__TEST_RUNTIME_CHANNEL_EVENT__";

  it("posts and receives typed values correctly", () => {
    const received: unknown[] = [];
    const channel1: RuntimeChannel<string> = createRuntimeChannel({
      eventName: TEST_EVENT,
      receive: (val: unknown) => received.push(val),
      onHandlerError: () => {}
    });

    const channel2: RuntimeChannel<string> = createRuntimeChannel({
      eventName: TEST_EVENT,
      receive: () => {},
      onHandlerError: () => {}
    });

    channel2.post("hello-channel");
    expect(received).toEqual(["hello-channel"]);

    channel1.close();
    channel2.close();
  });

  it("isolates handler errors to onHandlerError callback", () => {
    const errorSpy = vi.fn();
    const testError = new Error("Handler exploded");

    const channel1: RuntimeChannel<string> = createRuntimeChannel({
      eventName: TEST_EVENT,
      receive: () => {
        throw testError;
      },
      onHandlerError: errorSpy
    });

    const channel2: RuntimeChannel<string> = createRuntimeChannel({
      eventName: TEST_EVENT,
      receive: () => {},
      onHandlerError: () => {}
    });

    // Posting should not throw even if receiver throws
    expect(() => channel2.post("trigger-error")).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(testError);

    channel1.close();
    channel2.close();
  });

  it("silently stops receiving and posting after close", () => {
    const received: unknown[] = [];
    const channel: RuntimeChannel<string> = createRuntimeChannel({
      eventName: TEST_EVENT,
      receive: (val: unknown) => received.push(val),
      onHandlerError: () => {}
    });

    channel.post("before-close");
    expect(received).toEqual(["before-close"]);

    channel.close();
    // Idempotent close
    channel.close();

    // Posting after close should not dispatch
    channel.post("after-close");
    expect(received).toEqual(["before-close"]);
  });
});
