import { TOOLBAR_CONSTANTS } from "./constants";
import type { PopoverController, PopoverState } from "./types";

export class PopoverEngine {
  public static bind(triggerBtn: HTMLElement, containerEl: HTMLElement, playerEl: HTMLElement): PopoverController {
    let currentState: PopoverState = "closed";
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = (): void => {
      if (showTimer !== null) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const applyVisibility = (visible: boolean): void => {
      if (visible) {
        containerEl.style.display = "flex";
        containerEl.style.opacity = "1";
        containerEl.style.pointerEvents = "auto";
        reposition();
      } else {
        containerEl.style.display = "none";
        containerEl.style.opacity = "0";
        containerEl.style.pointerEvents = "none";
      }
    };

    const reposition = (): void => {
      if (currentState === "closed" || !playerEl.isConnected || !triggerBtn.isConnected) {
        return;
      }
      const playerRect = playerEl.getBoundingClientRect();
      const btnRect = triggerBtn.getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();

      if (playerRect.width === 0 || containerRect.width === 0) {
        return;
      }

      const idealLeft = btnRect.left - playerRect.left + btnRect.width / 2 - containerRect.width / 2;
      const maxLeft = playerRect.width - containerRect.width - TOOLBAR_CONSTANTS.POPOVER_SAFETY_MARGIN_PX;
      const clampedLeft = Math.max(TOOLBAR_CONSTANTS.POPOVER_SAFETY_MARGIN_PX, Math.min(maxLeft, idealLeft));

      containerEl.style.transform = `translate3d(${Math.round(clampedLeft)}px, 0, 0)`;
    };

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!triggerBtn.contains(target) && !containerEl.contains(target)) {
        close();
      }
    };

    const open = (mode: "hover" | "pinned"): void => {
      clearTimers();
      const prevState = currentState;
      currentState = mode;
      applyVisibility(true);

      if (mode === "pinned" && prevState !== "pinned") {
        document.addEventListener("pointerdown", handleOutsidePointerDown, true);
      }
    };

    const close = (): void => {
      clearTimers();
      if (currentState === "pinned") {
        document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      }
      currentState = "closed";
      applyVisibility(false);
    };

    const onTriggerMouseEnter = (): void => {
      if (currentState === "pinned") return;
      clearTimers();
      showTimer = setTimeout(() => {
        open("hover");
      }, TOOLBAR_CONSTANTS.POPOVER_HOVER_SHOW_DELAY_MS);
    };

    const onTriggerMouseLeave = (): void => {
      if (currentState === "pinned") return;
      clearTimers();
      hideTimer = setTimeout(() => {
        close();
      }, TOOLBAR_CONSTANTS.POPOVER_HOVER_HIDE_DELAY_MS);
    };

    const onContainerMouseEnter = (): void => {
      if (currentState === "pinned") return;
      clearTimers();
    };

    const onContainerMouseLeave = (): void => {
      if (currentState === "pinned") return;
      clearTimers();
      hideTimer = setTimeout(() => {
        close();
      }, TOOLBAR_CONSTANTS.POPOVER_HOVER_HIDE_DELAY_MS);
    };

    const onTriggerClick = (e: MouseEvent): void => {
      e.stopPropagation();
      if (currentState === "pinned") {
        close();
      } else {
        open("pinned");
      }
    };

    const onWindowResize = (): void => {
      if (currentState !== "closed") {
        reposition();
      }
    };

    triggerBtn.addEventListener("mouseenter", onTriggerMouseEnter);
    triggerBtn.addEventListener("mouseleave", onTriggerMouseLeave);
    triggerBtn.addEventListener("click", onTriggerClick);
    containerEl.addEventListener("mouseenter", onContainerMouseEnter);
    containerEl.addEventListener("mouseleave", onContainerMouseLeave);
    window.addEventListener("resize", onWindowResize);

    const destroy = (): void => {
      close();
      triggerBtn.removeEventListener("mouseenter", onTriggerMouseEnter);
      triggerBtn.removeEventListener("mouseleave", onTriggerMouseLeave);
      triggerBtn.removeEventListener("click", onTriggerClick);
      containerEl.removeEventListener("mouseenter", onContainerMouseEnter);
      containerEl.removeEventListener("mouseleave", onContainerMouseLeave);
      window.removeEventListener("resize", onWindowResize);
    };

    return {
      open,
      close,
      getState: () => currentState,
      reposition,
      destroy
    };
  }
}
