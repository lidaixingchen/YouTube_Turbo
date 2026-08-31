export interface YTConfigObject {
  INNERTUBE_API_KEY?: string;
  EXPERIMENT_FLAGS?: Record<string, boolean | string | number>;
  EXPERIMENTS_FORCED_FLAGS?: Record<string, boolean | string | number>;
  [key: string]: unknown;
}

export type YTConfigCallback = (config: YTConfigObject) => void;

class ConfigHackRegistry extends Set<YTConfigCallback> {
  private remainingSlots: number;

  constructor(maxExecutions: number = 4) {
    super();
    this.remainingSlots = maxExecutions;
  }

  public override add(callback: YTConfigCallback): this {
    if (this.remainingSlots <= 0) {
      return this;
    }
    if (typeof callback === "function") {
      super.add(callback);
    }
    return this;
  }

  public decrementRemaining(): void {
    this.remainingSlots--;
  }

  public getRemainingSlots(): number {
    return this.remainingSlots;
  }
}

declare global {
  interface Window {
    _ytConfigHacks?: ConfigHackRegistry;
    ytcsi?: Record<string, unknown>;
    yt?: { config_?: YTConfigObject };
    ytcfg?: { data_?: YTConfigObject; get?: (key: string) => unknown };
  }
}

function applyDefaultFlags(config: YTConfigObject): void {
  const flagsToDisable: ReadonlyArray<string> = [
    "kevlar_watch_grid",
    "web_watch_theater_chat",
    "web_watch_chat_hide_button_killswitch",
    "enable_shadydom_free_scoped_node_methods",
    "enable_shadydom_free_scoped_query_methods",
    "enable_shadydom_free_scoped_readonly_properties_batch_one",
    "enable_shadydom_free_parent_node",
    "enable_shadydom_free_children",
    "enable_shadydom_free_last_child"
  ];

  const targets = [config.EXPERIMENT_FLAGS, config.EXPERIMENTS_FORCED_FLAGS];

  for (const flagTarget of targets) {
    if (flagTarget && typeof flagTarget === "object") {
      flagTarget.suppress_error_204_logging = true;
      for (const flag of flagsToDisable) {
        flagTarget[flag] = false;
      }
    }
  }
}

export function setupConfigHacks(targetWindow: Window = typeof unsafeWindow !== "undefined" ? (unsafeWindow as unknown as Window) : window): void {
  if (!targetWindow || targetWindow._ytConfigHacks) {
    return;
  }

  const registry = new ConfigHackRegistry(4);
  targetWindow._ytConfigHacks = registry;

  const triggerCallbacks = (): void => {
    if (registry.getRemainingSlots() < 1) {
      return;
    }

    const configData = targetWindow.yt?.config_ || targetWindow.ytcfg?.data_;
    if (configData && typeof configData.INNERTUBE_API_KEY === "string" && typeof configData.EXPERIMENT_FLAGS === "object") {
      registry.decrementRemaining();
      for (const callback of registry) {
        try {
          callback(configData);
        } catch (err) {
          console.warn("[ConfigHacks] Callback execution error:", err);
        }
      }
    }
  };

  registry.add((config) => {
    applyDefaultFlags(config);
  });

  const onDomReady = (evt?: Event): void => {
    triggerCallbacks();
    if (evt && typeof targetWindow.removeEventListener === "function") {
      targetWindow.removeEventListener("DOMContentLoaded", onDomReady, false);
    }
  };

  const bindProxy = (existingYtcsi?: Record<string, unknown>): boolean => {
    if (existingYtcsi) {
      targetWindow.ytcsi = new Proxy(existingYtcsi, {
        get: (target, prop, receiver) => {
          if (prop === "originalYtcsi") {
            return target;
          }
          triggerCallbacks();
          return Reflect.get(target, prop, receiver);
        }
      });
      return true;
    }
    return false;
  };

  if (!bindProxy(targetWindow.ytcsi)) {
    try {
      Object.defineProperty(targetWindow, "ytcsi", {
        get() {
          return undefined;
        },
        set: (val: Record<string, unknown>) => {
          if (val) {
            delete (targetWindow as any).ytcsi;
            bindProxy(val);
          }
          return true;
        },
        enumerable: false,
        configurable: true
      });
    } catch {
      // 忽略属性定义异常
    }
  }

  const docProto = Document.prototype;
  const rawAddEventListener = docProto.addEventListener;

  const lifecycleEvents = ["yt-page-data-fetched", "yt-navigate-finish", "spfdone"];
  for (const eventName of lifecycleEvents) {
    try {
      rawAddEventListener.call(
        document,
        eventName,
        () => {
          triggerCallbacks();
        },
        { once: true, capture: true }
      );
    } catch {
      // 忽略早期事件注册异常
    }
  }

  try {
    rawAddEventListener.call(
      document,
      "yt-action",
      () => {
        triggerCallbacks();
      },
      { once: true, capture: true }
    );
  } catch {
    // 忽略早期事件注册异常
  }

  if (document.readyState !== "loading") {
    onDomReady();
  } else {
    targetWindow.addEventListener("DOMContentLoaded", onDomReady, false);
  }
}
