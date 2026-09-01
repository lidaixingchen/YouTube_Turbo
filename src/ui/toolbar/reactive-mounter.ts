import type { SlotDefinition } from "./types";
import { TOOLBAR_CONSTANTS } from "./constants";

export class ReactiveMounter {
  private static instance: ReactiveMounter | null = null;
  private registeredSlots = new Map<string, { definition: SlotDefinition; renderer: () => HTMLElement | null }>();
  private activeObservers = new Map<string, MutationObserver>();
  private isNavigationBound = false;
  private navigationHandler: (() => void) | null = null;

  public static getInstance(): ReactiveMounter {
    if (!this.instance) {
      this.instance = new ReactiveMounter();
    }
    return this.instance;
  }

  public bindNavigation(): void {
    if (this.isNavigationBound || typeof document === "undefined") {
      return;
    }
    this.isNavigationBound = true;

    this.navigationHandler = () => {
      this.refreshAll();
    };

    document.addEventListener("yt-navigate-finish", this.navigationHandler, false);
    document.addEventListener("yt-page-type-changed", this.navigationHandler, false);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", this.navigationHandler, { once: true });
    }
  }

  public mountSlot(definition: SlotDefinition, renderer: () => HTMLElement | null): void {
    this.registeredSlots.set(definition.slotKey, { definition, renderer });
    this.bindNavigation();
    this.tryMountSlot(definition.slotKey);
  }

  public tryMountSlot(slotKey: string): boolean {
    const entry = this.registeredSlots.get(slotKey);
    if (!entry) return false;

    const { definition, renderer } = entry;

    const existing = document.getElementById(definition.elementId);
    if (existing && existing.isConnected) {
      this.stopObserver(slotKey);
      return true;
    }

    if (slotKey === TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS && !window.location.pathname.startsWith("/shorts")) {
      this.stopObserver(slotKey);
      return false;
    }

    const target = document.querySelector<HTMLElement>(definition.targetSelector);
    if (target && target.isConnected) {
      const renderedEl = renderer();
      if (renderedEl) {
        definition.mount(target, renderedEl);
        this.stopObserver(slotKey);
        return true;
      }
    }

    this.observeTarget(slotKey, definition);
    return false;
  }

  private observeTarget(slotKey: string, definition: SlotDefinition): void {
    if (this.activeObservers.has(slotKey)) {
      return;
    }

    const container = document.querySelector<HTMLElement>(definition.containerSelector) || document.body;
    if (!container) return;

    const observer = new MutationObserver(() => {
      const target = document.querySelector<HTMLElement>(definition.targetSelector);
      if (target && target.isConnected) {
        const entry = this.registeredSlots.get(slotKey);
        if (entry) {
          const renderedEl = entry.renderer();
          if (renderedEl) {
            definition.mount(target, renderedEl);
          }
        }
        this.stopObserver(slotKey);
      }
    });

    observer.observe(container, { childList: true, subtree: true });
    this.activeObservers.set(slotKey, observer);
  }

  private stopObserver(slotKey: string): void {
    const obs = this.activeObservers.get(slotKey);
    if (obs) {
      obs.disconnect();
      this.activeObservers.delete(slotKey);
    }
  }

  public unmountSlot(slotKey: string): void {
    this.stopObserver(slotKey);
    const entry = this.registeredSlots.get(slotKey);
    if (entry) {
      const el = document.getElementById(entry.definition.elementId);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
    this.registeredSlots.delete(slotKey);
  }

  public refreshSlot(slotKey: string): void {
    this.tryMountSlot(slotKey);
  }

  public refreshAll(): void {
    for (const slotKey of this.registeredSlots.keys()) {
      this.tryMountSlot(slotKey);
    }
  }

  public destroy(): void {
    for (const slotKey of this.activeObservers.keys()) {
      this.stopObserver(slotKey);
    }
    this.registeredSlots.clear();

    if (this.navigationHandler) {
      document.removeEventListener("yt-navigate-finish", this.navigationHandler, false);
      document.removeEventListener("yt-page-type-changed", this.navigationHandler, false);
      this.navigationHandler = null;
    }
    this.isNavigationBound = false;
  }
}
