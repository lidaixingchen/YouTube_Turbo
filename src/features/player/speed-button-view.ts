import { PlayerController } from "./controller";
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
  private static isMounted: boolean = false;

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
      this.stateUnbind = PlayerController.getInstance().onStateChange((state) => {
        this.updateButtonText(state.speed);
        this.updateActiveOption(state.speed);
      });
    }

    commonUtil.onPageLoad(() => {
      this.generate().catch((err: unknown) => {
        console.error("[PlayerSpeedButtonView] onPageLoad generate error:", err);
      });
    });

    if (!this.navigateHandler) {
      this.navigateHandler = () => {
        this.generate().catch((err: unknown) => {
          console.error("[PlayerSpeedButtonView] navigate generate error:", err);
        });
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler);
    }

    this.generate().catch((err: unknown) => {
      console.error("[PlayerSpeedButtonView] initial generate error:", err);
    });
  }

  private static insertStyle(): void {
    const combinedStyle = `${PLAYER_CONSTANTS.STYLES.SPEED_BTN_CSS}\n${PLAYER_CONSTANTS.STYLES.SPEED_OPTIONS_CSS}`;
    StyleEngine.inject(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID, combinedStyle);
  }

  private static updateButtonText(speed: number): void {
    const btn = document.querySelector<HTMLElement>(`${PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON} span`);
    if (btn) {
      btn.textContent = `${speed}×`;
    }
  }

  private static updateActiveOption(currentSpeed: number): void {
    const options = document.querySelectorAll<HTMLElement>(
      `${PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU} > .${PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM}`
    );
    options.forEach((opt: HTMLElement) => {
      const optSpeed = parseFloat(opt.dataset.speed || "0");
      if (Math.abs(optSpeed - currentSpeed) < PLAYBACK_RATE_EPSILON) {
        opt.classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      } else {
        opt.classList.remove(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      }
    });
  }

  private static async generate(): Promise<void> {
    const existingBtn = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON);
    if (existingBtn) return;

    const player = await ReactiveDOMRegistry.getInstance().waitForElement<HTMLElement>(
      PLAYER_CONSTANTS.SELECTORS.PLAYER_CONTAINER,
      document.body,
      VIDEO_RETRY_MAX_TIMEOUT_MS
    );
    if (!player || !this.isMounted) return;

    const rightControls = player.querySelector<HTMLElement>(PLAYER_CONSTANTS.SELECTORS.RIGHT_CONTROLS);
    if (rightControls && !document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON)) {
      const speedControlBtn = document.createElement("div");
      speedControlBtn.className = PLAYER_CONSTANTS.CLASSES.SPEED_BUTTON;
      const speedText = document.createElement("span");
      speedText.textContent = `${PlayerController.getInstance().getSpeed()}×`;
      speedControlBtn.appendChild(speedText);

      rightControls.prepend(speedControlBtn);
      this.generateOptions(speedControlBtn, player);
    }
  }

  private static generateOptions(button: HTMLElement, player: HTMLElement): void {
    const existingOptions = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU);
    if (existingOptions) {
      existingOptions.remove();
    }

    const speedOptions = document.createElement("div");
    speedOptions.id = PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU.replace("#", "");
    speedOptions.className = PLAYER_CONSTANTS.CLASSES.SPEED_OPTIONS_MENU;

    PLAYER_CONSTANTS.PRESET_SPEEDS.forEach((speedNum: number) => {
      const speedStr = String(speedNum);
      const option = document.createElement("div");
      option.className = PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM;
      option.textContent = `${speedStr}×`;
      option.dataset.speed = speedStr;
      if (Math.abs(speedNum - PlayerController.getInstance().getSpeed()) < PLAYBACK_RATE_EPSILON) {
        option.classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      }
      speedOptions.appendChild(option);

      option.addEventListener("click", (event: MouseEvent) => {
        PlayerController.getInstance().setSpeed(speedNum, true);
        speedOptions.querySelectorAll(`.${PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM}`).forEach((element: Element) => {
          element.classList.remove(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
        });
        (event.target as HTMLElement).classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      });
    });

    player.appendChild(speedOptions);
    let isHovering = false;

    button.addEventListener("mouseenter", () => {
      speedOptions.style.display = "block";
      const containerRect = player.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const speedOptionsRect = speedOptions.getBoundingClientRect();
      const left = buttonRect.left - containerRect.left - speedOptionsRect.width / 2 + buttonRect.width / 2;
      const top = buttonRect.top - containerRect.top - speedOptions.clientHeight;
      speedOptions.style.left = `${left}px`;
      speedOptions.style.top = `${top}px`;
    });

    button.addEventListener("mouseleave", () => {
      isHovering = false;
      setTimeout(() => {
        if (!isHovering) {
          speedOptions.style.display = "none";
        }
      }, PLAYER_CONSTANTS.MENU_HIDE_DELAY_MS);
    });

    speedOptions.addEventListener("mouseenter", () => {
      isHovering = true;
    });

    speedOptions.addEventListener("mouseleave", () => {
      isHovering = false;
      speedOptions.style.display = "none";
    });
  }

  public static unmount(): void {
    this.isMounted = false;
    if (this.stateUnbind) {
      this.stateUnbind();
      this.stateUnbind = null;
    }
    if (this.navigateHandler) {
      window.removeEventListener("yt-navigate-finish", this.navigateHandler);
      this.navigateHandler = null;
    }
    StyleEngine.remove(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID);
    const btn = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON);
    if (btn && btn.parentNode) {
      btn.parentNode.removeChild(btn);
    }
    const options = document.querySelector(PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU);
    if (options && options.parentNode) {
      options.parentNode.removeChild(options);
    }
  }
}
