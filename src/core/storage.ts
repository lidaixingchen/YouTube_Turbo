export const StorageKeys = {
  youtube: {
    videoPlaySpeed: "yt/videoPlaySpeed",
    functionState: "yt/functionState_01",
    videoLoop: "py/videoLoop",
    theme: "yt/theme",
    downloadingConfirm: "yt/downloadingConfirm",
    subtitleOffset: "yt/subtitleOffset"
  }
} as const;

export type StorageChangeListener<T = unknown> = (
  key: string,
  oldValue: T,
  newValue: T,
  remote: boolean
) => void;

export type StorageListenerId = number | string;

export const StorageUtil = {
  keys: StorageKeys,

  isPersistenceAvailable(): boolean {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  },

  getValue<T>(key: string, defaultValue: T): T {
    if (typeof GM_getValue === "function") {
      return GM_getValue(key, defaultValue);
    }
    return defaultValue;
  },

  setValue<T>(key: string, value: T): void {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
    }
  },

  deleteValue(key: string): void {
    if (typeof GM_deleteValue === "function") {
      GM_deleteValue(key);
    }
  },

  addChangeListener<T = unknown>(
    key: string,
    callback: StorageChangeListener<T>
  ): StorageListenerId | null {
    if (typeof GM_addValueChangeListener === "function") {
      return GM_addValueChangeListener(
        key,
        (k: string, oldVal: unknown, newVal: unknown, remote: boolean) => {
          try {
            callback(k, oldVal as T, newVal as T, remote);
          } catch (err: unknown) {
            console.error(`[StorageUtil] Listener callback error for "${key}":`, err);
          }
        }
      );
    }
    return null;
  },

  removeChangeListener(listenerId: StorageListenerId | null): void {
    if (listenerId !== null && typeof GM_removeValueChangeListener === "function") {
      GM_removeValueChangeListener(listenerId as number);
    }
  }
};
