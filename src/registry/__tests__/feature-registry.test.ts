import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeatureRegistry } from "../feature-registry";
import type { FeatureDescriptor } from "../../types";
import type { FeatureStateSnapshot } from "../types";

function createMockStorage(options?: {
  initialState?: Record<string, unknown>;
  persistenceAvailable?: boolean;
}) {
  let state: Record<string, unknown> = options?.initialState ? { ...options.initialState } : {};
  let persistenceAvailable = options?.persistenceAvailable ?? true;
  const listeners = new Map<number, (k: string, oldVal: unknown, newVal: unknown, remote: boolean) => void>();
  let nextListenerId = 1;

  const readFail = { value: false };
  const writeFail = { value: false };

  return {
    readFail,
    writeFail,
    state,
    listeners,
    setPersistenceAvailable(available: boolean): void {
      persistenceAvailable = available;
    },
    keys: {
      youtube: {
        functionState: "yt/functionState_01"
      }
    } as any,
    isPersistenceAvailable(): boolean {
      return persistenceAvailable;
    },
    getValue<T>(key: string, defaultValue: T): T {
      if (readFail.value) {
        throw new Error("Storage read error");
      }
      if (key in state) {
        return state[key] as T;
      }
      return defaultValue;
    },
    setValue<T>(key: string, value: T): void {
      if (writeFail.value) {
        throw new Error("Storage write error");
      }
      state[key] = value;
    },
    deleteValue(key: string): void {
      delete state[key];
    },
    addChangeListener(_key: string, cb: any): number {
      const id = nextListenerId++;
      listeners.set(id, cb);
      return id;
    },
    removeChangeListener(id: any): void {
      listeners.delete(id);
    },
    emitRemoteChange(oldVal: unknown, newVal: unknown): void {
      for (const cb of listeners.values()) {
        cb("yt/functionState_01", oldVal, newVal, true);
      }
    }
  };
}

describe("FeatureRegistry Kernel & State Transitions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== "undefined") {
      vi.spyOn(window, "location", "get").mockReturnValue({
        ...window.location,
        host: "www.youtube.com"
      } as Location);
    }
  });

  it("should isolate snapshots so external mutations do not contaminate internal state", () => {
    const mockStorage = createMockStorage();
    const registry = new FeatureRegistry(mockStorage as any);
    const desc: FeatureDescriptor = {
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: vi.fn(),
      teardown: vi.fn()
    };
    registry.register(desc);

    const snapshot = registry.getState("featA");
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.applied).toBe(false);
    expect(snapshot.runtime).toBe("idle");

    // 修改返回对象不应影响内部记录（冻结保护）
    expect(() => {
      (snapshot as any).enabled = false;
    }).toThrow();
    expect(registry.getState("featA").enabled).toBe(true);
  });

  it("should normalize storage data: apply defaults for missing/invalid types and preserve valid unknown booleans", async () => {
    const mockStorage = createMockStorage({
      initialState: {
        "yt/functionState_01": {
          featA: "invalid-string",
          featB: true,
          unknownFeatureX: true,
          unknownFeatureY: "invalid"
        }
      }
    });
    const registry = new FeatureRegistry(mockStorage as any);
    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: false,
      setup: vi.fn(),
      teardown: vi.fn()
    });
    registry.register({
      id: "featB",
      order: 2,
      i18nKey: "Feature B",
      defaultValue: false,
      setup: vi.fn(),
      teardown: vi.fn()
    });

    await registry.initAll();

    // featA 的非法字符串应退回默认值 false
    expect(registry.isEnabled("featA")).toBe(false);
    // featB 的合法布尔值应保留 true
    expect(registry.isEnabled("featB")).toBe(true);
    // 检查未知字段在本地写入时是否保留有效布尔值 unknownFeatureX 并清洗非法 unknownFeatureY
    await registry.setEnabled("featA", true);
    const saved = mockStorage.state["yt/functionState_01"] as Record<string, unknown>;
    expect(saved.unknownFeatureX).toBe(true);
    expect(saved.unknownFeatureY).toBeUndefined();
  });

  it("should not accept target or drive hooks when storage write fails", async () => {
    const mockStorage = createMockStorage({
      initialState: {
        "yt/functionState_01": { featA: false }
      }
    });
    const registry = new FeatureRegistry(mockStorage as any);
    const setupSpy = vi.fn();
    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: false,
      setup: setupSpy,
      teardown: vi.fn()
    });

    await registry.initAll();
    expect(registry.isEnabled("featA")).toBe(false);

    mockStorage.writeFail.value = true;

    await expect(registry.setEnabled("featA", true)).rejects.toThrow("Storage write error");
    expect(registry.isEnabled("featA")).toBe(false);
    expect(setupSpy).not.toHaveBeenCalled();

    const snapshot = registry.getState("featA");
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.error?.stage).toBe("storage");
    expect(snapshot.error?.retryable).toBe(true);
  });

  it("should not invoke setup when base snapshot was enabled but local target is submitted as disabled and applied is false", async () => {
    const mockStorage = createMockStorage({
      initialState: {
        "yt/functionState_01": { featA: true }
      }
    });
    const registry = new FeatureRegistry(mockStorage as any);
    const setupSpy = vi.fn();
    const teardownSpy = vi.fn();
    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: false,
      setup: setupSpy,
      teardown: teardownSpy
    });

    // 尚未 initAll，直接 setEnabled 为 false
    await registry.setEnabled("featA", false);

    expect(mockStorage.state["yt/functionState_01"]).toEqual(
      expect.objectContaining({ featA: false })
    );
    expect(setupSpy).not.toHaveBeenCalled();
    expect(teardownSpy).not.toHaveBeenCalled();
  });

  it("should short-circuit redundant setEnabled calls when steady state is already applied", async () => {
    const mockStorage = createMockStorage();
    const registry = new FeatureRegistry(mockStorage as any);
    const setupSpy = vi.fn();
    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: setupSpy,
      teardown: vi.fn()
    });

    await registry.initAll();
    expect(setupSpy).toHaveBeenCalledTimes(1);

    // 已经应用为 true，再次 setEnabled(true) 应当直接 resolve 且不重复 setup
    await registry.setEnabled("featA", true);
    expect(setupSpy).toHaveBeenCalledTimes(1);
  });

  it("should queue and serialize lifecycle execution when rapidly toggling a feature", async () => {
    const mockStorage = createMockStorage();
    const registry = new FeatureRegistry(mockStorage as any);

    let resolveSetup!: () => void;
    let resolveTeardown!: () => void;

    const setupSpy = vi.fn().mockImplementation(() => {
      return new Promise<void>((resolve) => {
        resolveSetup = resolve;
      });
    });

    const teardownSpy = vi.fn().mockImplementation(() => {
      return new Promise<void>((resolve) => {
        resolveTeardown = resolve;
      });
    });

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: false,
      setup: setupSpy,
      teardown: teardownSpy
    });

    await registry.initAll();

    // 启动 true
    const p1 = registry.setEnabled("featA", true);
    await Promise.resolve(); // 调和微任务启动 setup
    expect(setupSpy).toHaveBeenCalledTimes(1);

    // 在 setup 执行期间发起关闭
    const p2 = registry.setEnabled("featA", false);
    expect(teardownSpy).not.toHaveBeenCalled();

    // 完成 setup
    resolveSetup();
    // p1 此时因为被 p2 替代（superseded），应当 reject 为 superseded
    await expect(p1).rejects.toThrow("superseded");

    // 等待微任务让 teardown 开始执行
    await vi.waitFor(() => {
      expect(teardownSpy).toHaveBeenCalledTimes(1);
    });

    // 完成 teardown
    resolveTeardown();
    await p2;

    const finalSnapshot = registry.getState("featA");
    expect(finalSnapshot.enabled).toBe(false);
    expect(finalSnapshot.applied).toBe(false);
    expect(finalSnapshot.runtime).toBe("disabled");
  });

  it("should wait for teardown to finish before executing setup when turning on during teardown", async () => {
    const mockStorage = createMockStorage({
      initialState: {
        "yt/functionState_01": { featA: true }
      }
    });
    const registry = new FeatureRegistry(mockStorage as any);

    let resolveTeardown!: () => void;
    let teardownStarted = false;

    const setupSpy = vi.fn().mockResolvedValue(undefined);
    const teardownSpy = vi.fn().mockImplementation(() => {
      teardownStarted = true;
      return new Promise<void>((resolve) => {
        resolveTeardown = resolve;
      });
    });

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: setupSpy,
      teardown: teardownSpy
    });

    await registry.initAll();
    expect(setupSpy).toHaveBeenCalledTimes(1);
    setupSpy.mockClear();

    // 发起关闭
    const disablePromise = registry.setEnabled("featA", false);
    await vi.waitFor(() => expect(teardownStarted).toBe(true));

    // 在 teardown 执行中发起重新开启
    const enablePromise = registry.setEnabled("featA", true);

    // setup 严禁在 teardown 结束前启动
    expect(setupSpy).not.toHaveBeenCalled();

    // 完成 teardown
    resolveTeardown();
    // 之前关闭请求被后来的开启请求替代
    await expect(disablePromise).rejects.toThrow("superseded");

    // teardown 完成后，setup 启动并完成
    await enablePromise;
    expect(setupSpy).toHaveBeenCalledTimes(1);

    const snapshot = registry.getState("featA");
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.applied).toBe(true);
    expect(snapshot.runtime).toBe("enabled");
  });

  it("should auto-cleanup on setup failure: if teardown succeeds, applied=false and explicit retry is allowed", async () => {
    const mockStorage = createMockStorage();
    const registry = new FeatureRegistry(mockStorage as any);

    let shouldFail = true;
    const setupSpy = vi.fn().mockImplementation(() => {
      if (shouldFail) {
        return Promise.reject(new Error("Setup exploded"));
      }
      return Promise.resolve();
    });
    const teardownSpy = vi.fn().mockResolvedValue(undefined);

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: false,
      setup: setupSpy,
      teardown: teardownSpy
    });

    await registry.initAll();

    await expect(registry.setEnabled("featA", true)).rejects.toThrow("Setup exploded");
    expect(teardownSpy).toHaveBeenCalledTimes(1);

    const errorSnapshot = registry.getState("featA");
    expect(errorSnapshot.enabled).toBe(true);
    expect(errorSnapshot.applied).toBe(false);
    expect(errorSnapshot.runtime).toBe("error");
    expect(errorSnapshot.error?.stage).toBe("setup");
    expect(errorSnapshot.error?.retryable).toBe(true);

    // 显式同值重试
    shouldFail = false;
    await registry.setEnabled("featA", true);

    const recoveredSnapshot = registry.getState("featA");
    expect(recoveredSnapshot.enabled).toBe(true);
    expect(recoveredSnapshot.applied).toBe(true);
    expect(recoveredSnapshot.runtime).toBe("enabled");
    expect(recoveredSnapshot.error).toBeNull();
  });

  it("should lock applied=null and require reload if setup cleanup fails or teardown fails", async () => {
    const mockStorage = createMockStorage();
    const registry = new FeatureRegistry(mockStorage as any);

    const setupSpy = vi.fn().mockRejectedValue(new Error("Setup failed"));
    const teardownSpy = vi.fn().mockRejectedValue(new Error("Teardown failed"));

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: false,
      setup: setupSpy,
      teardown: teardownSpy
    });

    await registry.initAll();

    await expect(registry.setEnabled("featA", true)).rejects.toThrow(/Setup and cleanup failed|Setup failed|Teardown failed/);

    const snapshot = registry.getState("featA");
    expect(snapshot.applied).toBeNull();
    expect(snapshot.runtime).toBe("reload-required");
    expect(snapshot.error?.retryable).toBe(false);

    // 后续切换严禁重复装配，直接报错 reload required
    await expect(registry.setEnabled("featA", true)).rejects.toThrow("reload required");
  });

  it("should deduplicate concurrent initAll calls and execute initial setup exactly once", async () => {
    const mockStorage = createMockStorage();
    const registry = new FeatureRegistry(mockStorage as any);
    const setupSpy = vi.fn().mockResolvedValue(undefined);

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: setupSpy,
      teardown: vi.fn()
    });

    const [p1, p2, p3] = [registry.initAll(), registry.initAll(), registry.initAll()];
    await Promise.all([p1, p2, p3]);

    expect(setupSpy).toHaveBeenCalledTimes(1);

    // 再次调用 initAll 也不会重复执行
    await registry.initAll();
    expect(setupSpy).toHaveBeenCalledTimes(1);
  });

  it("should cleanup listener and allow explicit initAll retry when initial storage read fails", async () => {
    const mockStorage = createMockStorage();
    mockStorage.readFail.value = true;
    const registry = new FeatureRegistry(mockStorage as any);

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: vi.fn(),
      teardown: vi.fn()
    });

    await expect(registry.initAll()).rejects.toThrow("Storage read error");
    expect(mockStorage.listeners.size).toBe(0);

    // 修复存储读取后重新 initAll 应成功
    mockStorage.readFail.value = false;
    await expect(registry.initAll()).resolves.toBeUndefined();
    expect(mockStorage.listeners.size).toBe(1);
  });

  it("should preserve Feature B state and lifecycle when Feature A setup fails", async () => {
    const mockStorage = createMockStorage();
    const registry = new FeatureRegistry(mockStorage as any);

    const setupA = vi.fn().mockRejectedValue(new Error("A exploded"));
    const setupB = vi.fn().mockResolvedValue(undefined);

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: setupA,
      teardown: vi.fn().mockResolvedValue(undefined)
    });

    registry.register({
      id: "featB",
      order: 2,
      i18nKey: "Feature B",
      defaultValue: true,
      setup: setupB,
      teardown: vi.fn().mockResolvedValue(undefined)
    });

    await registry.initAll();

    expect(registry.getState("featA").runtime).toBe("error");
    expect(registry.getState("featB").runtime).toBe("enabled");
    expect(registry.getState("featB").applied).toBe(true);
  });

  it("should reconcile from remote notification without rewriting shared storage", async () => {
    const mockStorage = createMockStorage({
      initialState: {
        "yt/functionState_01": { featA: true }
      }
    });
    const registry = new FeatureRegistry(mockStorage as any);
    const teardownSpy = vi.fn().mockResolvedValue(undefined);

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: vi.fn().mockResolvedValue(undefined),
      teardown: teardownSpy
    });

    await registry.initAll();

    // 远程存储被其他标签页修改为 false
    mockStorage.state["yt/functionState_01"] = { featA: false };
    const setValueSpy = vi.spyOn(mockStorage, "setValue");

    mockStorage.emitRemoteChange({ featA: true }, { featA: false });

    await vi.waitFor(() => {
      expect(registry.isEnabled("featA")).toBe(false);
      expect(teardownSpy).toHaveBeenCalledTimes(1);
    });

    // 远程通知不应产生回声写回
    expect(setValueSpy).not.toHaveBeenCalled();
  });

  it("should enter session mode when persistence is not available", async () => {
    const mockStorage = createMockStorage({
      persistenceAvailable: false,
      initialState: {
        "yt/functionState_01": { featA: true }
      }
    });
    const registry = new FeatureRegistry(mockStorage as any);

    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: false,
      setup: vi.fn().mockResolvedValue(undefined),
      teardown: vi.fn().mockResolvedValue(undefined)
    });

    expect(registry.persistenceMode).toBe("session");

    await registry.initAll();
    // 不注册持久化监听
    expect(mockStorage.listeners.size).toBe(0);

    const snapshot = registry.getState("featA");
    expect(snapshot.persistence).toBe("session");

    // 会话模式下 setEnabled 正常更新内存
    await registry.setEnabled("featA", false);
    expect(registry.isEnabled("featA")).toBe(false);
  });

  it("should enforce registration constraints: duplicate object is idempotent, duplicate id with different object throws, registerAll is atomic", () => {
    const registry = new FeatureRegistry(createMockStorage() as any);
    const descA: FeatureDescriptor = {
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: vi.fn(),
      teardown: vi.fn()
    };

    registry.register(descA);
    // 重复注册相同对象应幂等返回
    expect(() => registry.register(descA)).not.toThrow();

    // 注册不同对象同 ID 报错
    expect(() =>
      registry.register({
        id: "featA",
        order: 2,
        i18nKey: "Other A",
        defaultValue: false,
        setup: vi.fn(),
        teardown: vi.fn()
      })
    ).toThrow('Feature "featA" is already registered');

    // registerAll 原子性校验
    expect(() =>
      registry.registerAll([
        {
          id: "featB",
          order: 3,
          i18nKey: "Feature B",
          defaultValue: true,
          setup: vi.fn(),
          teardown: vi.fn()
        },
        {
          id: "featA", // 冲突
          order: 4,
          i18nKey: "Conflict",
          defaultValue: true,
          setup: vi.fn(),
          teardown: vi.fn()
        }
      ])
    ).toThrow();

    // featB 不应被部分注册
    expect(() => registry.getState("featB")).toThrow("Unknown feature ID");
  });

  it("should immediately deliver current snapshots upon subscribe and isolate subscriber errors", async () => {
    const mockStorage = createMockStorage();
    const registry = new FeatureRegistry(mockStorage as any);
    registry.register({
      id: "featA",
      order: 1,
      i18nKey: "Feature A",
      defaultValue: true,
      setup: vi.fn().mockResolvedValue(undefined),
      teardown: vi.fn().mockResolvedValue(undefined)
    });

    const receivedSnapshots: FeatureStateSnapshot[] = [];

    // 第一个订阅者抛错
    registry.subscribe(() => {
      throw new Error("Subscriber crash");
    });

    // 第二个订阅者正常接收
    const unsub = registry.subscribe((snapshot) => {
      receivedSnapshots.push(snapshot);
    });

    expect(receivedSnapshots.length).toBe(1);
    expect(receivedSnapshots[0].id).toBe("featA");

    unsub();
  });
});
