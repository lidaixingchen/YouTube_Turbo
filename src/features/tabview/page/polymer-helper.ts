import { PAGE_CONSTANTS } from "./constants";
import type { PolymerElementInstance, PolymerControllerPrototype } from "./types";

export class PolymerHelper {
  public static insp(element: unknown): PolymerElementInstance | null {
    if (!element || typeof element !== "object") {
      return null;
    }
    const polyEl = element as PolymerElementInstance;
    const controller = polyEl.polymerController || polyEl.inst || polyEl;
    return typeof controller === "object" && controller !== null ? (controller as PolymerElementInstance) : null;
  }

  public static async retrieveCE(tagName: string): Promise<PolymerControllerPrototype | null> {
    if (typeof customElements === "undefined" || typeof customElements.whenDefined !== "function") {
      return null;
    }
    try {
      await customElements.whenDefined(tagName);
      const liveElement = document.querySelector(tagName);
      const dummy = liveElement || document.createElement(tagName);
      const inspected = this.insp(dummy);
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
