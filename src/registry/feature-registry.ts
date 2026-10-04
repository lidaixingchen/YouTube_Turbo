import { StorageUtil, type StorageListenerId } from "../core/storage";
import type { FeatureDescriptor } from "../types";
import { DEFAULT_FEATURE_ORDER, FEATURE_REGISTRY_CONSTANTS } from "./constants";
import type {
  FeatureFailure,
  FeatureRuntimeStatus,
  FeatureStateListener,
  FeatureStateSnapshot
} from "./types";

interface PendingRequest {
  readonly targetVersion: number;
  readonly attemptId: number;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

interface InternalFeatureFailure extends FeatureFailure {
  readonly error: unknown;
}

interface FeatureRecord {
  readonly descriptor: FeatureDescriptor;
  targetVersion: number;
  targetEnabled: boolean;
  applied: boolean | null;
  runtime: FeatureRuntimeStatus;
  error: InternalFeatureFailure | null;
  failedTargetVersion: number | null;
  currentAttemptId: number;
  activeHook: "setup" | "teardown" | null;
  hasInitEligibility: boolean;
  pendingRequests: PendingRequest[];
}

export class FeatureRegistry {
  private static instance: FeatureRegistry | null = null;
  private readonly storage: typeof StorageUtil;
  private readonly descriptors = new Map<string, FeatureDescriptor>();
  private readonly records = new Map<string, FeatureRecord>();
  private readonly subscribers = new Set<FeatureStateListener>();

  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly storageListenerIds = new Map<string, StorageListenerId | null>();
  private visibilityChangeHandler: (() => void) | null = null;
  private hasPendingStorageSync = false;
  private cachedStates: Record<string, boolean> | null = null;

  private isReconcileScheduled = false;
  private isAdmitting = false;
  private readonly admissionQueue: Array<() => void> = [];
  private readonly pendingNotifications = new Set<string>();

  public constructor(storage: typeof StorageUtil = StorageUtil) {
    this.storage = storage;
  }

  public static getInstance(): FeatureRegistry {
    if (!this.instance) {
      this.instance = new FeatureRegistry();
    }
    return this.instance;
  }

  public static register(descriptor: FeatureDescriptor): void {
    this.getInstance().register(descriptor);
  }

  public static registerAll(descList: FeatureDescriptor[]): void {
    this.getInstance().registerAll(descList);
  }

  public static getDefaultStates(): Record<string, boolean> {
    return this.getInstance().getDefaultStates();
  }

  public static getAllStates(): Record<string, boolean> {
    return this.getInstance().getAllStates();
  }

  public static isEnabled(id: string): boolean {
    return this.getInstance().isEnabled(id);
  }

  public static getState(id: string): FeatureStateSnapshot {
    return this.getInstance().getState(id);
  }

  public static subscribe(listener: FeatureStateListener): () => void {
    return this.getInstance().subscribe(listener);
  }

  public static setEnabled(id: string, enabled: boolean): Promise<void> {
    return this.getInstance().setEnabled(id, enabled);
  }

  public static initAll(): Promise<void> {
    return this.getInstance().initAll();
  }

  public static getAllDescriptors(): readonly FeatureDescriptor[] {
    return this.getInstance().getAllDescriptors();
  }

  public static invalidateCache(): void {
    this.getInstance().invalidateCache();
  }

  public static openSettingsModal(): void {
    import("./settings-view").then(({ SettingsModalView }) => {
      SettingsModalView.show();
    });
  }

  public get persistenceMode(): "persistent" | "session" {
    return this.storage.isPersistenceAvailable() ? "persistent" : "session";
  }

  public get hasInitialized(): boolean {
    return this.isInitialized;
  }

  public register(descriptor: FeatureDescriptor): void {
    this.assertRegistrationPhase();
    const existing = this.descriptors.get(descriptor.id);
    if (existing) {
      if (existing === descriptor) {
        return;
      }
      throw new Error(`[FeatureRegistry] Feature "${descriptor.id}" is already registered.`);
    }

    this.descriptors.set(descriptor.id, descriptor);
    const initialTarget = descriptor.defaultValue;

    const record: FeatureRecord = {
      descriptor,
      targetVersion: 1,
      targetEnabled: initialTarget,
      applied: false,
      runtime: "idle",
      error: null,
      failedTargetVersion: null,
      currentAttemptId: 1,
      activeHook: null,
      hasInitEligibility: false,
      pendingRequests: []
    };
    this.records.set(descriptor.id, record);

    if (this.cachedStates !== null && typeof this.cachedStates[descriptor.id] !== "boolean") {
      this.cachedStates[descriptor.id] = initialTarget;
    }
  }

  public registerAll(descList: FeatureDescriptor[]): void {
    this.assertRegistrationPhase();
    const seenIds = new Set<string>();
    for (const desc of descList) {
      if (!desc || !desc.id) {
        throw new Error("[FeatureRegistry] Invalid descriptor in registerAll.");
      }
      if (seenIds.has(desc.id)) {
        throw new Error(`[FeatureRegistry] Duplicate feature ID "${desc.id}" in registerAll.`);
      }
      seenIds.add(desc.id);

      const existing = this.descriptors.get(desc.id);
      if (existing && existing !== desc) {
        throw new Error(`[FeatureRegistry] Feature "${desc.id}" is already registered.`);
      }
    }

    for (const desc of descList) {
      this.register(desc);
    }
  }

  public getDefaultStates(): Record<string, boolean> {
    const defaults: Record<string, boolean> = {};
    this.descriptors.forEach((desc: FeatureDescriptor, id: string): void => {
      defaults[id] = desc.defaultValue;
    });
    return defaults;
  }

  public getAllStates(): Record<string, boolean> {
    const result: Record<string, boolean> = { ...this.cachedStates };
    this.records.forEach((record: FeatureRecord, id: string): void => {
      result[id] = record.targetEnabled;
    });
    return result;
  }

  public getAllDescriptors(): readonly FeatureDescriptor[] {
    return Array.from(this.descriptors.values()).sort(
      (a: FeatureDescriptor, b: FeatureDescriptor): number => (a.order ?? DEFAULT_FEATURE_ORDER) - (b.order ?? DEFAULT_FEATURE_ORDER)
    );
  }

  public isEnabled(id: string): boolean {
    const record = this.records.get(id);
    if (record) {
      return record.targetEnabled;
    }
    return this.descriptors.get(id)?.defaultValue ?? true;
  }

  public getState(id: string): FeatureStateSnapshot {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`[FeatureRegistry] Unknown feature ID: ${id}`);
    }
    return this.createSnapshot(record);
  }

  public subscribe(listener: FeatureStateListener): () => void {
    this.subscribers.add(listener);

    // 订阅时立即同步交付全部已注册功能的初始快照
    for (const desc of this.getAllDescriptors()) {
      const record = this.records.get(desc.id);
      if (record) {
        try {
          listener(this.createSnapshot(record));
        } catch (err: unknown) {
          console.error(`[FeatureRegistry] Subscriber error for "${desc.id}":`, err);
        }
      }
    }

    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public invalidateCache(): void {
    if (this.persistenceMode !== "persistent") {
      return;
    }

    this.enterAdmission(() => {
      this.refreshStorageSnapshot("invalidateCache");
    });
  }

  public setEnabled(id: string, enabled: boolean): Promise<void> {
    if (this.isAdmitting) {
      return new Promise<void>((resolve: () => void, reject: (error: unknown) => void): void => {
        this.admissionQueue.push((): void => {
          void this.setEnabledInAdmission(id, enabled).then(resolve, reject);
        });
      });
    }

    let requestPromise!: Promise<void>;
    this.enterAdmission((): void => {
      requestPromise = this.setEnabledInAdmission(id, enabled);
    });
    return requestPromise;
  }

  private setEnabledInAdmission(id: string, enabled: boolean): Promise<void> {
    const record = this.records.get(id);
    if (!record) {
      return Promise.reject(new Error(`[FeatureRegistry] Unknown feature ID: ${id}`));
    }

    if (record.applied === null) {
      return Promise.reject(new Error(`[FeatureRegistry] Cannot toggle "${id}": reload required`));
    }

    // 已经应用的目标且无错误、无活动 hook，并且已初始化时短路返回
    if (
      this.isInitialized &&
      record.targetEnabled === enabled &&
      record.applied === enabled &&
      !record.error &&
      record.activeHook === null
    ) {
      return Promise.resolve();
    }

    // 检查是否为显式同值重试
    if (record.targetEnabled === enabled && record.error?.stage === "setup" && record.error.retryable && record.activeHook === null) {
      record.error = null;
      record.currentAttemptId++;
      this.notifySubscribers(id);
      const reqPromise = this.createPendingRequest(record, record.targetVersion, record.currentAttemptId);
      this.scheduleReconcile();
      return reqPromise;
    }

    if (record.targetEnabled === enabled && record.activeHook !== null) {
      return this.createPendingRequest(record, record.targetVersion, record.currentAttemptId);
    }

    let baseRaw: unknown;
    try {
      baseRaw = this.readStorageRaw();
      this.hasPendingStorageSync = false;
    } catch (err: unknown) {
      record.error = { stage: "storage", retryable: true, error: err };
      this.notifySubscribers(id);
      return Promise.reject(err);
    }

    const baseDict = this.normalizeDictionary(baseRaw);
    const needStorageWrite = this.persistenceMode === "persistent" && baseDict[id] !== enabled;

    if (needStorageWrite) {
      try {
        this.storage.setValue(this.storage.keys.youtube.functionStateForFeature(id), enabled);
      } catch (err: unknown) {
        this.applyStorageSnapshot(baseDict);
        record.error = { stage: "storage", retryable: true, error: err };
        this.notifySubscribers(id);
        return Promise.reject(err);
      }
    }

    if (record.error?.stage === "storage") {
      record.error = null;
    }

    this.applyStorageSnapshot({ ...baseDict, [id]: enabled });

    if (!enabled && record.applied === true && !record.descriptor.teardown) {
      record.applied = null;
      record.runtime = "reload-required";
      this.notifySubscribers(id);
      return Promise.resolve();
    }

    if (!record.hasInitEligibility) {
      this.notifySubscribers(id);
      return this.initPromise === null
        ? Promise.resolve()
        : this.createPendingRequest(record, record.targetVersion, record.currentAttemptId);
    }

    if (record.applied === enabled && !record.error && record.activeHook === null) {
      this.notifySubscribers(id);
      return Promise.resolve();
    }

    const requestPromise: Promise<void> = this.createPendingRequest(record, record.targetVersion, record.currentAttemptId);
    this.notifySubscribers(id);
    this.scheduleReconcile();
    return requestPromise;
  }

  public async initAll(): Promise<void> {
    if (typeof window !== "undefined" && !/youtube\.com/.test(window.location?.host ?? "")) {
      return;
    }

    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    const runInit = async (): Promise<void> => {
      let raw: unknown;
      try {
        this.setupStorageListener();
        raw = this.readStorageRaw();
      } catch (err: unknown) {
        this.removeStorageListeners();
        throw err;
      }

      this.enterAdmission(() => {
        this.applyStorageSnapshot(raw);
      });

      for (const feature of this.getAllDescriptors()) {
        const record = this.records.get(feature.id);
        if (!record) {
          continue;
        }

        record.hasInitEligibility = true;

        if (record.targetEnabled) {
          await this.executeFeatureInitialAttempt(record);
        } else {
          record.applied = false;
          record.runtime = "disabled";
          this.notifySubscribers(record.descriptor.id);
          this.settleRequests(record);
        }
      }

      this.isInitialized = true;
    };

    let resolveInitialization!: () => void;
    let rejectInitialization!: (error: unknown) => void;
    const promise: Promise<void> = new Promise<void>((resolve: () => void, reject: (error: unknown) => void): void => {
      resolveInitialization = resolve;
      rejectInitialization = reject;
    });
    this.initPromise = promise;
    void runInit().then(resolveInitialization, (err: unknown): void => {
      this.initPromise = null;
      rejectInitialization(err);
    });
    return promise;
  }

  private setupStorageListener(): void {
    if (this.storageListenerIds.size > 0 || this.persistenceMode !== "persistent") {
      return;
    }

    const keys: string[] = [
      this.storage.keys.youtube.functionState,
      ...Array.from(this.descriptors.keys(), (id: string): string =>
        this.storage.keys.youtube.functionStateForFeature(id)
      )
    ];

    try {
      for (const key of new Set(keys)) {
        const listenerId: StorageListenerId | null = this.storage.addChangeListener<unknown>(
          key,
          (_key: string, _oldVal: unknown, _newVal: unknown, remote: boolean): void => {
            if (remote) {
              this.handleRemoteChange();
            }
          }
        );
        this.storageListenerIds.set(key, listenerId);
      }

      if (typeof document !== "undefined" && this.visibilityChangeHandler === null) {
        const handler = (): void => {
          if (
            this.hasPendingStorageSync &&
            document.visibilityState === FEATURE_REGISTRY_CONSTANTS.VISIBILITY.VISIBLE_STATE
          ) {
            this.invalidateCache();
          }
        };
        document.addEventListener(FEATURE_REGISTRY_CONSTANTS.VISIBILITY.CHANGE_EVENT, handler);
        this.visibilityChangeHandler = handler;
      }
    } catch (err: unknown) {
      this.removeStorageListeners();
      throw err;
    }
  }

  private removeStorageListeners(): void {
    for (const listenerId of this.storageListenerIds.values()) {
      try {
        this.storage.removeChangeListener(listenerId);
      } catch (err: unknown) {
        console.error("[FeatureRegistry] Failed to remove storage listener:", err);
      }
    }
    this.storageListenerIds.clear();

    if (this.visibilityChangeHandler !== null && typeof document !== "undefined") {
      const handler: () => void = this.visibilityChangeHandler;
      this.visibilityChangeHandler = null;
      try {
        document.removeEventListener(FEATURE_REGISTRY_CONSTANTS.VISIBILITY.CHANGE_EVENT, handler);
      } catch (err: unknown) {
        console.error("[FeatureRegistry] Failed to remove visibility listener:", err);
      }
    }
  }

  private handleRemoteChange(): void {
    this.hasPendingStorageSync = true;
    this.enterAdmission((): void => {
      this.refreshStorageSnapshot("remote notification");
    });
  }

  private refreshStorageSnapshot(source: string): void {
    this.hasPendingStorageSync = true;
    try {
      const raw: unknown = this.readStorageRaw();
      this.applyStorageSnapshot(raw);
      this.hasPendingStorageSync = false;
    } catch (err: unknown) {
      console.error(`[FeatureRegistry] Failed to re-read storage in ${source}:`, err);
    }
  }

  private readStorageRaw(): unknown {
    if (this.persistenceMode === "session") {
      if (this.cachedStates !== null) {
        return this.cachedStates;
      }
    }

    const legacyRaw: unknown = this.storage.getValue<unknown>(this.storage.keys.youtube.functionState, {});
    const states: Record<string, boolean> = this.normalizeDictionary(legacyRaw);
    for (const [id, descriptor] of this.descriptors.entries()) {
      const featureRaw: unknown = this.storage.getValue<unknown>(
        this.storage.keys.youtube.functionStateForFeature(id),
        undefined
      );
      if (featureRaw !== undefined) {
        states[id] = typeof featureRaw === "boolean" ? featureRaw : descriptor.defaultValue;
      }
    }
    return states;
  }

  private normalizeDictionary(raw: unknown): Record<string, boolean> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return this.getDefaultStates();
    }

    const dict = raw as Record<string, unknown>;
    const normalized: Record<string, boolean> = {};

    // 保留已知功能的布尔值，非法或缺失使用 defaultValue
    for (const [id, desc] of this.descriptors.entries()) {
      const val: unknown = Object.prototype.hasOwnProperty.call(dict, id) ? dict[id] : undefined;
      normalized[id] = typeof val === "boolean" ? val : desc.defaultValue;
    }

    // 保留未知的有效布尔字段以维持跨版本兼容
    for (const [key, val] of Object.entries(dict)) {
      if (!this.descriptors.has(key) && typeof val === "boolean") {
        normalized[key] = val;
      }
    }

    return normalized;
  }

  private applyStorageSnapshot(raw: unknown): void {
    const dict = this.normalizeDictionary(raw);
    this.cachedStates = { ...dict };

    for (const [id, record] of this.records.entries()) {
      if (id in dict) {
        if (record.targetEnabled !== dict[id]) {
          this.updateTarget(record, dict[id]);
          this.notifySubscribers(id);
        }
      }
    }

    this.scheduleReconcile();
  }

  private updateTarget(record: FeatureRecord, enabled: boolean): void {
    if (record.targetEnabled !== enabled) {
      record.targetEnabled = enabled;
      record.targetVersion++;
      record.currentAttemptId++;
      const pending: PendingRequest[] = [];
      for (const request of record.pendingRequests) {
        if (request.targetVersion < record.targetVersion) {
          request.reject(new Error("superseded"));
        } else {
          pending.push(request);
        }
      }
      record.pendingRequests = pending;
    }
  }

  private enterAdmission(action: () => void): void {
    if (this.isAdmitting) {
      this.admissionQueue.push(action);
      return;
    }

    this.isAdmitting = true;
    try {
      action();
    } finally {
      try {
        this.flushPendingNotifications();
        while (this.admissionQueue.length > 0) {
          const next = this.admissionQueue.shift();
          if (next) {
            try {
              next();
            } catch (err: unknown) {
              console.error("[FeatureRegistry] Admission queue error:", err);
            }
            this.flushPendingNotifications();
          }
        }
      } finally {
        this.isAdmitting = false;
      }
    }
  }

  private flushPendingNotifications(): void {
    const ids: string[] = Array.from(this.pendingNotifications);
    this.pendingNotifications.clear();
    for (const id of ids) {
      this.deliverSubscribers(id);
    }
  }

  private scheduleReconcile(): void {
    if (this.isReconcileScheduled) {
      return;
    }
    this.isReconcileScheduled = true;

    queueMicrotask((): void => {
      this.isReconcileScheduled = false;
      this.reconcileAll();
    });
  }

  private reconcileAll(): void {
    for (const record of this.records.values()) {
      if (!record.hasInitEligibility || record.activeHook !== null) {
        continue;
      }
      this.reconcileFeature(record);
    }
  }

  private reconcileFeature(record: FeatureRecord): void {
    if (record.applied === null) {
      record.runtime = "reload-required";
      this.notifySubscribers(record.descriptor.id);
      this.settleRequests(record);
      return;
    }

    if (record.error?.stage === "setup" && record.error.retryable && record.failedTargetVersion === record.targetVersion) {
      return;
    }

    if (record.targetEnabled && record.applied !== true) {
      void this.executeSetupWithCleanup(record);
    } else if (!record.targetEnabled && record.applied !== false) {
      void this.runTeardown(record);
    } else {
      if (record.targetEnabled === false && record.applied === false && record.runtime === "error") {
        record.runtime = "disabled";
        record.error = null;
        this.notifySubscribers(record.descriptor.id);
      }
      this.settleRequests(record);
    }
  }

  private async executeFeatureInitialAttempt(record: FeatureRecord): Promise<void> {
    record.activeHook = "setup";
    record.runtime = "starting";
    const currentTargetVersion = record.targetVersion;
    const currentAttemptId = record.currentAttemptId;
    this.notifySubscribers(record.descriptor.id);

    try {
      await record.descriptor.setup();
      record.activeHook = null;
      record.applied = true;
      record.runtime = "enabled";
      record.error = null;
      this.notifySubscribers(record.descriptor.id);
      this.settleRequests(record);
    } catch (err: unknown) {
      console.error(`[FeatureRegistry] Initial setup failed for "${record.descriptor.id}":`, err);
      if (record.descriptor.teardown) {
        record.runtime = "stopping";
        this.notifySubscribers(record.descriptor.id);

        try {
          await record.descriptor.teardown();
          record.applied = false;
          record.runtime = "error";
          record.error = { stage: "setup", retryable: true, error: err };
          record.failedTargetVersion = currentTargetVersion;
        } catch (cleanupErr: unknown) {
          console.error(`[FeatureRegistry] Initial cleanup failed for "${record.descriptor.id}":`, cleanupErr);
          record.applied = null;
          record.runtime = "reload-required";
          const combined = new AggregateError([err, cleanupErr], `Setup and cleanup failed for "${record.descriptor.id}"`);
          record.error = { stage: "cleanup", retryable: false, error: combined };
        }
      } else {
        record.applied = null;
        record.runtime = "reload-required";
        record.error = { stage: "setup", retryable: false, error: err };
      }

      record.activeHook = null;
      this.notifySubscribers(record.descriptor.id);
      this.rejectAttemptRequests(record, currentAttemptId, err);
    } finally {
      if (record.targetVersion !== currentTargetVersion) {
        this.scheduleReconcile();
      }
    }
  }

  private async executeSetupWithCleanup(record: FeatureRecord): Promise<void> {
    record.activeHook = "setup";
    record.runtime = "starting";
    const currentTargetVersion = record.targetVersion;
    const currentAttemptId = record.currentAttemptId;
    this.notifySubscribers(record.descriptor.id);

    try {
      await record.descriptor.setup();
      record.activeHook = null;
      record.applied = true;
      record.runtime = "enabled";
      record.error = null;
      this.notifySubscribers(record.descriptor.id);
      this.settleRequests(record);
    } catch (setupError: unknown) {
      console.error(`[FeatureRegistry] Setup error for "${record.descriptor.id}":`, setupError);
      // setup 失败后在同一执行器中尝试一次必要的清理 teardown
      if (record.descriptor.teardown) {
        record.runtime = "stopping";
        record.error = { stage: "setup", retryable: false, error: setupError };
        this.notifySubscribers(record.descriptor.id);

        try {
          await record.descriptor.teardown();
          record.applied = false;
          record.runtime = "error";
          record.error = { stage: "setup", retryable: true, error: setupError };
          record.failedTargetVersion = currentTargetVersion;
          this.rejectAttemptRequests(record, currentAttemptId, setupError);
        } catch (cleanupError: unknown) {
          console.error(`[FeatureRegistry] Cleanup teardown error for "${record.descriptor.id}":`, cleanupError);
          record.applied = null;
          record.runtime = "reload-required";
          const combined = new AggregateError([setupError, cleanupError], `Setup and cleanup failed for "${record.descriptor.id}"`);
          record.error = { stage: "cleanup", retryable: false, error: combined };
          this.rejectAttemptRequests(record, currentAttemptId, combined);
        }
      } else {
        record.applied = null;
        record.runtime = "reload-required";
        record.error = { stage: "setup", retryable: false, error: setupError };
        this.rejectAttemptRequests(record, currentAttemptId, setupError);
      }

      record.activeHook = null;
      this.notifySubscribers(record.descriptor.id);
    }

    if (record.targetVersion !== currentTargetVersion) {
      this.scheduleReconcile();
    }
  }

  private async runTeardown(record: FeatureRecord): Promise<void> {
    if (!record.descriptor.teardown) {
      record.applied = null;
      record.runtime = "reload-required";
      this.notifySubscribers(record.descriptor.id);
      this.settleRequests(record);
      return;
    }

    record.activeHook = "teardown";
    record.runtime = "stopping";
    const currentTargetVersion = record.targetVersion;
    const currentAttemptId = record.currentAttemptId;
    this.notifySubscribers(record.descriptor.id);

    try {
      await record.descriptor.teardown();
      record.activeHook = null;
      record.applied = false;
      record.runtime = "disabled";
      record.error = null;
      this.notifySubscribers(record.descriptor.id);
      this.settleRequests(record);
    } catch (err: unknown) {
      console.error(`[FeatureRegistry] Teardown error for "${record.descriptor.id}":`, err);
      record.activeHook = null;
      record.applied = null;
      record.runtime = "reload-required";
      record.error = { stage: "teardown", retryable: false, error: err };
      this.notifySubscribers(record.descriptor.id);
      this.rejectAttemptRequests(record, currentAttemptId, err);
    } finally {
      if (record.targetVersion !== currentTargetVersion) {
        this.scheduleReconcile();
      }
    }
  }

  private createPendingRequest(record: FeatureRecord, targetVersion: number, attemptId: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      record.pendingRequests.push({ targetVersion, attemptId, resolve, reject });
    });
  }

  private settleRequests(record: FeatureRecord): void {
    const remaining: PendingRequest[] = [];
    const isSatisfied: boolean = record.applied === record.targetEnabled ||
      (record.runtime === "reload-required" && record.error === null);

    for (const req of record.pendingRequests) {
      if (req.targetVersion < record.targetVersion) {
        req.reject(new Error("superseded"));
      } else if (record.applied === null && record.error !== null) {
        req.reject(record.error.error);
      } else if (req.targetVersion === record.targetVersion && isSatisfied) {
        req.resolve();
      } else {
        remaining.push(req);
      }
    }

    record.pendingRequests = remaining;
  }

  private rejectAttemptRequests(record: FeatureRecord, attemptId: number, error: unknown): void {
    const remaining: PendingRequest[] = [];
    for (const req of record.pendingRequests) {
      if (req.attemptId === attemptId) {
        req.reject(error);
      } else {
        remaining.push(req);
      }
    }
    record.pendingRequests = remaining;
  }

  private notifySubscribers(id: string): void {
    if (this.isAdmitting) {
      this.pendingNotifications.add(id);
      return;
    }
    this.deliverSubscribers(id);
  }

  private deliverSubscribers(id: string): void {
    const record = this.records.get(id);
    if (!record || this.subscribers.size === 0) {
      return;
    }

    const snapshot = this.createSnapshot(record);
    for (const sub of this.subscribers) {
      try {
        sub(snapshot);
      } catch (err: unknown) {
        console.error(`[FeatureRegistry] Subscriber callback error for "${id}":`, err);
      }
    }
  }

  private createSnapshot(record: FeatureRecord): FeatureStateSnapshot {
    return Object.freeze({
      id: record.descriptor.id,
      enabled: record.targetEnabled,
      applied: record.applied,
      runtime: record.runtime,
      error: record.error
        ? Object.freeze({ stage: record.error.stage, retryable: record.error.retryable })
        : null,
      persistence: this.persistenceMode
    });
  }

  private assertRegistrationPhase(): void {
    if (this.isInitialized || this.initPromise !== null) {
      throw new Error("[FeatureRegistry] Cannot register descriptors after initialization has started.");
    }
  }
}
