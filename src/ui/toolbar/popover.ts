import { TOOLBAR_CONSTANTS } from "./constants";

export class PopoverEngine {
  public static bind(triggerBtn: HTMLElement, containerEl: HTMLElement, playerEl: HTMLElement): () => void {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const show = (): void => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      containerEl.style.display = "block";
      this.reposition(triggerBtn, containerEl, playerEl);
    };

    const scheduleHide = (): void => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        containerEl.style.display = "none";
        hideTimer = null;
      }, TOOLBAR_CONSTANTS.POPOVER_HIDE_DELAY_MS);
    };

    triggerBtn.addEventListener("mouseenter", show);
    triggerBtn.addEventListener("mouseleave", scheduleHide);
    containerEl.addEventListener("mouseenter", show);
    containerEl.addEventListener("mouseleave", scheduleHide);

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      triggerBtn.removeEventListener("mouseenter", show);
      triggerBtn.removeEventListener("mouseleave", scheduleHide);
      containerEl.removeEventListener("mouseenter", show);
      containerEl.removeEventListener("mouseleave", scheduleHide);
    };
  }

  public static reposition(button: HTMLElement, container: HTMLElement, player: HTMLElement): void {
    const playerRect = player.getBoundingClientRect();
    const btnRect = button.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const idealLeft = btnRect.left - playerRect.left - containerRect.width / 2 + btnRect.width / 2;
    const idealTop = btnRect.top - playerRect.top - container.clientHeight;

    const maxLeft = playerRect.width - containerRect.width - TOOLBAR_CONSTANTS.POPOVER_OFFSET_PX;
    const clampedLeft = Math.min(maxLeft, Math.max(TOOLBAR_CONSTANTS.POPOVER_OFFSET_PX, idealLeft));
    const clampedTop = Math.max(TOOLBAR_CONSTANTS.POPOVER_OFFSET_PX, idealTop);

    container.style.left = `${clampedLeft}px`;
    container.style.top = `${clampedTop}px`;
  }
}
