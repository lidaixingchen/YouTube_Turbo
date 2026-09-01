import { ReactiveDOMRegistry } from "./dom-registry";
import { StyleEngine } from "./style-engine";

export const HUD_CONSTANTS = {
  ELEMENT_ID: "youtube-extension-text-box",
  STYLE_ID: "playback-hud",
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
  let isStyleInjected = false;

  const ensureStyleInjected = (): void => {
    if (isStyleInjected) return;
    const hudStyle = `
      #${HUD_CONSTANTS.ELEMENT_ID} {
        position: absolute !important;
        margin: auto !important;
        top: 0px !important;
        right: 0px !important;
        bottom: 0px !important;
        left: 0px !important;
        min-width: 80px !important;
        width: max-content !important;
        max-width: 80% !important;
        min-height: 80px !important;
        height: auto !important;
        padding: 0 20px !important;
        border-radius: 20px !important;
        font-size: 24px !important;
        font-weight: bold !important;
        color: #f3f3f3 !important;
        background: rgba(0, 0, 0, 0.7) !important;
        z-index: ${HUD_CONSTANTS.Z_INDEX} !important;
        opacity: ${HUD_CONSTANTS.PEAK_OPACITY} !important;
        display: none;
        box-sizing: border-box !important;
        text-align: center !important;
        align-items: center !important;
        justify-content: center !important;
        pointer-events: none !important;
        user-select: none !important;
        white-space: nowrap !important;
      }
    `;
    StyleEngine.inject(HUD_CONSTANTS.STYLE_ID, hudStyle);
    isStyleInjected = true;
  };

  const getOrCreateElement = (): HTMLElement | null => {
    ensureStyleInjected();
    let element = document.getElementById(HUD_CONSTANTS.ELEMENT_ID);
    if (!element) {
      const container = ReactiveDOMRegistry.getInstance().getPlayerContainer();
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
    element.style.display = "inline-flex";
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
    StyleEngine.remove(HUD_CONSTANTS.STYLE_ID);
    isStyleInjected = false;
  };

  return {
    show,
    hide,
    destroy
  };
})();
