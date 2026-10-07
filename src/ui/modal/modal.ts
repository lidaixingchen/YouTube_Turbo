import modalCss from "./modal.css?raw";
import { StyleEngine } from "../../core/style-engine";
import { ACTIVE_MODAL_ATTRIBUTE } from "../../core/constants";
import { IconRegistry } from "../icons";
import { Locale } from "../../i18n";
import { MODAL_CONSTANTS } from "./constants";
import type { ModalOpenOptions } from "../../types";

export { MODAL_CONSTANTS } from "./constants";

export interface ModalInstanceOptions extends ModalOpenOptions {
  content?: HTMLElement | string;
  cancelText?: string;
  okText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

export class ModalInstance {
  private static readonly instances: ModalInstance[] = [];
  private static listenersAttached: boolean = false;
  private static nextTitleId: number = 0;
  private static readonly handleDocumentFocusIn = (event: FocusEvent): void => {
    const topmost: ModalInstance | null = ModalInstance.getTopmost();
    const target: EventTarget | null = event.target;
    if (topmost && (!(target instanceof Node) || !topmost.container.contains(target))) {
      topmost.focusInitial();
    }
  };
  private static readonly handleDocumentKeyDown = (event: KeyboardEvent): void => {
    const topmost: ModalInstance | null = ModalInstance.getTopmost();
    if (!topmost) {
      return;
    }

    const target: EventTarget | null = event.target;
    if (target instanceof Node && topmost.container.contains(target)) {
      return;
    }

    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.key === MODAL_CONSTANTS.KEY_ESCAPE) {
      event.preventDefault();
      topmost.close();
      return;
    }
    if (event.key === MODAL_CONSTANTS.KEY_TAB) {
      event.preventDefault();
      topmost.focusTabBoundary(event.shiftKey);
      return;
    }
    topmost.focusInitial();
  };

  private options: ModalInstanceOptions;
  public backdrop: HTMLElement;
  public container: HTMLElement;
  private isClosed: boolean = false;
  private previousActiveElement: HTMLElement | null;
  private readonly handleContainerKeyDown = (event: KeyboardEvent): void => {
    if (ModalInstance.getTopmost() !== this) {
      return;
    }

    event.stopPropagation();
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === MODAL_CONSTANTS.KEY_ESCAPE) {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === MODAL_CONSTANTS.KEY_TAB) {
      this.handleTabKeyDown(event);
    }
  };

  constructor(options: ModalInstanceOptions = {}) {
    this.options = options;
    const activeElement: Element | null = document.activeElement;
    this.previousActiveElement =
      activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null;
    Modal.injectStyles();

    this.backdrop = document.createElement("div");
    this.backdrop.className = "yt-modal-backdrop";
    if (this.options.direction) {
      this.backdrop.setAttribute("dir", this.options.direction);
    }

    this.container = document.createElement("div");
    const sizeClass: string = `yt-modal-size-${this.options.size || "medium"}`;
    this.container.className = `yt-modal-container ${sizeClass}`;
    this.container.setAttribute("role", MODAL_CONSTANTS.DIALOG_ROLE);
    this.container.setAttribute("aria-modal", MODAL_CONSTANTS.ARIA_MODAL_ACTIVE_VALUE);
    this.container.tabIndex = MODAL_CONSTANTS.FOCUS_CONTAINER_TAB_INDEX;
    this.container.addEventListener("keydown", this.handleContainerKeyDown);
    if (this.options.direction) {
      this.container.setAttribute("dir", this.options.direction);
    }

    const titleText: string = this.options.title ?? "";
    if (titleText.trim().length > 0) {
      const header: HTMLDivElement = document.createElement("div");
      header.className = "yt-modal-header";

      const titleEl: HTMLHeadingElement = document.createElement("h3");
      titleEl.className = "yt-modal-title";
      titleEl.id = `${MODAL_CONSTANTS.TITLE_ID_PREFIX}${ModalInstance.nextTitleId++}`;
      titleEl.textContent = titleText;
      this.container.setAttribute("aria-labelledby", titleEl.id);

      const closeBtn: HTMLButtonElement = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "yt-modal-close-btn";
      closeBtn.setAttribute("aria-label", Locale.t(MODAL_CONSTANTS.CLOSE_LABEL_I18N_KEY));
      const closeIcon: Element = IconRegistry.createSvg("close", { size: 18 });
      closeBtn.appendChild(closeIcon);
      closeBtn.onclick = (): void => this.close();

      header.appendChild(titleEl);
      header.appendChild(closeBtn);
      this.container.appendChild(header);
    } else {
      this.container.setAttribute("aria-label", Locale.t(MODAL_CONSTANTS.DEFAULT_TITLE_I18N_KEY));
    }

    const body: HTMLDivElement = document.createElement("div");
    body.className = "yt-modal-body";

    if (this.options.content) {
      if (typeof this.options.content === "string") {
        const textWrapper: HTMLDivElement = document.createElement("div");
        textWrapper.className = "yt-modal-text";
        textWrapper.textContent = this.options.content;
        body.appendChild(textWrapper);
      } else if (this.options.content instanceof HTMLElement) {
        body.appendChild(this.options.content);
      }
    }

    if (this.options.styleSheet) {
      const customStyle: HTMLStyleElement = document.createElement("style");
      customStyle.textContent = this.options.styleSheet;
      this.container.appendChild(customStyle);
    }

    this.container.appendChild(body);
    this.backdrop.appendChild(this.container);

    this.backdrop.addEventListener("click", (event: MouseEvent): void => {
      if (event.target === this.backdrop) {
        this.close();
      }
    });

    document.body.appendChild(this.backdrop);
    ModalInstance.addInstance(this);
    this.focusInitial();
  }

  private static addInstance(instance: ModalInstance): void {
    if (!ModalInstance.listenersAttached) {
      document.documentElement.setAttribute(ACTIVE_MODAL_ATTRIBUTE, "");
      document.addEventListener("focusin", ModalInstance.handleDocumentFocusIn, true);
      document.addEventListener("keydown", ModalInstance.handleDocumentKeyDown, true);
      ModalInstance.listenersAttached = true;
    }
    const previousTopmost: ModalInstance | null = ModalInstance.getTopmost();
    previousTopmost?.container.setAttribute("aria-modal", MODAL_CONSTANTS.ARIA_MODAL_INACTIVE_VALUE);
    ModalInstance.instances.push(instance);
    instance.container.setAttribute("aria-modal", MODAL_CONSTANTS.ARIA_MODAL_ACTIVE_VALUE);
  }

  private static getTopmost(): ModalInstance | null {
    return ModalInstance.instances[ModalInstance.instances.length - 1] ?? null;
  }

  public static preserveFocusForPopoverClose(popoverRoot: HTMLElement, returnFocusTarget: HTMLElement): boolean {
    const topmost: ModalInstance | null = ModalInstance.getTopmost();
    if (!topmost) {
      return false;
    }

    topmost.prepareForPopoverClose(popoverRoot, returnFocusTarget);
    return true;
  }

  private prepareForPopoverClose(popoverRoot: HTMLElement, returnFocusTarget: HTMLElement): void {
    if (this.previousActiveElement && popoverRoot.contains(this.previousActiveElement)) {
      this.previousActiveElement = returnFocusTarget.isConnected ? returnFocusTarget : null;
    }

    const activeElement: Element | null = document.activeElement;
    if (!(activeElement instanceof Node) || !this.container.contains(activeElement)) {
      this.focusInitial();
    }
  }

  private getFocusableElements(root: ParentNode = this.container): HTMLElement[] {
    const candidates: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>(MODAL_CONSTANTS.FOCUSABLE_SELECTOR));
    const focusableElements: HTMLElement[] = candidates.filter((element: HTMLElement): boolean => this.isFocusable(element));
    const positiveTabIndexElements: HTMLElement[] = focusableElements.filter(
      (element: HTMLElement): boolean => element.tabIndex > MODAL_CONSTANTS.FOCUSABLE_TAB_INDEX_MIN
    );
    const naturalTabIndexElements: HTMLElement[] = focusableElements.filter(
      (element: HTMLElement): boolean => element.tabIndex === MODAL_CONSTANTS.FOCUSABLE_TAB_INDEX_MIN
    );
    positiveTabIndexElements.sort((left: HTMLElement, right: HTMLElement): number => left.tabIndex - right.tabIndex);
    return [...positiveTabIndexElements, ...naturalTabIndexElements];
  }

  private isFocusable(element: HTMLElement): boolean {
    if (
      element.tabIndex < MODAL_CONSTANTS.FOCUSABLE_TAB_INDEX_MIN ||
      element.matches(MODAL_CONSTANTS.FOCUSABLE_DISABLED_SELECTOR) ||
      element.closest(MODAL_CONSTANTS.FOCUSABLE_HIDDEN_ANCESTOR_SELECTOR)
    ) {
      return false;
    }

    let ancestor: HTMLElement | null = element;
    while (ancestor && this.container.contains(ancestor)) {
      const computedStyle: CSSStyleDeclaration = window.getComputedStyle(ancestor);
      if (
        computedStyle.display === MODAL_CONSTANTS.FOCUSABLE_HIDDEN_DISPLAY ||
        MODAL_CONSTANTS.FOCUSABLE_HIDDEN_VISIBILITY.includes(computedStyle.visibility)
      ) {
        return false;
      }
      if (ancestor === this.container) {
        break;
      }
      ancestor = ancestor.parentElement;
    }
    return true;
  }

  private focusInitial(): void {
    const body: HTMLElement | null = this.container.querySelector<HTMLElement>(MODAL_CONSTANTS.BODY_SELECTOR);
    const preferredTarget: HTMLElement | undefined = body ? this.getFocusableElements(body)[0] : undefined;
    const target: HTMLElement = preferredTarget ?? this.getFocusableElements()[0] ?? this.container;
    target.focus();
    if (document.activeElement !== target) {
      this.container.focus();
    }
  }

  private focusTabBoundary(reverse: boolean): void {
    const focusableElements: HTMLElement[] = this.getFocusableElements();
    const boundaryTarget: HTMLElement | undefined = reverse
      ? focusableElements[focusableElements.length - 1]
      : focusableElements[0];
    const target: HTMLElement = boundaryTarget ?? this.container;
    target.focus();
    if (document.activeElement !== target) {
      this.container.focus();
    }
  }

  private handleTabKeyDown(event: KeyboardEvent): void {
    const focusableElements: HTMLElement[] = this.getFocusableElements();
    if (focusableElements.length === 0) {
      event.preventDefault();
      this.container.focus();
      return;
    }

    const activeElement: Element | null = document.activeElement;
    const activeIndex: number = focusableElements.findIndex((element: HTMLElement): boolean => element === activeElement);
    if (event.shiftKey && activeIndex <= 0) {
      event.preventDefault();
      this.focusTabBoundary(true);
    } else if (!event.shiftKey && activeIndex === focusableElements.length - 1) {
      event.preventDefault();
      this.focusTabBoundary(false);
    } else if (activeIndex === -1) {
      event.preventDefault();
      this.focusTabBoundary(event.shiftKey);
    }
  }

  private restoreFocus(topmost: ModalInstance | null): void {
    const returnTarget: HTMLElement | null = this.previousActiveElement;
    if (topmost) {
      if (returnTarget?.isConnected && topmost.container.contains(returnTarget)) {
        returnTarget.focus();
      } else {
        topmost.focusInitial();
      }
      return;
    }

    if (returnTarget?.isConnected) {
      returnTarget.focus();
    }
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    const stackIndex: number = ModalInstance.instances.indexOf(this);
    const wasTopmost: boolean = stackIndex === ModalInstance.instances.length - 1;
    const nextInstance: ModalInstance | null = ModalInstance.instances[stackIndex + 1] ?? null;
    if (
      nextInstance &&
      this.previousActiveElement &&
      this.container.contains(nextInstance.previousActiveElement)
    ) {
      nextInstance.previousActiveElement = this.previousActiveElement;
    }
    if (stackIndex >= 0) {
      ModalInstance.instances.splice(stackIndex, 1);
    }
    const topmost: ModalInstance | null = ModalInstance.getTopmost();
    if (wasTopmost && topmost) {
      topmost.container.setAttribute("aria-modal", MODAL_CONSTANTS.ARIA_MODAL_ACTIVE_VALUE);
    }
    if (ModalInstance.instances.length === 0 && ModalInstance.listenersAttached) {
      document.removeEventListener("focusin", ModalInstance.handleDocumentFocusIn, true);
      document.removeEventListener("keydown", ModalInstance.handleDocumentKeyDown, true);
      document.documentElement.removeAttribute(ACTIVE_MODAL_ATTRIBUTE);
      ModalInstance.listenersAttached = false;
    }

    this.container.removeEventListener("keydown", this.handleContainerKeyDown);
    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
    if (wasTopmost) {
      this.restoreFocus(topmost);
    }
    if (typeof this.options.onClose === "function") {
      this.options.onClose();
    }
  }
}

export const Modal = {
  injectStyles(): void {
    const formattedCss: string = modalCss
      .replace("__Z_INDEX_BACKDROP__", String(MODAL_CONSTANTS.Z_INDEX_BACKDROP))
      .replace("__Z_INDEX_MODAL__", String(MODAL_CONSTANTS.Z_INDEX_MODAL));
    StyleEngine.inject(MODAL_CONSTANTS.STYLE_ELEMENT_ID, formattedCss);
  },

  open(options: ModalOpenOptions): ModalInstance {
    return new ModalInstance(options);
  },

  preserveFocusForPopoverClose(popoverRoot: HTMLElement, returnFocusTarget: HTMLElement): boolean {
    return ModalInstance.preserveFocusForPopoverClose(popoverRoot, returnFocusTarget);
  },

  confirm(options: ModalInstanceOptions = {}): Promise<boolean> {
    return new Promise<boolean>(
      (
        resolve: (value: boolean | PromiseLike<boolean>) => void,
        reject: (reason?: unknown) => void
      ): void => {
      const container: HTMLDivElement = document.createElement("div");

      if (options.content) {
        if (typeof options.content === "string") {
          const msg: HTMLParagraphElement = document.createElement("p");
          msg.className = "yt-modal-text";
          msg.style.marginBottom = "16px";
          msg.textContent = options.content;
          container.appendChild(msg);
        } else if (options.content instanceof HTMLElement) {
          container.appendChild(options.content);
        }
      }

      const actionsEl: HTMLDivElement = document.createElement("div");
      actionsEl.className = "yt-modal-actions";

      const cancelBtn: HTMLButtonElement = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "yt-modal-btn yt-modal-btn-cancel";
      cancelBtn.textContent = options.cancelText || Locale.t(MODAL_CONSTANTS.CANCEL_LABEL_I18N_KEY);

      const okBtn: HTMLButtonElement = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "yt-modal-btn yt-modal-btn-confirm";
      okBtn.textContent = options.okText || Locale.t(MODAL_CONSTANTS.CONFIRM_LABEL_I18N_KEY);

      actionsEl.appendChild(cancelBtn);
      actionsEl.appendChild(okBtn);
      container.appendChild(actionsEl);

      let isSettled: boolean = false;
      let instance: ModalInstance;

      const settle = (confirmed: boolean, closeInstance: boolean): void => {
        if (isSettled) {
          return;
        }
        isSettled = true;

        let firstError: unknown;
        let hasError: boolean = false;
        const captureError = (error: unknown): void => {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        };

        if (closeInstance && instance) {
          try {
            instance.close();
          } catch (error: unknown) {
            captureError(error);
          }
        }

        const actionCallback: (() => void) | undefined = confirmed ? options.onConfirm : options.onCancel;
        if (actionCallback) {
          try {
            actionCallback();
          } catch (error: unknown) {
            captureError(error);
          }
        }

        if (options.onClose) {
          try {
            options.onClose();
          } catch (error: unknown) {
            captureError(error);
          }
        }

        if (hasError) {
          reject(firstError);
          return;
        }
        resolve(confirmed);
      };

      cancelBtn.onclick = (): void => settle(false, true);
      okBtn.onclick = (): void => settle(true, true);

      instance = new ModalInstance({
        size: "small",
        ...options,
        content: container,
        onClose: (): void => {
          settle(false, false);
        }
      });
      }
    );
  },

  alert(options: ModalInstanceOptions = {}): Promise<void> {
    return new Promise<void>(
      (resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: unknown) => void): void => {
      const container: HTMLDivElement = document.createElement("div");

      if (options.content) {
        if (typeof options.content === "string") {
          const msg: HTMLParagraphElement = document.createElement("p");
          msg.className = "yt-modal-text";
          msg.style.marginBottom = "16px";
          msg.textContent = options.content;
          container.appendChild(msg);
        } else if (options.content instanceof HTMLElement) {
          container.appendChild(options.content);
        }
      }

      const actionsEl: HTMLDivElement = document.createElement("div");
      actionsEl.className = "yt-modal-actions";

      const okBtn: HTMLButtonElement = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "yt-modal-btn yt-modal-btn-confirm";
      okBtn.textContent = options.okText || Locale.t(MODAL_CONSTANTS.CONFIRM_LABEL_I18N_KEY);

      actionsEl.appendChild(okBtn);
      container.appendChild(actionsEl);

      let instance: ModalInstance;
      okBtn.onclick = (): void => {
        if (instance) instance.close();
      };

      instance = new ModalInstance({
        size: "small",
        ...options,
        content: container,
        onClose: (): void => {
          try {
            if (options.onClose) {
              options.onClose();
            }
            resolve();
          } catch (error: unknown) {
            reject(error);
          }
        }
      });
      }
    );
  }
};
