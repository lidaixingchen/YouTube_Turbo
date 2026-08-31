import { TOOLBAR_CONSTANTS } from "./constants";

export interface SlotConfig {
  containerSelector: string;
  targetSelector: string;
  elementId: string;
  mount: (target: HTMLElement, element: HTMLElement) => void;
}

export const MountAdapter = (() => {
  const slots: Record<string, SlotConfig> = {
    [TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS]: {
      containerSelector: "#player-container-outer .html5-video-player, #movie_player",
      targetSelector: ".ytp-right-controls",
      elementId: "yt_extension_toolbox_root",
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (!target.contains(element)) {
          target.prepend(element);
        }
      }
    },
    [TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS]: {
      containerSelector: "ytd-shorts",
      targetSelector: "#navigation-button-down",
      elementId: "script_download_shorts",
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (!target.parentElement?.contains(element)) {
          target.after(element);
        }
      }
    },
    [TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA]: {
      containerSelector: "ytd-watch-metadata",
      targetSelector: "#owner, #actions",
      elementId: "script_outer_box",
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (target.id === "owner") {
          if (!target.contains(element)) {
            target.appendChild(element);
          }
        } else {
          if (!target.contains(element)) {
            target.insertBefore(element, target.firstChild);
          }
        }
      }
    }
  };

  const registeredSlots = new Map<string, () => HTMLElement | null>();
  let mutationObserver: MutationObserver | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isListenerBound = false;

  const tryMountSlot = (slotKey: string): boolean => {
    const slotDef = slots[slotKey];
    const renderFn = registeredSlots.get(slotKey);
    if (!slotDef || !renderFn) {
      return false;
    }

    const existing = document.getElementById(slotDef.elementId);
    if (existing && existing.isConnected) {
      return true;
    }

    if (slotKey === TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS && !window.location.pathname.startsWith("/shorts")) {
      return false;
    }

    const target = document.querySelector<HTMLElement>(slotDef.targetSelector);
    if (target && target.isConnected) {
      const renderedEl = renderFn();
      if (renderedEl) {
        slotDef.mount(target, renderedEl);
        return true;
      }
    }
    return false;
  };

  const refreshAllSlots = (): void => {
    for (const slotKey of registeredSlots.keys()) {
      tryMountSlot(slotKey);
    }
  };

  const startGuardian = (): void => {
    if (intervalId === null && typeof window !== "undefined") {
      intervalId = setInterval(() => {
        refreshAllSlots();
      }, 500);
    }

    if (!isListenerBound && typeof document !== "undefined") {
      isListenerBound = true;
      const onNavigate = (): void => {
        refreshAllSlots();
      };
      document.addEventListener("yt-navigate-finish", onNavigate, false);
      document.addEventListener("yt-page-type-changed", onNavigate, false);
      document.addEventListener("DOMContentLoaded", onNavigate, { once: true });
    }
  };

  return {
    slots,

    mountSlot(slotKey: string, renderFn: () => HTMLElement | null): void {
      registeredSlots.set(slotKey, renderFn);
      startGuardian();
      tryMountSlot(slotKey);
    },

    unmountSlot(slotKey: string): void {
      registeredSlots.delete(slotKey);
      const slotDef = slots[slotKey];
      if (slotDef) {
        const el = document.getElementById(slotDef.elementId);
        if (el) {
          el.remove();
        }
      }
    },

    refreshAll(): void {
      refreshAllSlots();
    },

    destroy(): void {
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      registeredSlots.clear();
    }
  };
})();
