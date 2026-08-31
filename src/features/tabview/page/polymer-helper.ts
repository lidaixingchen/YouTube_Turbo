import { PAGE_CONSTANTS } from "./constants";
import type { PolymerElementInstance } from "./types";

export class PolymerHelper {
  public static insp(element: unknown): Record<string, any> | null {
    if (!element || typeof element !== "object") {
      return null;
    }
    const polyEl = element as PolymerElementInstance;
    const controller = polyEl.polymerController || polyEl.inst || polyEl;
    return typeof controller === "object" && controller !== null ? (controller as Record<string, any>) : null;
  }

  public static async retrieveCE(tagName: string): Promise<any> {
    if (typeof customElements === "undefined" || typeof customElements.whenDefined !== "function") {
      return null;
    }
    await customElements.whenDefined(tagName);
    const ctor = customElements.get(tagName);
    return ctor ? ctor.prototype : null;
  }

  public static getSuitableElement<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
    const matched = root.querySelectorAll<T>(selector);
    if (matched.length === 0) {
      return null;
    }
    if (matched.length === 1) {
      return matched[0];
    }

    let bestElement: T | null = null;
    let maxChildCount = -1;
    for (let i = 0; i < matched.length; i++) {
      const el = matched[i];
      const childCount = el.getElementsByTagName("*").length;
      if (childCount > maxChildCount) {
        maxChildCount = childCount;
        bestElement = el;
      }
    }
    return bestElement;
  }

  public static async waitForElement<T extends Element = HTMLElement>(
    selector: string,
    root: ParentNode = document,
    timeoutMs: number = 10000
  ): Promise<T | null> {
    const existing = this.getSuitableElement<T>(selector, root);
    if (existing) {
      return existing;
    }

    return new Promise<T | null>((resolve) => {
      let resolved = false;
      const observer = new MutationObserver(() => {
        const el = this.getSuitableElement<T>(selector, root);
        if (el) {
          resolved = true;
          observer.disconnect();
          resolve(el);
        }
      });

      const targetNode = root instanceof Node ? root : document.documentElement;
      observer.observe(targetNode, { childList: true, subtree: true });

      setTimeout(() => {
        if (!resolved) {
          observer.disconnect();
          resolve(this.getSuitableElement<T>(selector, root));
        }
      }, timeoutMs);
    });
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
