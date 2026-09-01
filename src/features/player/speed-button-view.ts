import { PlayerController, type PlayerState } from "./controller";
import { PLAYER_CONSTANTS } from "./constants";
import { StyleEngine } from "../../core/style-engine";
import { commonUtil, ReactiveDOMRegistry } from "../../core/dom-adapter";
import {
  PLAYBACK_RATE_EPSILON,
  VIDEO_RETRY_MAX_TIMEOUT_MS
} from "../../core/constants";

export class PlayerSpeedButtonView {
  private static stateUnbind: (() => void) | null = null;
  private static navigateHandler: (() => void) | null = null;
  private static documentClickHandler: ((event: MouseEvent) => void) | null = null;
  private static isMounted: boolean = false;
  private static hideTimer: ReturnType<typeof setTimeout> | null = null;

  public static mount(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    if (this.isMounted) {
      return;
    }
    this.isMounted = true;

    this.insertStyle();

    if (!this.stateUnbind) {
      this.stateUnbind = PlayerController.getInstance().onStateChange((state: PlayerState): void => {
        this.updateButtonText(state.speed);
        this.updateActiveOption(state.speed);
      });
    }

    commonUtil.onPageLoad((): void => {
      this.generate().catch((err: unknown): void => {
        console.error("[PlayerSpeedButtonView] onPageLoad generate error:", err);
      });
    });

    if (!this.navigateHandler) {
      this.navigateHandler = (): void => {
        this.generate().catch((err: unknown): void => {
          console.error("[PlayerSpeedButtonView] navigate generate error:", err);
        });
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler);
    }

    if (!this.documentClickHandler) {
      this.documentClickHandler = (event: MouseEvent): void => {
        const target: HTMLElement | null = event.target as HTMLElement | null;
        if (!target) return;
        const speedBtn: Element | null = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON);
        const speedOptions: HTMLElement | null = document.querySelector<HTMLElement>(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU);
        if (speedOptions && speedOptions.style.display === "block") {
          if (!speedBtn?.contains(target) && !speedOptions.contains(target)) {
            this.hideMenu(speedOptions);
          }
        }
      };
      document.addEventListener("click", this.documentClickHandler, true);
    }

    this.generate().catch((err: unknown): void => {
      console.error("[PlayerSpeedButtonView] initial generate error:", err);
    });
  }

  private static insertStyle(): void {
    const combinedStyle: string = `${PLAYER_CONSTANTS.STYLES.SPEED_BTN_CSS}\n${PLAYER_CONSTANTS.STYLES.SPEED_OPTIONS_CSS}`;
    StyleEngine.inject(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID, combinedStyle);
  }

  private static updateButtonText(speed: number): void {
    const btn: HTMLElement | null = document.querySelector<HTMLElement>(`${PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON} span`);
    if (btn) {
      btn.textContent = `${speed}×`;
    }
  }

  private static updateActiveOption(currentSpeed: number): void {
    const options: NodeListOf<HTMLElement> = document.querySelectorAll<HTMLElement>(
      `${PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU} > .${PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM}`
    );
    options.forEach((opt: HTMLElement): void => {
      const optSpeed: number = parseFloat(opt.dataset.speed || "0");
      if (Math.abs(optSpeed - currentSpeed) < PLAYBACK_RATE_EPSILON) {
        opt.classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      } else {
        opt.classList.remove(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      }
    });
  }

  private static showMenu(button: HTMLElement, player: HTMLElement, speedOptions: HTMLElement): void {
    this.clearHideTimer();
    const containerRect: DOMRect = player.getBoundingClientRect();
    const buttonRect: DOMRect = button.getBoundingClientRect();
    const menuWidth: number = speedOptions.offsetWidth || PLAYER_CONSTANTS.MENU_ESTIMATED_WIDTH_PX;
    const left: number = Math.max(8, buttonRect.left - containerRect.left + (buttonRect.width - menuWidth) / 2);
    const bottom: number = containerRect.bottom - buttonRect.top + PLAYER_CONSTANTS.MENU_BOTTOM_OFFSET_PX;

    speedOptions.style.left = `${left}px`;
    speedOptions.style.bottom = `${bottom}px`;
    speedOptions.style.top = "auto";
    speedOptions.style.display = "block";
  }

  private static hideMenu(speedOptions: HTMLElement): void {
    this.clearHideTimer();
    speedOptions.style.display = "none";
  }

  private static scheduleHide(speedOptions: HTMLElement): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout((): void => {
      this.hideMenu(speedOptions);
    }, PLAYER_CONSTANTS.MENU_HIDE_DELAY_MS);
  }

  private static clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private static async generate(): Promise<void> {
    const existingBtn: HTMLElement | null = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON);
    if (existingBtn) {
      return;
    }

    const player: HTMLElement | null = await ReactiveDOMRegistry.getInstance().waitForElement<HTMLElement>(
      PLAYER_CONSTANTS.SELECTORS.PLAYER_CONTAINER,
      document.body,
      VIDEO_RETRY_MAX_TIMEOUT_MS
    );
    if (!player || !this.isMounted) {
      return;
    }

    const rightControls: HTMLElement | null = player.querySelector<HTMLElement>(PLAYER_CONSTANTS.SELECTORS.RIGHT_CONTROLS);
    if (rightControls && !document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON)) {
      const speedControlBtn: HTMLDivElement = document.createElement("div");
      speedControlBtn.className = PLAYER_CONSTANTS.CLASSES.SPEED_BUTTON;
      speedControlBtn.tabIndex = 0;
      speedControlBtn.setAttribute("role", "button");
      speedControlBtn.setAttribute("aria-haspopup", "true");

      const speedText: HTMLSpanElement = document.createElement("span");
      speedText.textContent = `${PlayerController.getInstance().getSpeed()}×`;
      speedControlBtn.appendChild(speedText);

      this.generateOptions(speedControlBtn, player);
      rightControls.prepend(speedControlBtn);
    }
  }

  private static generateOptions(button: HTMLElement, player: HTMLElement): void {
    const existingOptions: HTMLElement | null = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU);
    if (existingOptions) {
      existingOptions.remove();
    }

    const speedOptions: HTMLDivElement = document.createElement("div");
    speedOptions.id = PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU.replace("#", "");
    speedOptions.className = PLAYER_CONSTANTS.CLASSES.SPEED_OPTIONS_MENU;

    PLAYER_CONSTANTS.PRESET_SPEEDS.forEach((speedNum: number): void => {
      const speedStr: string = String(speedNum);
      const option: HTMLDivElement = document.createElement("div");
      option.className = PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM;
      option.textContent = `${speedStr}×`;
      option.dataset.speed = speedStr;
      if (Math.abs(speedNum - PlayerController.getInstance().getSpeed()) < PLAYBACK_RATE_EPSILON) {
        option.classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      }

      option.addEventListener("click", (event: MouseEvent): void => {
        event.stopPropagation();
        PlayerController.getInstance().setSpeed(speedNum, true);
        this.hideMenu(speedOptions);
      });

      speedOptions.appendChild(option);
    });

    player.appendChild(speedOptions);

    button.addEventListener("mouseenter", (): void => {
      this.showMenu(button, player, speedOptions);
    });

    button.addEventListener("mouseleave", (): void => {
      this.scheduleHide(speedOptions);
    });

    button.addEventListener("click", (event: MouseEvent): void => {
      event.stopPropagation();
      if (speedOptions.style.display === "block") {
        this.hideMenu(speedOptions);
      } else {
        this.showMenu(button, player, speedOptions);
      }
    });

    speedOptions.addEventListener("mouseenter", (): void => {
      this.clearHideTimer();
    });

    speedOptions.addEventListener("mouseleave", (): void => {
      this.scheduleHide(speedOptions);
    });
  }

  public static unmount(): void {
    this.isMounted = false;
    this.clearHideTimer();
    if (this.stateUnbind) {
      this.stateUnbind();
      this.stateUnbind = null;
    }
    if (this.navigateHandler) {
      window.removeEventListener("yt-navigate-finish", this.navigateHandler);
      this.navigateHandler = null;
    }
    if (this.documentClickHandler) {
      document.removeEventListener("click", this.documentClickHandler, true);
      this.documentClickHandler = null;
    }
    StyleEngine.remove(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID);
    const btn: Element | null = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON);
    if (btn && btn.parentNode) {
      btn.parentNode.removeChild(btn);
    }
    const options: Element | null = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU);
    if (options && options.parentNode) {
      options.parentNode.removeChild(options);
    }
  }
}
