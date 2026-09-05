import { PlayerController, type PlayerState } from "./controller";
import { PLAYER_CONSTANTS } from "./constants";
import { StyleEngine } from "../../core/style-engine";
import { PopoverEngine } from "../../ui/toolbar/popover";
import { SlotMountBus } from "../../ui/toolbar/slot-mount-bus";
import { TOOLBAR_CONSTANTS } from "../../ui/toolbar/constants";
import { PLAYBACK_RATE_EPSILON } from "../../core/constants";
import { ReactiveDOMRegistry } from "../../core/dom-registry";
import type { PopoverController, SlotDefinition } from "../../ui/toolbar/types";

export class PlayerSpeedButtonView {
  private static instance: PlayerSpeedButtonView | null = null;
  private buttonEl: HTMLElement | null = null;
  private menuEl: HTMLElement | null = null;
  private popoverController: PopoverController | null = null;
  private stateUnbind: (() => void) | null = null;
  private isRegistered: boolean = false;

  public static getInstance(): PlayerSpeedButtonView {
    if (!this.instance) {
      this.instance = new PlayerSpeedButtonView();
    }
    return this.instance;
  }

  public static isMounted(): boolean {
    return Boolean(this.instance?.isRegistered);
  }

  public static mount(): void {
    if (typeof window !== "undefined" && !/youtube\.com/.test(window.location?.host ?? "")) {
      return;
    }
    this.getInstance().registerToBus();
  }

  public static unmount(): void {
    if (this.instance) {
      SlotMountBus.getInstance().unmountSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY);
      this.instance.destroy();
      this.instance = null;
    }
  }

  private registerToBus(): void {
    if (this.isRegistered) {
      return;
    }
    this.isRegistered = true;
    this.injectStyles();

    const slotDef: SlotDefinition = {
      slotKey: PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY,
      containerSelector: PLAYER_CONSTANTS.SELECTORS.PLAYER_CONTAINER,
      targetSelector: PLAYER_CONSTANTS.SELECTORS.RIGHT_CONTROLS,
      elementId: PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID,
      isApplicable: (url: URL): boolean => !url.pathname.startsWith("/shorts"),
      mount: (target: HTMLElement, element: HTMLElement): void => {
        const toolbox: HTMLElement | null = target.querySelector<HTMLElement>(`#${TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID}`);
        if (toolbox) {
          toolbox.before(element);
        } else if (!target.contains(element)) {
          target.prepend(element);
        }
        this.ensureMenuAndPopover();
      },
      unmount: (): void => {
        this.cleanupViewDOM();
      }
    };

    SlotMountBus.getInstance().mountSlot(slotDef, (): HTMLElement | null => this.createSlotElement());
  }

  private injectStyles(): void {
    const combinedStyle: string = `${PLAYER_CONSTANTS.STYLES.SPEED_BTN_CSS}\n${PLAYER_CONSTANTS.STYLES.SPEED_OPTIONS_CSS}`;
    StyleEngine.inject(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID, combinedStyle);
  }

  private resolvePlayerContainer(): HTMLElement | null {
    if (this.buttonEl && this.buttonEl.isConnected) {
      const closestPlayer: HTMLElement | null = this.buttonEl.closest<HTMLElement>("#movie_player, .html5-video-player");
      if (closestPlayer) {
        return closestPlayer;
      }
    }
    return (
      document.querySelector<HTMLElement>("#movie_player, #player-container-outer .html5-video-player") ||
      ReactiveDOMRegistry.getInstance().getPlayerContainer()
    );
  }

  public ensureMenuAndPopover(currentSpeed?: number): boolean {
    const player: HTMLElement | null = this.resolvePlayerContainer();
    if (!player || !this.buttonEl) {
      return false;
    }

    const effectiveSpeed: number =
      typeof currentSpeed === "number" ? currentSpeed : PlayerController.getInstance().getSpeed();

    const isMenuAttached: boolean = Boolean(
      this.menuEl && this.menuEl.isConnected && player.contains(this.menuEl)
    );

    if (isMenuAttached && this.popoverController) {
      return false;
    }

    if (this.menuEl) {
      this.menuEl.remove();
    }

    this.menuEl = document.createElement("div");
    this.menuEl.id = PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID;
    this.menuEl.className = PLAYER_CONSTANTS.CLASSES.SPEED_OPTIONS_MENU;

    PLAYER_CONSTANTS.PRESET_SPEEDS.forEach((speedNum: number): void => {
      const option: HTMLDivElement = document.createElement("div");
      option.className = PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM;
      option.textContent = `${speedNum}×`;
      option.dataset.speed = String(speedNum);

      if (Math.abs(speedNum - effectiveSpeed) < PLAYBACK_RATE_EPSILON) {
        option.classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      }

      option.addEventListener("click", (e: MouseEvent): void => {
        e.stopPropagation();
        PlayerController.getInstance().setSpeed(speedNum, true);
        this.popoverController?.close();
      });

      this.menuEl?.appendChild(option);
    });

    player.appendChild(this.menuEl);

    if (this.popoverController) {
      this.popoverController.destroy();
    }
    this.popoverController = PopoverEngine.bind(this.buttonEl, this.menuEl, player);
    return true;
  }

  public createSlotElement(): HTMLElement | null {
    if (this.buttonEl && this.buttonEl.isConnected) {
      this.ensureMenuAndPopover();
      return this.buttonEl;
    }

    this.injectStyles();

    const currentSpeed: number = PlayerController.getInstance().getSpeed();

    this.buttonEl = document.createElement("div");
    this.buttonEl.id = PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID;
    this.buttonEl.className = PLAYER_CONSTANTS.CLASSES.SPEED_BUTTON;
    this.buttonEl.tabIndex = 0;
    this.buttonEl.setAttribute("role", "button");
    this.buttonEl.setAttribute("aria-haspopup", "true");

    const speedText: HTMLSpanElement = document.createElement("span");
    speedText.textContent = `${currentSpeed}×`;
    this.buttonEl.appendChild(speedText);

    this.buttonEl.addEventListener("mouseenter", (): void => {
      const wasRebound: boolean = this.ensureMenuAndPopover();
      if (wasRebound) {
        this.popoverController?.open("hover");
      }
    });

    this.ensureMenuAndPopover(currentSpeed);
    this.bindPlayerState();

    return this.buttonEl;
  }

  private bindPlayerState(): void {
    if (this.stateUnbind) {
      this.stateUnbind();
    }
    this.stateUnbind = PlayerController.getInstance().onStateChange((state: PlayerState): void => {
      this.updateView(state.speed);
    });
  }

  private updateView(speed: number): void {
    if (this.buttonEl) {
      const span: HTMLSpanElement | null = this.buttonEl.querySelector("span");
      if (span) span.textContent = `${speed}×`;
    }
    if (this.menuEl) {
      const options: NodeListOf<HTMLElement> = this.menuEl.querySelectorAll<HTMLElement>(`.${PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM}`);
      options.forEach((opt: HTMLElement): void => {
        const optSpeed: number = parseFloat(opt.dataset.speed || "0");
        if (Math.abs(optSpeed - speed) < PLAYBACK_RATE_EPSILON) {
          opt.classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
        } else {
          opt.classList.remove(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
        }
      });
    }
  }

  private cleanupViewDOM(): void {
    if (this.stateUnbind) {
      this.stateUnbind();
      this.stateUnbind = null;
    }
    if (this.popoverController) {
      this.popoverController.destroy();
      this.popoverController = null;
    }
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    if (this.buttonEl) {
      this.buttonEl.remove();
      this.buttonEl = null;
    }
  }

  public destroy(): void {
    this.isRegistered = false;
    this.cleanupViewDOM();
    StyleEngine.remove(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID);
  }
}

