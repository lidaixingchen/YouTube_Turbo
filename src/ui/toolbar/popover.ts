import { TOOLBAR_CONSTANTS } from "./constants";
import { Modal } from "../modal/modal";
import type { PopoverController, PopoverState } from "./types";

type MenuFocusTarget = "first" | "last" | "next" | "previous";

export class PopoverEngine {
  public static bind(triggerBtn: HTMLElement, containerEl: HTMLElement, playerEl: HTMLElement): PopoverController {
    let currentState: PopoverState = "closed";
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    triggerBtn.setAttribute("aria-haspopup", "menu");
    triggerBtn.setAttribute("aria-expanded", "false");
    containerEl.setAttribute("role", "menu");
    if (triggerBtn.id && containerEl.id) {
      triggerBtn.setAttribute("aria-controls", containerEl.id);
      containerEl.setAttribute("aria-labelledby", triggerBtn.id);
    }

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
      triggerBtn.setAttribute("aria-expanded", String(visible));
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
      const playerRect: DOMRect = playerEl.getBoundingClientRect();
      const btnRect: DOMRect = triggerBtn.getBoundingClientRect();
      const containerRect: DOMRect = containerEl.getBoundingClientRect();

      if (playerRect.width === 0 || containerRect.width === 0) {
        return;
      }

      const idealLeft: number = btnRect.left - playerRect.left + btnRect.width / 2 - containerRect.width / 2;
      const maxLeft: number = playerRect.width - containerRect.width - TOOLBAR_CONSTANTS.POPOVER_SAFETY_MARGIN_PX;
      const clampedLeft: number = Math.max(
        TOOLBAR_CONSTANTS.POPOVER_SAFETY_MARGIN_PX,
        Math.min(maxLeft, idealLeft)
      );

      containerEl.style.transform = `translate3d(${Math.round(clampedLeft)}px, 0, 0)`;
    };

    const getMenuItems = (): HTMLButtonElement[] => {
      return Array.from(
        containerEl.querySelectorAll<HTMLButtonElement>(TOOLBAR_CONSTANTS.POPOVER_MENU_ITEM_SELECTOR)
      ).filter((item: HTMLButtonElement): boolean => {
        return !item.disabled && item.getAttribute("aria-disabled") !== "true";
      });
    };

    const focusMenuItem = (target: MenuFocusTarget): void => {
      const menuItems: HTMLButtonElement[] = getMenuItems();
      if (menuItems.length === 0) {
        return;
      }

      const activeIndex: number = menuItems.findIndex((item: HTMLButtonElement): boolean => {
        return item === document.activeElement;
      });
      let targetIndex: number = 0;

      if (target === "last") {
        targetIndex = menuItems.length - 1;
      } else if (target === "next") {
        targetIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % menuItems.length;
      } else if (target === "previous") {
        targetIndex = activeIndex < 0 ? menuItems.length - 1 : (activeIndex - 1 + menuItems.length) % menuItems.length;
      }

      menuItems[targetIndex].focus();
    };

    const isWithinPopover = (target: Node): boolean => {
      return triggerBtn.contains(target) || containerEl.contains(target);
    };

    const closeInternal = (restoreFocus: boolean, blurMenuFocus: boolean): void => {
      clearTimers();
      if (currentState === "pinned") {
        document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      }

      const modalOwnsFocus: boolean = Modal.preserveFocusForPopoverClose(containerEl, triggerBtn);
      const activeElement: Element | null = document.activeElement;
      const hasMenuFocus: boolean = activeElement instanceof Node && containerEl.contains(activeElement);
      currentState = "closed";

      if (hasMenuFocus && activeElement instanceof HTMLElement) {
        if (!modalOwnsFocus && restoreFocus && triggerBtn.isConnected) {
          triggerBtn.focus();
        } else if (!modalOwnsFocus && (blurMenuFocus || !triggerBtn.isConnected)) {
          activeElement.blur();
        }
      }

      applyVisibility(false);
    };

    const open = (mode: "hover" | "pinned"): void => {
      clearTimers();
      const previousState: PopoverState = currentState;
      currentState = mode;
      applyVisibility(true);

      if (previousState === "pinned" && mode !== "pinned") {
        document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      } else if (mode === "pinned" && previousState !== "pinned") {
        document.addEventListener("pointerdown", handleOutsidePointerDown, true);
      }
    };

    const close = (): void => {
      closeInternal(true, true);
    };

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target: Node | null = event.target instanceof Node ? event.target : null;
      if (target && !isWithinPopover(target)) {
        closeInternal(false, true);
      }
    };

    const onTriggerMouseEnter = (): void => {
      if (currentState === "pinned") return;
      clearTimers();
      showTimer = setTimeout((): void => {
        open("hover");
      }, TOOLBAR_CONSTANTS.POPOVER_HOVER_SHOW_DELAY_MS);
    };

    const onTriggerMouseLeave = (): void => {
      if (currentState === "pinned") return;
      clearTimers();
      hideTimer = setTimeout((): void => {
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
      hideTimer = setTimeout((): void => {
        close();
      }, TOOLBAR_CONSTANTS.POPOVER_HOVER_HIDE_DELAY_MS);
    };

    const onTriggerClick = (event: MouseEvent): void => {
      event.stopPropagation();
      if (currentState === "pinned") {
        close();
      } else {
        open("pinned");
        focusMenuItem("first");
      }
    };

    const onTriggerKeyDown = (event: KeyboardEvent): void => {
      event.stopPropagation();

      if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_DOWN) {
        event.preventDefault();
        open("pinned");
        focusMenuItem("first");
      } else if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_UP) {
        event.preventDefault();
        open("pinned");
        focusMenuItem("last");
      } else if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_ESCAPE && currentState !== "closed") {
        event.preventDefault();
        close();
      }
    };

    const onMenuKeyDown = (event: KeyboardEvent): void => {
      event.stopPropagation();

      if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_DOWN) {
        event.preventDefault();
        focusMenuItem("next");
      } else if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_UP) {
        event.preventDefault();
        focusMenuItem("previous");
      } else if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_HOME) {
        event.preventDefault();
        focusMenuItem("first");
      } else if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_END) {
        event.preventDefault();
        focusMenuItem("last");
      } else if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_ESCAPE) {
        event.preventDefault();
        close();
      } else if (event.key === TOOLBAR_CONSTANTS.POPOVER_KEY_TAB) {
        return;
      }
    };

    const onFocusOut = (event: FocusEvent): void => {
      const nextTarget: EventTarget | null = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !isWithinPopover(nextTarget)) {
        closeInternal(false, true);
      }
    };

    const onWindowResize = (): void => {
      if (currentState !== "closed") {
        reposition();
      }
    };

    applyVisibility(false);
    triggerBtn.addEventListener("mouseenter", onTriggerMouseEnter);
    triggerBtn.addEventListener("mouseleave", onTriggerMouseLeave);
    triggerBtn.addEventListener("click", onTriggerClick);
    triggerBtn.addEventListener("keydown", onTriggerKeyDown);
    triggerBtn.addEventListener("focusout", onFocusOut);
    containerEl.addEventListener("mouseenter", onContainerMouseEnter);
    containerEl.addEventListener("mouseleave", onContainerMouseLeave);
    containerEl.addEventListener("keydown", onMenuKeyDown);
    containerEl.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", onWindowResize);

    const destroy = (): void => {
      close();
      triggerBtn.removeEventListener("mouseenter", onTriggerMouseEnter);
      triggerBtn.removeEventListener("mouseleave", onTriggerMouseLeave);
      triggerBtn.removeEventListener("click", onTriggerClick);
      triggerBtn.removeEventListener("keydown", onTriggerKeyDown);
      triggerBtn.removeEventListener("focusout", onFocusOut);
      containerEl.removeEventListener("mouseenter", onContainerMouseEnter);
      containerEl.removeEventListener("mouseleave", onContainerMouseLeave);
      containerEl.removeEventListener("keydown", onMenuKeyDown);
      containerEl.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", onWindowResize);
    };

    return {
      open,
      close,
      getState: (): PopoverState => currentState,
      reposition,
      destroy
    };
  }
}
