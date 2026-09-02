import type { SlotDefinition } from "./types";
import { TOOLBAR_CONSTANTS } from "./constants";

export class SlotMountBus {
  private static instance: SlotMountBus | null = null;
  private registeredSlots = new Map<string, { definition: SlotDefinition; renderer: () => HTMLElement | null }>();
  private pendingSlots = new Set<string>();
  private activeObserver: MutationObserver | null = null;
  private safetyTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private isNavigationBound = false;
  private navigationHandler: (() => void) | null = null;

  public static getInstance(): SlotMountBus {
    if (!this.instance) {
      this.instance = new SlotMountBus();
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
    this.tryMountSingleSlot(definition.slotKey);
  }

  public unmountSlot(slotKey: string): void {
    this.pendingSlots.delete(slotKey);
    const entry = this.registeredSlots.get(slotKey);
    if (entry) {
      try {
        entry.definition.unmount?.();
      } catch (err: unknown) {
        console.error(`[SlotMountBus] error unmounting slot "${slotKey}":`, err);
      }
      const el = document.getElementById(entry.definition.elementId);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
    this.registeredSlots.delete(slotKey);
    if (this.pendingSlots.size === 0) {
      this.stopObserver();
    }
  }

  public refreshSlot(slotKey: string): void {
    this.tryMountSingleSlot(slotKey);
  }

  public refreshAll(): void {
    const currentUrl = new URL(window.location.href);

    for (const [slotKey, entry] of this.registeredSlots.entries()) {
      const { definition, renderer } = entry;
      const isApplicable = definition.isApplicable ? definition.isApplicable(currentUrl) : true;

      if (!isApplicable) {
        this.pendingSlots.delete(slotKey);
        try {
          definition.unmount?.();
        } catch (err: unknown) {
          console.error(`[SlotMountBus] error unmounting slot "${slotKey}":`, err);
        }
        const existing = document.getElementById(definition.elementId);
        if (existing && existing.parentNode) {
          existing.parentNode.removeChild(existing);
        }
        continue;
      }

      const existing = document.getElementById(definition.elementId);
      if (existing && existing.isConnected) {
        this.pendingSlots.delete(slotKey);
        continue;
      }

      const target = document.querySelector<HTMLElement>(definition.targetSelector);
      if (target && target.isConnected) {
        const renderedEl = renderer();
        if (renderedEl) {
          definition.mount(target, renderedEl);
          this.pendingSlots.delete(slotKey);
          continue;
        }
      }

      this.pendingSlots.add(slotKey);
    }

    if (this.pendingSlots.size === 0) {
      this.stopObserver();
    } else {
      this.startObserver();
    }
  }

  private tryMountSingleSlot(slotKey: string): boolean {
    const entry = this.registeredSlots.get(slotKey);
    if (!entry) return false;

    const { definition, renderer } = entry;
    const currentUrl = new URL(window.location.href);
    const isApplicable = definition.isApplicable ? definition.isApplicable(currentUrl) : true;

    if (!isApplicable) {
      this.pendingSlots.delete(slotKey);
      try {
        definition.unmount?.();
      } catch (err: unknown) {
        console.error(`[SlotMountBus] error unmounting slot "${slotKey}":`, err);
      }
      const existing = document.getElementById(definition.elementId);
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      if (this.pendingSlots.size === 0) {
        this.stopObserver();
      }
      return false;
    }

    const existing = document.getElementById(definition.elementId);
    if (existing && existing.isConnected) {
      this.pendingSlots.delete(slotKey);
      if (this.pendingSlots.size === 0) {
        this.stopObserver();
      }
      return true;
    }

    const target = document.querySelector<HTMLElement>(definition.targetSelector);
    if (target && target.isConnected) {
      const renderedEl = renderer();
      if (renderedEl) {
        definition.mount(target, renderedEl);
        this.pendingSlots.delete(slotKey);
        if (this.pendingSlots.size === 0) {
          this.stopObserver();
        }
        return true;
      }
    }

    this.pendingSlots.add(slotKey);
    this.startObserver();
    return false;
  }

  private startObserver(): void {
    if (this.activeObserver || this.pendingSlots.size === 0) {
      return;
    }

    const container =
      document.querySelector<HTMLElement>("ytd-watch-flexy, ytd-shorts, #page-manager, #content") ||
      document.body;

    if (!container) return;

    this.activeObserver = new MutationObserver(() => {
      this.processPendingSlots();
    });

    this.activeObserver.observe(container, {
      childList: true,
      subtree: true
    });

    if (this.safetyTimeoutTimer !== null) {
      clearTimeout(this.safetyTimeoutTimer);
    }
    this.safetyTimeoutTimer = setTimeout(() => {
      this.stopObserver();
    }, TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS);
  }

  private processPendingSlots(): void {
    for (const slotKey of Array.from(this.pendingSlots)) {
      const entry = this.registeredSlots.get(slotKey);
      if (!entry) {
        this.pendingSlots.delete(slotKey);
        continue;
      }

      const { definition, renderer } = entry;
      const target = document.querySelector<HTMLElement>(definition.targetSelector);
      if (target && target.isConnected) {
        const renderedEl = renderer();
        if (renderedEl) {
          definition.mount(target, renderedEl);
        }
        this.pendingSlots.delete(slotKey);
      }
    }

    if (this.pendingSlots.size === 0) {
      this.stopObserver();
    }
  }

  private stopObserver(): void {
    if (this.activeObserver) {
      this.activeObserver.disconnect();
      this.activeObserver = null;
    }
    if (this.safetyTimeoutTimer !== null) {
      clearTimeout(this.safetyTimeoutTimer);
      this.safetyTimeoutTimer = null;
    }
    this.pendingSlots.clear();
  }

  public destroy(): void {
    this.stopObserver();
    for (const [slotKey, entry] of this.registeredSlots.entries()) {
      try {
        entry.definition.unmount?.();
      } catch (err: unknown) {
        console.error(`[SlotMountBus] error unmounting slot "${slotKey}":`, err);
      }
      const el = document.getElementById(entry.definition.elementId);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
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
