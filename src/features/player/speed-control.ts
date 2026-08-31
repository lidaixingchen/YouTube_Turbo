import { PlayerController } from "./controller";
import { ShortcutDispatcher } from "../../core/shortcuts";
import { StyleEngine } from "../../core/style-engine";
import { commonUtil } from "../../core/dom-adapter";
import { HUD_CONSTANTS, PlaybackHUD } from "../../core/hud";

export const SpeedControl = {
  shortcutCleanups: [] as (() => void)[],

  run(): Promise<void> {
    if (!/youtube\.com/.test(window.location.host)) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      PlayerController.init();
      this.insertStyle();
      this.bindShortcuts();
      commonUtil.onPageLoad(async () => {
        await this.genrate();
        resolve();
      });
    });
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

    this.shortcutCleanups.push(unbindSpeedUp, unbindSpeedDown);
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

    const speedShowStyle = `
      #youtube-extension-text-box {
        position: absolute !important;
        margin: auto !important;
        top: 0px !important;
        right: 0px !important;
        bottom: 0px !important;
        left: 0px !important;
        border-radius: 20px !important;
        font-size: 30px !important;
        color: #f3f3f3 !important;
        z-index: ${HUD_CONSTANTS.Z_INDEX} !important;
        opacity: ${HUD_CONSTANTS.PEAK_OPACITY} !important;
        width: 80px !important;
        height: 80px !important;
        line-height: 80px !important;
        text-align: center !important;
        padding: 0px !important;
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

    StyleEngine.inject("speed-control", speedBtnStyle + speedShowStyle + speedOptionsStyle);
  },

  async genrate(): Promise<void> {
    const speedControlBtn = document.createElement("div");
    speedControlBtn.className = "ytp-button SpeedControl_Extension_Btn_X";
    const speedText = document.createElement("span");
    speedText.textContent = `${PlayerController.getSpeed()}×`;
    speedControlBtn.appendChild(speedText);

    const player = await commonUtil.waitForElementByInterval<HTMLElement>("#player-container-outer .html5-video-player");
    if (player) {
      const rightControls = player.querySelector<HTMLElement>(".ytp-right-controls");
      const existingBtn = document.querySelector(".SpeedControl_Extension_Btn_X");
      if (rightControls && !existingBtn) {
        rightControls.prepend(speedControlBtn);
        this.genrateOptions(speedControlBtn, player);
      }
    }

    PlayerController.onStateChange((state) => {
      const btn = document.querySelector<HTMLElement>(".SpeedControl_Extension_Btn_X span");
      if (btn) {
        btn.textContent = `${state.speed}×`;
      }
    });
  },

  genrateOptions(button: HTMLElement, player: HTMLElement): void {
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
