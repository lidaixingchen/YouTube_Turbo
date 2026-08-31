import { PAGE_CONSTANTS } from "./constants";

export interface PolymerElementInstance extends HTMLElement {
  polymerController?: Record<string, unknown>;
  inst?: Record<string, unknown>;
}

export type AnyFunction = (...args: unknown[]) => unknown;

export class PolymerPatcher {
  private static instance: PolymerPatcher | null = null;
  private isPatched: boolean = false;
  private protectionDepth: number = 0;
  private originalMethods: Map<string, AnyFunction> = new Map();
  private targetPrototype: Record<string, unknown> | null = null;

  public static getInstance(): PolymerPatcher {
    if (!PolymerPatcher.instance) {
      PolymerPatcher.instance = new PolymerPatcher();
    }
    return PolymerPatcher.instance;
  }

  public runInProtectedContext<R>(callback: () => R): R {
    if (this.protectionDepth > 0) {
      this.protectionDepth++;
      try {
        return callback();
      } finally {
        this.protectionDepth--;
      }
    }

    const ea = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER);
    const eb = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.SECONDARY_INNER_WRAPPER);
    if (ea && eb) {
      this.protectionDepth++;
      ea.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER_TEMP;
      eb.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
      try {
        return callback();
      } finally {
        ea.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER;
        eb.id = PAGE_CONSTANTS.IDS.SECONDARY_INNER_WRAPPER;
        this.protectionDepth--;
      }
    }

    return callback();
  }

  public applyPatches(): void {
    if (this.isPatched) {
      return;
    }
    this.isPatched = true;

    if (typeof customElements !== "undefined") {
      customElements
        .whenDefined(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY)
        .then(() => {
          const dummy = (document.querySelector(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY) ||
            document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY)) as PolymerElementInstance;
          const cnt = dummy.polymerController || dummy.inst || dummy;
          const proto = Object.getPrototypeOf(cnt) as Record<string, unknown> | null;
          if (!proto) {
            return;
          }

          this.targetPrototype = proto;
          const methodsToWrap: ReadonlyArray<string> = [
            "isTwoColumnsChanged_",
            "defaultTwoColumnLayoutChanged"
          ];

          const patcher = this;
          for (const method of methodsToWrap) {
            const rawMethod = proto[method];
            if (typeof rawMethod === "function" && !this.originalMethods.has(method)) {
              this.originalMethods.set(method, rawMethod as AnyFunction);
              proto[method] = function (this: unknown, ...args: unknown[]): unknown {
                return patcher.runInProtectedContext(() => {
                  return (rawMethod as AnyFunction).apply(this, args);
                });
              };
            }
          }
        })
        .catch((err: unknown) => {
          console.warn("[PolymerPatcher] Failed to patch custom elements:", err);
        });
    }
  }

  public restorePatches(): void {
    if (this.targetPrototype && this.originalMethods.size > 0) {
      for (const [method, rawMethod] of this.originalMethods.entries()) {
        this.targetPrototype[method] = rawMethod;
      }
      this.originalMethods.clear();
      this.targetPrototype = null;
    }
    this.isPatched = false;
    this.protectionDepth = 0;
  }

  public patchFlexyInstance(_element: HTMLElement): void {
    this.applyPatches();
  }
}

