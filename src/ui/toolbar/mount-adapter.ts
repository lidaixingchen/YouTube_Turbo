import { TOOLBAR_CONSTANTS } from "./constants";

export interface SlotConfig {
  containerSelector: string;
  targetSelector: string;
  mount: (target: HTMLElement, element: HTMLElement) => void;
}

export const MountAdapter = {
  slots: {
    [TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS]: {
      containerSelector: "#player-container-outer .html5-video-player, #movie_player",
      targetSelector: ".ytp-right-controls",
      mount: (target: HTMLElement, element: HTMLElement) => target.prepend(element)
    },
    [TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS]: {
      containerSelector: "ytd-shorts",
      targetSelector: "#navigation-button-down",
      mount: (target: HTMLElement, element: HTMLElement) => target.after(element)
    },
    [TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA]: {
      containerSelector: "ytd-watch-metadata",
      targetSelector: "#owner, #actions",
      mount: (target: HTMLElement, element: HTMLElement) => {
        if (target.id === "owner") {
          target.appendChild(element);
        } else {
          target.insertBefore(element, target.firstChild);
        }
      }
    }
  } as Record<string, SlotConfig>,

  activeObservers: new Map<string, MutationObserver>(),

  mountSlot(slotKey: string, renderFn: () => HTMLElement | null): void {
    this.unmountSlot(slotKey);
    const slotDef = this.slots[slotKey];
    if (!slotDef) return;

    const tryMount = (): boolean => {
      const target = document.querySelector<HTMLElement>(slotDef.targetSelector);
      if (target) {
        const renderedEl = renderFn();
        if (renderedEl) {
          slotDef.mount(target, renderedEl);
        }
        return true;
      }
      return false;
    };

    if (tryMount()) return;

    const observer = new MutationObserver(() => {
      if (tryMount()) {
        observer.disconnect();
        this.activeObservers.delete(slotKey);
      }
    });

    const rootContainer = document.querySelector<HTMLElement>(slotDef.containerSelector) || document.body;
    observer.observe(rootContainer, { childList: true, subtree: true });
    this.activeObservers.set(slotKey, observer);
  },

  unmountSlot(slotKey: string): void {
    const observer = this.activeObservers.get(slotKey);
    if (observer) {
      observer.disconnect();
      this.activeObservers.delete(slotKey);
    }
  },

  destroy(): void {
    this.activeObservers.forEach((obs) => obs.disconnect());
    this.activeObservers.clear();
  }
};
