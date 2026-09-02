import { StorageUtil } from "../core/storage";
import type { FeatureDescriptor } from "../types";

const DEFAULT_FEATURE_ORDER = 100;

export class FeatureRegistry {
  private static instance: FeatureRegistry | null = null;
  private readonly descriptors = new Map<string, FeatureDescriptor>();
  private isInitialized = false;

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

  public static openSettingsModal(): void {
    import("./settings-view").then(({ SettingsModalView }) => {
      SettingsModalView.show();
    });
  }

  public register(descriptor: FeatureDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
  }

  public registerAll(descList: FeatureDescriptor[]): void {
    descList.forEach((d) => this.descriptors.set(d.id, d));
  }

  public getDefaultStates(): Record<string, boolean> {
    const defaults: Record<string, boolean> = {};
    this.descriptors.forEach((desc, id) => {
      defaults[id] = desc.defaultValue;
    });
    return defaults;
  }

  public getAllStates(): Record<string, boolean> {
    return this.getStoredStates();
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
    const states = this.getStoredStates();
    const prev = states[id];
    states[id] = enabled;
    this.saveStoredStates(states);

    const desc = this.descriptors.get(id);
    if (desc && this.isInitialized && prev !== enabled) {
      if (enabled) {
        try {
          await desc.setup();
        } catch (err) {
          console.error(`[FeatureRegistry] Error enabling ${id}:`, err);
        }
      } else if (desc.teardown) {
        try {
          await desc.teardown();
        } catch (err) {
          console.error(`[FeatureRegistry] Error disabling ${id}:`, err);
        }
      }
    }
  }

  public async initAll(): Promise<void> {
    if (typeof window !== "undefined" && !/youtube\.com/.test(window.location?.host ?? "")) {
      return;
    }
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

  private getStoredStates(): Record<string, boolean> {
    const defaultState: Record<string, boolean> = {};
    this.descriptors.forEach((desc, id) => {
      defaultState[id] = desc.defaultValue;
    });
    const stored = StorageUtil.getValue<Record<string, boolean>>(
      StorageUtil.keys.youtube.functionState,
      defaultState
    );
    return { ...defaultState, ...(stored || {}) };
  }

  private saveStoredStates(states: Record<string, boolean>): void {
    StorageUtil.setValue(StorageUtil.keys.youtube.functionState, states);
  }
}
