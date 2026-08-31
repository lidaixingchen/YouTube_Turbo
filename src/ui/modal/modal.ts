import modalCss from "./modal.css?raw";
import { StyleEngine } from "../../core/style-engine";
import { TTP } from "../../core/trusted-types";
import type { ModalOpenOptions } from "../../types";

export const MODAL_CONSTANTS = {
  Z_INDEX_BACKDROP: 2147483640,
  Z_INDEX_MODAL: 2147483641,
  STYLE_ELEMENT_ID: "yt-improvements-modal-style"
} as const;

export interface ModalInstanceOptions extends ModalOpenOptions {
  content?: HTMLElement | string;
  cancelText?: string;
  okText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

export class ModalInstance {
  private options: ModalInstanceOptions;
  public backdrop: HTMLElement;
  public container: HTMLElement;

  constructor(options: ModalInstanceOptions = {}) {
    this.options = options;
    Modal.injectStyles();

    this.backdrop = document.createElement("div");
    this.backdrop.className = "yt-modal-backdrop";
    if (this.options.direction) {
      this.backdrop.setAttribute("dir", this.options.direction);
    }

    this.container = document.createElement("div");
    this.container.className = "yt-modal-container";
    if (this.options.direction) {
      this.container.setAttribute("dir", this.options.direction);
    }

    if (this.options.title) {
      const header = document.createElement("div");
      header.className = "yt-modal-header";

      const titleEl = document.createElement("h3");
      titleEl.className = "yt-modal-title";
      titleEl.textContent = this.options.title;

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "yt-modal-close-btn";
      closeBtn.innerHTML = TTP.createHTML("&times;");
      closeBtn.onclick = () => this.close();

      header.appendChild(titleEl);
      header.appendChild(closeBtn);
      this.container.appendChild(header);
    }

    const body = document.createElement("div");
    body.className = "yt-modal-body";

    if (this.options.content) {
      if (typeof this.options.content === "string") {
        const textWrapper = document.createElement("div");
        textWrapper.className = "yt-modal-text";
        textWrapper.textContent = this.options.content;
        body.appendChild(textWrapper);
      } else if (this.options.content instanceof HTMLElement) {
        body.appendChild(this.options.content);
      }
    }

    if (this.options.styleSheet) {
      const customStyle = document.createElement("style");
      customStyle.textContent = this.options.styleSheet;
      this.container.appendChild(customStyle);
    }

    this.container.appendChild(body);
    this.backdrop.appendChild(this.container);

    this.backdrop.addEventListener("click", (e: MouseEvent) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    document.body.appendChild(this.backdrop);
  }

  public close(): void {
    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
    if (typeof this.options.onClose === "function") {
      this.options.onClose();
    }
  }
}

export const Modal = {
  injectStyles(): void {
    const formattedCss = modalCss
      .replace("__Z_INDEX_BACKDROP__", String(MODAL_CONSTANTS.Z_INDEX_BACKDROP))
      .replace("__Z_INDEX_MODAL__", String(MODAL_CONSTANTS.Z_INDEX_MODAL));
    StyleEngine.inject(MODAL_CONSTANTS.STYLE_ELEMENT_ID, formattedCss);
  },

  open(options: ModalOpenOptions): ModalInstance {
    return new ModalInstance(options);
  },

  confirm(options: ModalInstanceOptions = {}): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const container = document.createElement("div");

      if (options.content) {
        if (typeof options.content === "string") {
          const msg = document.createElement("p");
          msg.style.cssText = "margin-bottom: 20px; font-size: 14px; line-height: 1.5; color: #333;";
          msg.textContent = options.content;
          container.appendChild(msg);
        } else if (options.content instanceof HTMLElement) {
          container.appendChild(options.content);
        }
      }

      const actionsEl = document.createElement("div");
      actionsEl.className = "yt-modal-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "yt-modal-btn yt-modal-btn-cancel";
      cancelBtn.textContent = options.cancelText || "Cancel";

      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "yt-modal-btn yt-modal-btn-confirm";
      okBtn.textContent = options.okText || "OK";

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(okBtn);
      container.appendChild(actionsEl);

      let instance: ModalInstance;
      cancelBtn.onclick = () => {
        if (instance) instance.close();
        if (options.onCancel) options.onCancel();
        resolve(false);
      };

      okBtn.onclick = () => {
        if (instance) instance.close();
        if (options.onConfirm) options.onConfirm();
        resolve(true);
      };

      instance = new ModalInstance({
        ...options,
        content: container,
        onClose: () => {
          if (options.onClose) {
            options.onClose();
          }
        }
      });
    });
  },

  alert(options: ModalInstanceOptions = {}): Promise<void> {
    return new Promise<void>((resolve) => {
      const container = document.createElement("div");

      if (options.content) {
        if (typeof options.content === "string") {
          const msg = document.createElement("p");
          msg.style.cssText = "margin-bottom: 20px; font-size: 14px; line-height: 1.5; color: #333;";
          msg.textContent = options.content;
          container.appendChild(msg);
        } else if (options.content instanceof HTMLElement) {
          container.appendChild(options.content);
        }
      }

      const actionsEl = document.createElement("div");
      actionsEl.className = "yt-modal-actions";

      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "yt-modal-btn yt-modal-btn-confirm";
      okBtn.textContent = options.okText || "OK";

      actionsEl.appendChild(okBtn);
      container.appendChild(actionsEl);

      let instance: ModalInstance;
      okBtn.onclick = () => {
        if (instance) instance.close();
      };

      instance = new ModalInstance({
        ...options,
        content: container,
        onClose: () => {
          resolve();
          if (options.onClose) {
            options.onClose();
          }
        }
      });
    });
  }
};
