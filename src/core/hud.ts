import { ReactiveDOMRegistry } from "./dom-registry";
import { StyleEngine } from "./style-engine";

export const HUD_CONSTANTS = {
  ELEMENT_ID: "youtube-extension-text-box",
  ELEMENT_CLASS: "youtube-turbo-playback-hud",
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
  let ownedElement: HTMLElement | null = null;
  let ownedContainer: HTMLElement | null = null;
  let isStyleInjected = false;

  const ensureStyleInjected = (): void => {
    if (isStyleInjected) return;
    const hudStyle = `
      .${HUD_CONSTANTS.ELEMENT_CLASS} {
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

  const cancelActiveAnimation = (): void => {
    if (activeAnimationId !== null) {
      cancelAnimationFrame(activeAnimationId);
      activeAnimationId = null;
    }
  };

  const clearOwnedElement = (): void => {
    cancelActiveAnimation();
    if (ownedElement && ownedContainer?.contains(ownedElement)) {
      ownedElement.style.display = "none";
      ownedElement.remove();
    }
    ownedElement = null;
    ownedContainer = null;
  };

  const getOrCreateElement = (container: HTMLElement): HTMLElement => {
    if (ownedContainer !== container) {
      clearOwnedElement();
    }

    if (ownedElement && ownedElement.isConnected && container.contains(ownedElement)) {
      return ownedElement;
    }

    if (ownedElement) {
      clearOwnedElement();
    }

    ensureStyleInjected();
    const element: HTMLElement = document.createElement("div");
    element.id = HUD_CONSTANTS.ELEMENT_ID;
    element.className = HUD_CONSTANTS.ELEMENT_CLASS;
    container.appendChild(element);
    ownedElement = element;
    ownedContainer = container;
    return element;
  };

  const show = (message: string, options: HUDShowOptions = {}): void => {
    const container: HTMLElement | null = ReactiveDOMRegistry.getInstance().getPlayerContainer();
    if (!container) {
      clearOwnedElement();
      return;
    }

    const duration: number = options.durationMs || HUD_CONSTANTS.DEFAULT_DURATION_MS;
    const peakOpacity: number = options.peakOpacity ?? HUD_CONSTANTS.PEAK_OPACITY;

    const element: HTMLElement = getOrCreateElement(container);
    cancelActiveAnimation();

    element.textContent = message;
    element.style.display = "inline-flex";
    element.style.opacity = String(peakOpacity);

    const startTime: number = performance.now();
    const fadeStep: FrameRequestCallback = (timestamp: number): void => {
      if (ownedElement !== element || ownedContainer !== container) return;

      const elapsed: number = timestamp - startTime;
      const progress: number = Math.min(elapsed / duration, 1);
      const currentOpacity: number = peakOpacity * (1 - progress);
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
    cancelActiveAnimation();
    if (ownedElement && ownedContainer?.contains(ownedElement)) {
      ownedElement.style.display = "none";
    }
  };

  const destroy = (): void => {
    clearOwnedElement();
    StyleEngine.remove(HUD_CONSTANTS.STYLE_ID);
    isStyleInjected = false;
  };

  return {
    show,
    hide,
    destroy
  };
})();
