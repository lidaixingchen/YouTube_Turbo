import { StorageUtil, type StorageListenerId } from "../core/storage";
import type { FeatureDescriptor } from "../types";

const DEFAULT_FEATURE_ORDER = 100;

export class FeatureRegistry {
  private static instance: FeatureRegistry | null = null;
  private readonly descriptors = new Map<string, FeatureDescriptor>();
  private isInitialized = false;
  private cachedStates: Record<string, boolean> | null = null;
  private storageListenerId: StorageListenerId | null = null;

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

  public invalidateCache(): void {
    this.cachedStates = null;
  }

  public register(descriptor: FeatureDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
    if (this.cachedStates !== null && typeof this.cachedStates[descriptor.id] !== "boolean") {
      this.cachedStates[descriptor.id] = descriptor.defaultValue;
    }
  }

  public registerAll(descList: FeatureDescriptor[]): void {
    descList.forEach((d) => this.register(d));
  }

  public getDefaultStates(): Record<string, boolean> {
    const defaults: Record<string, boolean> = {};
    this.descriptors.forEach((desc, id) => {
      defaults[id] = desc.defaultValue;
    });
    return defaults;
  }

  public getAllStates(): Record<string, boolean> {
    return { ...this.getStoredStates() };
  }

  public getAllDescriptors(): readonly FeatureDescriptor[] {
    return Array.from(this.descriptors.values()).sort(
      (a, b) => (a.order ?? DEFAULT_FEATURE_ORDER) - (b.order ?? DEFAULT_FEATURE_ORDER)
    );
  }

  public isEnabled(id: string): boolean {
    const states = this.getStoredStates();
    return typeof states[id] === "boolean" ? states[id] : (this.descriptors.get(id)?.defaultValue ?? true);
  }

  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    const prevStates = { ...this.getStoredStates() };
    const prev = prevStates[id];
    if (prev === enabled) {
      return;
    }

    const latestStored = StorageUtil.getValue<Record<string, boolean>>(
      StorageUtil.keys.youtube.functionState,
      {}
    );
    const nextStates: Record<string, boolean> = {
      ...this.getStoredStates(),
      ...(latestStored || {}),
      [id]: enabled
    };
    this.saveStoredStates(nextStates);

    const desc = this.descriptors.get(id);
    if (desc && this.isInitialized) {
      try {
        if (enabled) {
          await desc.setup();
        } else if (desc.teardown) {
          await desc.teardown();
        }
      } catch (err: unknown) {
        console.error(`[FeatureRegistry] Error toggling ${id}:`, err);
        prevStates[id] = prev;
        this.saveStoredStates(prevStates);
        throw err;
      }
    }
  }

  public async initAll(): Promise<void> {
    if (typeof window !== "undefined" && !/youtube\.com/.test(window.location?.host ?? "")) {
      return;
    }
    this.setupStorageListener();
    const states = this.getStoredStates();
    for (const feature of this.getAllDescriptors()) {
      const enabled = typeof states[feature.id] === "boolean" ? states[feature.id] : feature.defaultValue;
      if (enabled) {
        try {
          await feature.setup();
        } catch (err) {
          console.error(`[FeatureRegistry] Failed to initialize ${feature.id}:`, err);
        }
      }
    }
    this.isInitialized = true;
  }

  private setupStorageListener(): void {
    if (this.storageListenerId !== null) {
      return;
    }
    this.storageListenerId = StorageUtil.addChangeListener<Record<string, boolean>>(
      StorageUtil.keys.youtube.functionState,
      (_key: string, _oldVal: Record<string, boolean>, newVal: Record<string, boolean>, remote: boolean) => {
        if (remote) {
          const next = newVal && typeof newVal === "object" ? newVal : {};
          this.handleRemoteStateChange(next).catch((err: unknown) => {
            console.error("[FeatureRegistry] Remote sync error:", err);
          });
        }
      }
    );
  }

  private async handleRemoteStateChange(nextStates: Record<string, boolean>): Promise<void> {
    const prevStates = this.cachedStates || this.getStoredStates();
    this.cachedStates = { ...prevStates, ...nextStates };

    if (!this.isInitialized) {
      return;
    }

    for (const [id, desc] of this.descriptors.entries()) {
      const prev = prevStates[id];
      const next = this.cachedStates[id];
      if (prev !== next && typeof next === "boolean") {
        if (next) {
          try {
            await desc.setup();
          } catch (err) {
            console.error(`[FeatureRegistry] Remote sync setup failed for ${id}:`, err);
          }
        } else if (desc.teardown) {
          try {
            await desc.teardown();
          } catch (err) {
            console.error(`[FeatureRegistry] Remote sync teardown failed for ${id}:`, err);
          }
        }
      }
    }
  }

  private getStoredStates(): Record<string, boolean> {
    if (this.cachedStates !== null) {
      return this.cachedStates;
    }
    const defaultState: Record<string, boolean> = {};
    this.descriptors.forEach((desc, id) => {
      defaultState[id] = desc.defaultValue;
    });
    const stored = StorageUtil.getValue<Record<string, boolean>>(
      StorageUtil.keys.youtube.functionState,
      defaultState
    );
    this.cachedStates = { ...defaultState, ...(stored || {}) };
    return this.cachedStates;
  }

  private saveStoredStates(states: Record<string, boolean>): void {
    this.cachedStates = states;
    StorageUtil.setValue(StorageUtil.keys.youtube.functionState, states);
  }
}
