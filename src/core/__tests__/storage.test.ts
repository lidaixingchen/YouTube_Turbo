import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageUtil } from "../storage";

describe("StorageUtil GM Wrapper and Fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return default value when GM_getValue is undefined", () => {
    const val = StorageUtil.getValue("test-key", 42);
    expect(val).toBe(42);
  });

  it("should safely no-op when GM_setValue and GM_deleteValue are undefined", () => {
    expect(() => StorageUtil.setValue("test-key", "abc")).not.toThrow();
    expect(() => StorageUtil.deleteValue("test-key")).not.toThrow();
  });

  it("should delegate to GM_addValueChangeListener and handle callback error boundary", () => {
    const fakeGMAdd = vi.fn();
    const fakeGMRemove = vi.fn();
    (globalThis as any).GM_addValueChangeListener = fakeGMAdd;
    (globalThis as any).GM_removeValueChangeListener = fakeGMRemove;

    fakeGMAdd.mockReturnValue(999);

    const explodingCallback = vi.fn(() => {
      throw new Error("Callback exploded");
    });

    const listenerId = StorageUtil.addChangeListener("test-watch-key", explodingCallback);
    expect(listenerId).toBe(999);
    expect(fakeGMAdd).toHaveBeenCalledWith("test-watch-key", expect.any(Function));

    // 触发注册的包装回调，验证错误被捕获隔离，不会向外抛出
    const registeredWrapper = fakeGMAdd.mock.calls[0][1];
    expect(() => registeredWrapper("test-watch-key", 1, 2, true)).not.toThrow();
    expect(explodingCallback).toHaveBeenCalledWith("test-watch-key", 1, 2, true);

    StorageUtil.removeChangeListener(listenerId);
    expect(fakeGMRemove).toHaveBeenCalledWith(999);

    delete (globalThis as any).GM_addValueChangeListener;
    delete (globalThis as any).GM_removeValueChangeListener;
  });

  it("should safely return null when GM_addValueChangeListener is not available", () => {
    const listenerId = StorageUtil.addChangeListener("key", () => {});
    expect(listenerId).toBeNull();
    expect(() => StorageUtil.removeChangeListener(null)).not.toThrow();
  });
});
