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

export const StorageUtil = {
  keys: StorageKeys,

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
  }
};
