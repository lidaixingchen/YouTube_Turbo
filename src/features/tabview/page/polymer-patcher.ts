import { PolymerHelper } from "./polymer-helper";
import { PAGE_CONSTANTS } from "./constants";

type MethodPatchRecord = {
  proto: Record<string, any>;
  methodName: string;
  originalMethod: (...args: unknown[]) => unknown;
};

export class PolymerPatcher {
  private static instance: PolymerPatcher | null = null;
  private patches: MethodPatchRecord[] = [];
  private secondaryInnerHold: number = 0;
  private isPatched: boolean = false;

  public static getInstance(): PolymerPatcher {
    if (!PolymerPatcher.instance) {
      PolymerPatcher.instance = new PolymerPatcher();
    }
    return PolymerPatcher.instance;
  }

  public runInProtectedContext<R>(callback: () => R): R {
    if (this.secondaryInnerHold > 0) {
      this.secondaryInnerHold++;
      try {
        return callback();
      } finally {
        this.secondaryInnerHold--;
      }
    }

    const primarySecondaryInner = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER);
    const wrapperSecondaryInner = document.querySelector<HTMLElement>("secondary-wrapper#secondary-inner-wrapper");

    if (primarySecondaryInner && wrapperSecondaryInner) {
      this.secondaryInnerHold++;
      primarySecondaryInner.id = "secondary-inner-";
      wrapperSecondaryInner.id = "secondary-inner";
      try {
        return callback();
      } finally {
        primarySecondaryInner.id = "secondary-inner";
        wrapperSecondaryInner.id = "secondary-inner-wrapper";
        this.secondaryInnerHold--;
      }
    }

    return callback();
  }

  public async applyPatches(): Promise<void> {
    if (this.isPatched) {
      return;
    }

    const flexyProto = await PolymerHelper.retrieveCE(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (!flexyProto) {
      return;
    }

    this.patchFlexyLayoutMethods(flexyProto);
    this.isPatched = true;
  }

  public restorePatches(): void {
    for (const record of this.patches) {
      try {
        record.proto[record.methodName] = record.originalMethod;
      } catch (err) {
        console.warn(`[PolymerPatcher] Failed to restore method '${record.methodName}':`, err);
      }
    }
    this.patches = [];
    this.isPatched = false;
    this.secondaryInnerHold = 0;
  }

  private patchFlexyLayoutMethods(proto: Record<string, any>): void {
    if (typeof proto.updateChatLocation === "function") {
      this.hookMethod(proto, "updateChatLocation", (originalFn) => {
        const self = this;
        return function (this: any, ...args: unknown[]) {
          if (this.is !== "ytd-watch-grid") {
            return self.runInProtectedContext(() => {
              if (typeof this.updatePageMediaQueries === "function") {
                this.updatePageMediaQueries();
              }
              if (typeof this.schedulePlayerSizeUpdate_ === "function") {
                this.schedulePlayerSizeUpdate_();
              }
            });
          }
          return originalFn.apply(this, args);
        };
      });
    }

    const protectedMethods = [
      "isTwoColumnsChanged_",
      "defaultTwoColumnLayoutChanged",
      "updatePlayerLocation",
      "updateCinematicsLocation",
      "updatePanelsLocation",
      "swatcherooUpdatePanelsLocation",
      "updateErrorScreenLocation",
      "updateFullBleedElementLocations"
    ];

    for (const methodName of protectedMethods) {
      if (typeof proto[methodName] === "function") {
        this.hookMethod(proto, methodName, (originalFn) => {
          const self = this;
          return function (this: any, ...args: unknown[]) {
            return self.runInProtectedContext(() => {
              return originalFn.apply(this, args);
            });
          };
        });
      }
    }
  }

  private hookMethod(
    proto: Record<string, any>,
    methodName: string,
    factory: (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown
  ): void {
    const originalMethod = proto[methodName];
    if (typeof originalMethod !== "function") {
      return;
    }

    this.patches.push({
      proto,
      methodName,
      originalMethod
    });

    proto[methodName] = factory(originalMethod);
  }
}
