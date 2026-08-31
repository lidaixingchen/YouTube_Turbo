import { PlayerController } from "./controller";
import { ShortcutDispatcher } from "../../core/shortcuts";
import { StyleEngine } from "../../core/style-engine";
import { commonUtil } from "../../core/dom-adapter";
import { PlaybackHUD } from "../../core/hud";
import { PLAYBACK_RATE_EPSILON } from "../../core/constants";

export const SpeedControl = {
  shortcutCleanups: [] as (() => void)[],
  stateUnbind: null as (() => void) | null,
  navigateHandler: null as (() => void) | null,

  run(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    PlayerController.init();
    this.insertStyle();
    this.bindShortcuts();

    if (!this.stateUnbind) {
      this.stateUnbind = PlayerController.onStateChange((state) => {
        const btn = document.querySelector<HTMLElement>(".SpeedControl_Extension_Btn_X span");
        if (btn) {
          btn.textContent = `${state.speed}×`;
        }

        const options = document.querySelectorAll<HTMLElement>(".SpeedControl_Extension_Speed-Options > .SpeedControl_Extension_Speed-Option-Item");
        options.forEach((opt) => {
          const optSpeed = parseFloat(opt.dataset.speed || "0");
          if (Math.abs(optSpeed - state.speed) < PLAYBACK_RATE_EPSILON) {
            opt.classList.add("SpeedControl_Extension_Speed-Option-Item-Active");
          } else {
            opt.classList.remove("SpeedControl_Extension_Speed-Option-Item-Active");
          }
        });
      });
    }

    commonUtil.onPageLoad(() => {
      this.genrate();
    });

    if (!this.navigateHandler) {
      this.navigateHandler = () => {
        this.genrate();
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler);
    }
  },

  bindShortcuts(): void {
    this.clearShortcuts();
    const speedStep = 0.25;

    const unbindSpeedUp = ShortcutDispatcher.register({
      key: ">",
      shiftKey: true,
      description: "Increase playback speed",
      handler: () => {
        const current = PlayerController.getSpeed();
        const next = Math.min(Math.round((current + speedStep) * 100) / 100, 16);
        PlayerController.setSpeed(next, true);
      }
    });

    const unbindSpeedDown = ShortcutDispatcher.register({
      key: "<",
      shiftKey: true,
      description: "Decrease playback speed",
      handler: () => {
        const current = PlayerController.getSpeed();
        const next = Math.max(Math.round((current - speedStep) * 100) / 100, 0.25);
        PlayerController.setSpeed(next, true);
      }
    });

    const unbindResetSpeed = ShortcutDispatcher.register({
      key: "r",
      shiftKey: true,
      description: "Reset playback speed to 1.0x",
      handler: () => {
        PlayerController.setSpeed(1.0, true);
      }
    });

    const unbindScreenshot = ShortcutDispatcher.register({
      key: "s",
      shiftKey: true,
      description: "Capture screenshot",
      handler: () => {
        PlayerController.captureScreenshot();
      }
    });

    const unbindPiP = ShortcutDispatcher.register({
      key: "p",
      shiftKey: true,
      description: "Toggle Picture-in-Picture",
      handler: () => {
        PlayerController.togglePictureInPicture();
      }
    });

    const unbindLoop = ShortcutDispatcher.register({
      key: "l",
      shiftKey: true,
      description: "Toggle Loop playback",
      handler: () => {
        PlayerController.toggleLoop();
      }
    });

    this.shortcutCleanups.push(
      unbindSpeedUp,
      unbindSpeedDown,
      unbindResetSpeed,
      unbindScreenshot,
      unbindPiP,
      unbindLoop
    );
  },

  clearShortcuts(): void {
    this.shortcutCleanups.forEach((cleanup) => {
      try { cleanup(); } catch (e) { console.error(e); }
    });
    this.shortcutCleanups = [];
  },

  insertStyle(): void {
    const speedBtnStyle = `
      .SpeedControl_Extension_Btn_X {
        width: 4em !important; 
        float: left; 
        text-align: center !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        border-radius: 0.5em !important;
        font-size: 14px !important;
        font-weight: bold !important;
      }
      .SpeedControl_Extension_Btn_X:hover {
        color: red;
        font-weight: bold;
      }
    `;

    const speedOptionsStyle = `
      .SpeedControl_Extension_Speed-Options {
        position: absolute !important;
        background: rgba(0, 0, 0, 0.4) !important;
        color: white !important;
        border-radius: 8px !important;
        box-sizing: border-box !important;
        z-index: 999999999999 !important;
        display: none;
        padding: 10px !important;
        font-weight: bold !important;
      }
      .SpeedControl_Extension_Speed-Options > .SpeedControl_Extension_Speed-Option-Item {
        cursor: pointer !important;
        height: 25px !important;
        line-height: 25px !important;
        font-size: 12px !important;
        text-align: center !important;
      }
      .SpeedControl_Extension_Speed-Options > .SpeedControl_Extension_Speed-Option-Item-Active,
      .SpeedControl_Extension_Speed-Options > .SpeedControl_Extension_Speed-Option-Item:hover {
        color: red !important;
      }
    `;

    StyleEngine.inject("speed-control", speedBtnStyle + speedOptionsStyle);
  },

  async genrate(): Promise<void> {
    const existingBtn = document.querySelector(".SpeedControl_Extension_Btn_X");
    if (existingBtn) return;

    const player = await commonUtil.waitForElementByInterval<HTMLElement>(
      "#movie_player, #player-container-outer .html5-video-player",
      document.body,
      true,
      50,
      3000
    );
    if (!player) return;

    const rightControls = player.querySelector<HTMLElement>(".ytp-right-controls");
    if (rightControls && !document.querySelector(".SpeedControl_Extension_Btn_X")) {
      const speedControlBtn = document.createElement("div");
      speedControlBtn.className = "ytp-button SpeedControl_Extension_Btn_X";
      const speedText = document.createElement("span");
      speedText.textContent = `${PlayerController.getSpeed()}×`;
      speedControlBtn.appendChild(speedText);

      rightControls.prepend(speedControlBtn);
      this.genrateOptions(speedControlBtn, player);
    }
  },

  genrateOptions(button: HTMLElement, player: HTMLElement): void {
    const existingOptions = document.getElementById("SpeedControl_Extension_Speed-Options");
    if (existingOptions) {
      existingOptions.remove();
    }

    const speedOptions = document.createElement("div");
    speedOptions.id = "SpeedControl_Extension_Speed-Options";
    speedOptions.className = "SpeedControl_Extension_Speed-Options";
    const speeds = ["0.5", "0.75", "1.0", "1.25", "1.5", "2.0", "3.0"];

    speeds.forEach((speed) => {
      const option = document.createElement("div");
      option.className = "SpeedControl_Extension_Speed-Option-Item";
      option.textContent = `${speed}x`;
      option.dataset.speed = speed;
      if (parseFloat(speed) === PlayerController.getSpeed()) {
        option.classList.add("SpeedControl_Extension_Speed-Option-Item-Active");
      }
      speedOptions.appendChild(option);
      option.addEventListener("click", (event: MouseEvent) => {
        const speedValue = parseFloat(speed);
        PlayerController.setSpeed(speedValue, true);
        speedOptions.querySelectorAll(".SpeedControl_Extension_Speed-Option-Item").forEach((element) => {
          element.classList.remove("SpeedControl_Extension_Speed-Option-Item-Active");
        });
        (event.target as HTMLElement).classList.add("SpeedControl_Extension_Speed-Option-Item-Active");
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
      }, 100);
    });

    speedOptions.addEventListener("mouseenter", () => {
      isHovering = true;
    });

    speedOptions.addEventListener("mouseleave", () => {
      isHovering = false;
      speedOptions.style.display = "none";
    });
  },

  destroy(): void {
    this.clearShortcuts();
    if (this.stateUnbind) {
      this.stateUnbind();
      this.stateUnbind = null;
    }
    if (this.navigateHandler) {
      window.removeEventListener("yt-navigate-finish", this.navigateHandler);
      this.navigateHandler = null;
    }
    StyleEngine.remove("speed-control");
    const btn = document.querySelector(".SpeedControl_Extension_Btn_X");
    if (btn && btn.parentNode) {
      btn.parentNode.removeChild(btn);
    }
    const options = document.getElementById("SpeedControl_Extension_Speed-Options");
    if (options && options.parentNode) {
      options.parentNode.removeChild(options);
    }
    PlaybackHUD.destroy();
  }
};
