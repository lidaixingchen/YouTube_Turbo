import { PAGE_CONSTANTS } from "./constants";
import type { PolymerElementInstance, PolymerControllerPrototype } from "./types";

interface CeWaitSubscription {
  settled: boolean;
  readonly settle: (prototype: PolymerControllerPrototype | null) => void;
  readonly signal: AbortSignal | null;
  readonly onAbort: (() => void) | null;
}

interface CeWaitEntry {
  readonly subscriptions: Set<CeWaitSubscription>;
}

const ceWaitEntries: Map<string, CeWaitEntry> = new Map<string, CeWaitEntry>();

function settleCeSubscription(
  entry: CeWaitEntry,
  subscription: CeWaitSubscription,
  prototype: PolymerControllerPrototype | null
): void {
  if (subscription.settled) {
    return;
  }
  subscription.settled = true;
  entry.subscriptions.delete(subscription);
  if (subscription.signal !== null && subscription.onAbort !== null) {
    subscription.signal.removeEventListener("abort", subscription.onAbort);
  }
  subscription.settle(prototype);
}

export class PolymerHelper {
  public static insp(element: unknown): PolymerElementInstance | null {
    if (!element || typeof element !== "object") {
      return null;
    }
    const polyEl = element as PolymerElementInstance;
    const controller = polyEl.polymerController || polyEl.inst || polyEl;
    return typeof controller === "object" && controller !== null ? (controller as PolymerElementInstance) : null;
  }

  public static async retrieveCE(
    tagName: string,
    signal?: AbortSignal
  ): Promise<PolymerControllerPrototype | null> {
    if (typeof customElements === "undefined" || typeof customElements.whenDefined !== "function") {
      return null;
    }
    if (signal !== undefined && signal.aborted) {
      return null;
    }

    if (typeof customElements.get === "function" && customElements.get(tagName)) {
      return PolymerHelper.resolveControllerPrototype(tagName);
    }

    const entry: CeWaitEntry = PolymerHelper.ensureWaitEntry(tagName);

    return new Promise<PolymerControllerPrototype | null>((resolve: (value: PolymerControllerPrototype | null) => void): void => {
      const subscription: CeWaitSubscription = {
        settled: false,
        settle: resolve,
        signal: signal ?? null,
        onAbort: signal
          ? (): void => {
              settleCeSubscription(entry, subscription, null);
            }
          : null
      };
      if (signal !== undefined && subscription.onAbort !== null) {
        signal.addEventListener("abort", subscription.onAbort, { once: true });
      }
      entry.subscriptions.add(subscription);
    });
  }

  public static getDefinedPrototype(tagName: string): PolymerControllerPrototype | null {
    if (typeof customElements === "undefined" || typeof customElements.get !== "function") {
      return null;
    }
    if (!customElements.get(tagName)) {
      return null;
    }
    return PolymerHelper.resolveControllerPrototype(tagName);
  }

  private static ensureWaitEntry(tagName: string): CeWaitEntry {
    const existing = ceWaitEntries.get(tagName);
    if (existing !== undefined) {
      return existing;
    }

    const created: CeWaitEntry = { subscriptions: new Set<CeWaitSubscription>() };
    ceWaitEntries.set(tagName, created);

    void customElements.whenDefined(tagName).then(
      (): void => {
        if (ceWaitEntries.get(tagName) === created) {
          ceWaitEntries.delete(tagName);
        }
        if (created.subscriptions.size === 0) {
          return;
        }
        const prototype = PolymerHelper.resolveControllerPrototype(tagName);
        for (const subscription of Array.from(created.subscriptions)) {
          settleCeSubscription(created, subscription, prototype);
        }
      },
      (): void => {
        if (ceWaitEntries.get(tagName) === created) {
          ceWaitEntries.delete(tagName);
        }
        for (const subscription of Array.from(created.subscriptions)) {
          settleCeSubscription(created, subscription, null);
        }
      }
    );

    return created;
  }

  private static resolveControllerPrototype(tagName: string): PolymerControllerPrototype | null {
    try {
      const liveElement = document.querySelector(tagName);
      const dummy = liveElement || document.createElement(tagName);
      const inspected = PolymerHelper.insp(dummy);
      const ctor = inspected?.constructor as { prototype?: PolymerControllerPrototype } | undefined;
      return ctor?.prototype ?? null;
    } catch {
      return null;
    }
  }

  public static isTheater(): boolean {
    const flexy = document.querySelector(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    return flexy !== null && flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.THEATER);
  }

  public static toggleTheater(): void {
    const sizeBtn = document.querySelector<HTMLButtonElement>(PAGE_CONSTANTS.SELECTORS.SIZE_BUTTON);
    if (sizeBtn) {
      sizeBtn.click();
    }
  }
}
