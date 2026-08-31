import { YouTubeDOMAdapter } from "./dom-adapter";

export const HUD_CONSTANTS = {
  ELEMENT_ID: "youtube-extension-text-box",
  DEFAULT_DURATION_MS: 1200,
  PEAK_OPACITY: 0.8,
  Z_INDEX: 2147483640
} as const;

export interface HUDShowOptions {
  durationMs?: number;
  peakOpacity?: number;
}

export const PlaybackHUD = (() => {
  let activeAnimationId: number | null = null;
  let cachedElement: HTMLElement | null = null;

  const getOrCreateElement = (): HTMLElement | null => {
    let element = document.getElementById(HUD_CONSTANTS.ELEMENT_ID);
    if (!element) {
      const container = YouTubeDOMAdapter.getPlayerContainer();
      if (container) {
        element = document.createElement("div");
        element.id = HUD_CONSTANTS.ELEMENT_ID;
        container.appendChild(element);
      }
    }
    cachedElement = element;
    return element;
  };

  const show = (message: string, options: HUDShowOptions = {}): void => {
    const duration = options.durationMs || HUD_CONSTANTS.DEFAULT_DURATION_MS;
    const peakOpacity = options.peakOpacity ?? HUD_CONSTANTS.PEAK_OPACITY;

    const element = getOrCreateElement();
    if (!element) return;

    element.textContent = message;
    element.style.display = "block";
    element.style.opacity = String(peakOpacity);

    if (activeAnimationId) {
      cancelAnimationFrame(activeAnimationId);
      activeAnimationId = null;
    }

    const startTime = performance.now();
    const fadeStep = (timestamp: number) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentOpacity = peakOpacity * (1 - progress);
      element.style.opacity = String(currentOpacity);

      if (progress < 1) {
        activeAnimationId = requestAnimationFrame(fadeStep);
      } else {
        element.style.display = "none";
        activeAnimationId = null;
      }
    };

    activeAnimationId = requestAnimationFrame(fadeStep);
  };

  const hide = (): void => {
    if (activeAnimationId) {
      cancelAnimationFrame(activeAnimationId);
      activeAnimationId = null;
    }
    const element = document.getElementById(HUD_CONSTANTS.ELEMENT_ID) || cachedElement;
    if (element) {
      element.style.display = "none";
    }
  };

  const destroy = (): void => {
    hide();
    const element = document.getElementById(HUD_CONSTANTS.ELEMENT_ID) || cachedElement;
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
    cachedElement = null;
  };

  return {
    show,
    hide,
    destroy
  };
})();
