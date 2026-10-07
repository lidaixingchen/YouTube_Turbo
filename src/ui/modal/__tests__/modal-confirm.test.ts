import { afterEach, describe, expect, it } from "vitest";
import { ShortcutDispatcher } from "../../../core/shortcuts";
import { StyleEngine } from "../../../core/style-engine";
import { Locale } from "../../../i18n";
import { MODAL_CONSTANTS, Modal, type ModalInstance } from "../modal";

function dispatchModalKey(target: HTMLElement, key: string, shiftKey: boolean = false): KeyboardEvent {
  const event: KeyboardEvent = new KeyboardEvent("keydown", {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(event);
  return event;
}

describe("Modal promise settlement", (): void => {
  afterEach((): void => {
    document.querySelectorAll<HTMLElement>(".yt-modal-backdrop").forEach((element: HTMLElement): void => {
      element.remove();
    });
    ShortcutDispatcher.destroy();
    StyleEngine.remove(MODAL_CONSTANTS.STYLE_ELEMENT_ID);
  });

  it("preserves confirmed, canceled, and closed results without callbacks", async (): Promise<void> => {
    const confirmed: Promise<boolean> = Modal.confirm();
    const confirmedResult: Promise<void> = expect(confirmed).resolves.toBe(true);
    expect(document.querySelector<HTMLButtonElement>(".yt-modal-btn-cancel")?.textContent).toBe(
      Locale.t(MODAL_CONSTANTS.CANCEL_LABEL_I18N_KEY)
    );
    expect(document.querySelector<HTMLButtonElement>(".yt-modal-btn-confirm")?.textContent).toBe(
      Locale.t(MODAL_CONSTANTS.CONFIRM_LABEL_I18N_KEY)
    );
    document.querySelector<HTMLButtonElement>(".yt-modal-btn-confirm")?.click();
    await confirmedResult;

    const canceled: Promise<boolean> = Modal.confirm();
    const canceledResult: Promise<void> = expect(canceled).resolves.toBe(false);
    document.querySelector<HTMLButtonElement>(".yt-modal-btn-cancel")?.click();
    await canceledResult;

    const closed: Promise<boolean> = Modal.confirm();
    const closedResult: Promise<void> = expect(closed).resolves.toBe(false);
    const backdrop: HTMLElement | null = document.querySelector<HTMLElement>(".yt-modal-backdrop");
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await closedResult;
  });

  it("rejects when the confirmation callback throws", async (): Promise<void> => {
    const callbackError: Error = new Error("confirmation failed");
    const confirmation: Promise<boolean> = Modal.confirm({
      onConfirm: (): void => {
        throw callbackError;
      }
    });
    const rejection: Promise<void> = expect(confirmation).rejects.toBe(callbackError);

    document.querySelector<HTMLButtonElement>(".yt-modal-btn-confirm")?.click();
    await rejection;
  });

  it("rejects when the cancellation callback throws", async (): Promise<void> => {
    const callbackError: Error = new Error("cancellation failed");
    const confirmation: Promise<boolean> = Modal.confirm({
      onCancel: (): void => {
        throw callbackError;
      }
    });
    const rejection: Promise<void> = expect(confirmation).rejects.toBe(callbackError);

    document.querySelector<HTMLButtonElement>(".yt-modal-btn-cancel")?.click();
    await rejection;
  });

  it("rejects when the close callback throws", async (): Promise<void> => {
    const callbackError: Error = new Error("close failed");
    const confirmation: Promise<boolean> = Modal.confirm({
      title: "Confirm close",
      onClose: (): void => {
        throw callbackError;
      }
    });
    const rejection: Promise<void> = expect(confirmation).rejects.toBe(callbackError);

    document.querySelector<HTMLButtonElement>(".yt-modal-close-btn")?.click();
    await rejection;
  });

  it("runs the confirmation callback before a throwing close callback", async (): Promise<void> => {
    const callbackError: Error = new Error("close failed");
    const callbacks: string[] = [];
    const confirmation: Promise<boolean> = Modal.confirm({
      onConfirm: (): void => {
        callbacks.push("confirm");
      },
      onClose: (): void => {
        callbacks.push("close");
        throw callbackError;
      }
    });
    const rejection: Promise<void> = expect(confirmation).rejects.toBe(callbackError);

    document.querySelector<HTMLButtonElement>(".yt-modal-btn-confirm")?.click();
    await rejection;

    expect(callbacks).toEqual(["confirm", "close"]);
    expect(document.querySelector(".yt-modal-backdrop")).toBeNull();
  });

  it("runs the cancellation callback before a throwing close callback", async (): Promise<void> => {
    const callbackError: Error = new Error("close failed");
    const callbacks: string[] = [];
    const confirmation: Promise<boolean> = Modal.confirm({
      onCancel: (): void => {
        callbacks.push("cancel");
      },
      onClose: (): void => {
        callbacks.push("close");
        throw callbackError;
      }
    });
    const rejection: Promise<void> = expect(confirmation).rejects.toBe(callbackError);

    document.querySelector<HTMLButtonElement>(".yt-modal-btn-cancel")?.click();
    await rejection;

    expect(callbacks).toEqual(["cancel", "close"]);
    expect(document.querySelector(".yt-modal-backdrop")).toBeNull();
  });

  it("runs the close callback when the confirmation callback throws", async (): Promise<void> => {
    const callbackError: Error = new Error("confirmation failed");
    const closeError: Error = new Error("close failed");
    const callbacks: string[] = [];
    const confirmation: Promise<boolean> = Modal.confirm({
      onConfirm: (): void => {
        callbacks.push("confirm");
        throw callbackError;
      },
      onClose: (): void => {
        callbacks.push("close");
        throw closeError;
      }
    });
    const rejection: Promise<void> = expect(confirmation).rejects.toBe(callbackError);

    document.querySelector<HTMLButtonElement>(".yt-modal-btn-confirm")?.click();
    await rejection;

    expect(callbacks).toEqual(["confirm", "close"]);
  });

  it("runs the close callback when the cancellation callback throws", async (): Promise<void> => {
    const callbackError: Error = new Error("cancellation failed");
    const closeError: Error = new Error("close failed");
    const callbacks: string[] = [];
    const confirmation: Promise<boolean> = Modal.confirm({
      onCancel: (): void => {
        callbacks.push("cancel");
        throw callbackError;
      },
      onClose: (): void => {
        callbacks.push("close");
        throw closeError;
      }
    });
    const rejection: Promise<void> = expect(confirmation).rejects.toBe(callbackError);

    document.querySelector<HTMLButtonElement>(".yt-modal-btn-cancel")?.click();
    await rejection;

    expect(callbacks).toEqual(["cancel", "close"]);
  });

  it("uses action-then-close callback order for every confirmation close path", async (): Promise<void> => {
    const confirmedCallbacks: string[] = [];
    const confirmed: Promise<boolean> = Modal.confirm({
      onConfirm: (): void => {
        confirmedCallbacks.push("confirm");
      },
      onClose: (): void => {
        confirmedCallbacks.push("close");
      }
    });
    const confirmedResult: Promise<void> = expect(confirmed).resolves.toBe(true);
    document.querySelector<HTMLButtonElement>(".yt-modal-btn-confirm")?.click();
    await confirmedResult;
    expect(confirmedCallbacks).toEqual(["confirm", "close"]);

    const closeByCancelButton = async (): Promise<string[]> => {
      const callbacks: string[] = [];
      const confirmation: Promise<boolean> = Modal.confirm({
        onCancel: (): void => {
          callbacks.push("cancel");
        },
        onClose: (): void => {
          callbacks.push("close");
        }
      });
      const result: Promise<void> = expect(confirmation).resolves.toBe(false);
      document.querySelector<HTMLButtonElement>(".yt-modal-btn-cancel")?.click();
      await result;
      return callbacks;
    };

    const closeByTitleButton = async (): Promise<string[]> => {
      const callbacks: string[] = [];
      const confirmation: Promise<boolean> = Modal.confirm({
        title: "Close",
        onCancel: (): void => {
          callbacks.push("cancel");
        },
        onClose: (): void => {
          callbacks.push("close");
        }
      });
      const result: Promise<void> = expect(confirmation).resolves.toBe(false);
      document.querySelector<HTMLButtonElement>(".yt-modal-close-btn")?.click();
      await result;
      return callbacks;
    };

    const closeByBackdrop = async (): Promise<string[]> => {
      const callbacks: string[] = [];
      const confirmation: Promise<boolean> = Modal.confirm({
        onCancel: (): void => {
          callbacks.push("cancel");
        },
        onClose: (): void => {
          callbacks.push("close");
        }
      });
      const result: Promise<void> = expect(confirmation).resolves.toBe(false);
      const backdrop: HTMLElement | null = document.querySelector<HTMLElement>(".yt-modal-backdrop");
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await result;
      return callbacks;
    };

    const closeByEscape = async (): Promise<string[]> => {
      const callbacks: string[] = [];
      const confirmation: Promise<boolean> = Modal.confirm({
        onCancel: (): void => {
          callbacks.push("cancel");
        },
        onClose: (): void => {
          callbacks.push("close");
        }
      });
      const result: Promise<void> = expect(confirmation).resolves.toBe(false);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await result;
      return callbacks;
    };

    expect(await closeByCancelButton()).toEqual(["cancel", "close"]);
    expect(await closeByTitleButton()).toEqual(["cancel", "close"]);
    expect(await closeByBackdrop()).toEqual(["cancel", "close"]);
    expect(await closeByEscape()).toEqual(["cancel", "close"]);
  });

  it("ignores repeated close actions after the first settlement", async (): Promise<void> => {
    const callbacks: string[] = [];
    const confirmation: Promise<boolean> = Modal.confirm({
      onCancel: (): void => {
        callbacks.push("cancel");
      },
      onClose: (): void => {
        callbacks.push("close");
      }
    });
    const result: Promise<void> = expect(confirmation).resolves.toBe(false);
    const cancelButton: HTMLButtonElement | null = document.querySelector<HTMLButtonElement>(".yt-modal-btn-cancel");
    const backdrop: HTMLElement | null = document.querySelector<HTMLElement>(".yt-modal-backdrop");

    cancelButton?.click();
    cancelButton?.click();
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await result;

    expect(callbacks).toEqual(["cancel", "close"]);
    expect(document.querySelector(".yt-modal-backdrop")).toBeNull();
  });

  it("rejects alert settlement when its close callback throws", async (): Promise<void> => {
    const callbackError: Error = new Error("alert close failed");
    const alert: Promise<void> = Modal.alert({
      onClose: (): void => {
        throw callbackError;
      }
    });
    const rejection: Promise<void> = expect(alert).rejects.toBe(callbackError);

    document.querySelector<HTMLButtonElement>(".yt-modal-btn-confirm")?.click();
    await rejection;
  });

  it("keeps dialog focus and keyboard handling in the topmost modal", (): void => {
    const opener: HTMLButtonElement = document.createElement("button");
    opener.type = "button";
    document.body.appendChild(opener);
    opener.focus();

    const firstInput: HTMLInputElement = document.createElement("input");
    const firstModal: ModalInstance = Modal.open({ title: "Settings", content: firstInput });
    expect(firstModal.container.getAttribute("role")).toBe("dialog");
    expect(firstModal.container.getAttribute("aria-modal")).toBe("true");
    const firstTitleId: string | null = firstModal.container.getAttribute("aria-labelledby");
    expect(firstTitleId).not.toBeNull();
    expect(firstModal.container.querySelector(`#${firstTitleId}`)?.textContent).toBe("Settings");
    expect(document.activeElement).toBe(firstInput);

    const secondButton: HTMLButtonElement = document.createElement("button");
    secondButton.type = "button";
    const secondModal: ModalInstance = Modal.open({ title: "Confirm", content: secondButton });
    expect(document.activeElement).toBe(secondButton);
    expect(firstModal.container.getAttribute("aria-modal")).toBe("false");
    expect(secondModal.container.getAttribute("aria-modal")).toBe("true");

    const closeButton: HTMLButtonElement | null = secondModal.container.querySelector<HTMLButtonElement>(
      ".yt-modal-close-btn"
    );
    expect(closeButton).not.toBeNull();
    expect(closeButton?.getAttribute("aria-label")).toBe(Locale.t("modal_close"));
    const tabEvent: KeyboardEvent = dispatchModalKey(secondButton, MODAL_CONSTANTS.KEY_TAB);
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton);

    const reverseTabEvent: KeyboardEvent = dispatchModalKey(
      closeButton ?? secondButton,
      MODAL_CONSTANTS.KEY_TAB,
      true
    );
    expect(reverseTabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(secondButton);

    opener.focus();
    expect(document.activeElement).toBe(secondButton);

    firstModal.close();
    expect(firstModal.backdrop.isConnected).toBe(false);
    expect(secondModal.backdrop.isConnected).toBe(true);
    expect(document.activeElement).toBe(secondButton);

    secondModal.close();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("uses an existing localized name without a title and tolerates a removed opener", (): void => {
    const opener: HTMLButtonElement = document.createElement("button");
    opener.type = "button";
    document.body.appendChild(opener);
    opener.focus();

    const modal: ModalInstance = Modal.open({ content: "Status" });
    expect(modal.container.getAttribute("aria-label")).toBe(Locale.t("function_setting_title"));
    expect(modal.container.hasAttribute("aria-labelledby")).toBe(false);

    opener.remove();
    expect((): void => modal.close()).not.toThrow();
    expect(modal.backdrop.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(opener);
  });

  it("keeps keyboard events available to modal controls while suppressing background shortcuts", (): void => {
    const input: HTMLInputElement = document.createElement("input");
    const button: HTMLButtonElement = document.createElement("button");
    button.type = "button";
    const content: HTMLDivElement = document.createElement("div");
    content.append(input, button);
    const modal: ModalInstance = Modal.open({ content });
    const localKeys: string[] = [];
    const backgroundKeys: string[] = [];
    const outsideButton: HTMLButtonElement = document.createElement("button");
    outsideButton.type = "button";
    document.body.appendChild(outsideButton);

    input.addEventListener("keydown", (event: KeyboardEvent): void => {
      localKeys.push(`input:${event.key}`);
    });
    button.addEventListener("keydown", (event: KeyboardEvent): void => {
      localKeys.push(`button:${event.key}`);
    });
    outsideButton.addEventListener("keydown", (event: KeyboardEvent): void => {
      backgroundKeys.push(event.key);
    });

    const unregisterArrow: () => void = ShortcutDispatcher.register({
      key: "ArrowUp",
      handler: (): void => {
        backgroundKeys.push("shortcut:ArrowUp");
      }
    });
    const unregisterEnter: () => void = ShortcutDispatcher.register({
      key: "Enter",
      handler: (): void => {
        backgroundKeys.push("shortcut:Enter");
      }
    });

    dispatchModalKey(input, "ArrowUp");
    dispatchModalKey(button, "ArrowUp");
    dispatchModalKey(button, "Enter");
    expect(localKeys).toEqual(["input:ArrowUp", "button:ArrowUp", "button:Enter"]);
    expect(backgroundKeys).toEqual([]);

    outsideButton.focus();
    dispatchModalKey(outsideButton, "ArrowUp");
    expect(backgroundKeys).toEqual([]);

    modal.close();
    dispatchModalKey(outsideButton, "ArrowUp");
    dispatchModalKey(outsideButton, "Enter");
    expect(backgroundKeys).toEqual(["shortcut:ArrowUp", "ArrowUp", "shortcut:Enter", "Enter"]);

    unregisterArrow();
    unregisterEnter();
    outsideButton.remove();
  });

  it("orders positive tab indexes before natural order and wraps in that order", (): void => {
    const naturalButton: HTMLButtonElement = document.createElement("button");
    naturalButton.type = "button";
    const secondButton: HTMLButtonElement = document.createElement("button");
    secondButton.type = "button";
    secondButton.tabIndex = 2;
    const firstButton: HTMLButtonElement = document.createElement("button");
    firstButton.type = "button";
    firstButton.tabIndex = 1;
    const content: HTMLDivElement = document.createElement("div");
    content.append(naturalButton, secondButton, firstButton);

    const modal: ModalInstance = Modal.open({ content });
    expect(document.activeElement).toBe(firstButton);

    const reverseTabEvent: KeyboardEvent = dispatchModalKey(firstButton, MODAL_CONSTANTS.KEY_TAB, true);
    expect(reverseTabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(naturalButton);
    modal.close();
  });

  it("excludes every negative tabindex from initial focus and tab cycling", (): void => {
    const excludedButton: HTMLButtonElement = document.createElement("button");
    excludedButton.type = "button";
    excludedButton.tabIndex = -2;

    const modal: ModalInstance = Modal.open({ content: excludedButton });
    expect(document.activeElement).toBe(modal.container);

    const tabEvent: KeyboardEvent = dispatchModalKey(modal.container, MODAL_CONSTANTS.KEY_TAB);
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(modal.container);
    modal.close();
  });

  it("excludes controls disabled by a fieldset from modal focus", (): void => {
    const fieldset: HTMLFieldSetElement = document.createElement("fieldset");
    fieldset.disabled = true;
    const disabledButton: HTMLButtonElement = document.createElement("button");
    disabledButton.type = "button";
    fieldset.appendChild(disabledButton);

    const modal: ModalInstance = Modal.open({ content: fieldset });
    expect(document.activeElement).toBe(modal.container);
    modal.close();
  });

  it("excludes controls under a CSS-hidden ancestor from modal focus", (): void => {
    const hiddenAncestor: HTMLDivElement = document.createElement("div");
    hiddenAncestor.style.display = MODAL_CONSTANTS.FOCUSABLE_HIDDEN_DISPLAY;
    const hiddenInput: HTMLInputElement = document.createElement("input");
    hiddenAncestor.appendChild(hiddenInput);

    const modal: ModalInstance = Modal.open({ content: hiddenAncestor });
    expect(document.activeElement).toBe(modal.container);
    modal.close();
  });

  it("focuses and traps an empty modal container", (): void => {
    const modal: ModalInstance = Modal.open({});
    expect(document.activeElement).toBe(modal.container);

    const tabEvent: KeyboardEvent = dispatchModalKey(modal.container, MODAL_CONSTANTS.KEY_TAB);
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(modal.container);
    modal.close();
  });

  it("lets descendants cancel Escape and Tab before only the topmost modal handles them", (): void => {
    const lowerButton: HTMLButtonElement = document.createElement("button");
    lowerButton.type = "button";
    const lowerModal: ModalInstance = Modal.open({ content: lowerButton });

    const firstTopButton: HTMLButtonElement = document.createElement("button");
    firstTopButton.type = "button";
    const lastTopButton: HTMLButtonElement = document.createElement("button");
    lastTopButton.type = "button";
    const topContent: HTMLDivElement = document.createElement("div");
    topContent.append(firstTopButton, lastTopButton);
    let cancelNextEscape: boolean = true;
    lastTopButton.addEventListener("keydown", (event: KeyboardEvent): void => {
      if (event.key === MODAL_CONSTANTS.KEY_ESCAPE && cancelNextEscape) {
        cancelNextEscape = false;
        event.preventDefault();
      }
      if (event.key === MODAL_CONSTANTS.KEY_TAB) {
        event.preventDefault();
      }
    });

    const topModal: ModalInstance = Modal.open({ content: topContent });
    expect(lowerModal.container.getAttribute("aria-modal")).toBe("false");
    expect(topModal.container.getAttribute("aria-modal")).toBe("true");
    lastTopButton.focus();

    const canceledTabEvent: KeyboardEvent = dispatchModalKey(lastTopButton, MODAL_CONSTANTS.KEY_TAB);
    expect(canceledTabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(lastTopButton);

    const canceledEscapeEvent: KeyboardEvent = dispatchModalKey(lastTopButton, MODAL_CONSTANTS.KEY_ESCAPE);
    expect(canceledEscapeEvent.defaultPrevented).toBe(true);
    expect(topModal.backdrop.isConnected).toBe(true);
    expect(lowerModal.backdrop.isConnected).toBe(true);

    dispatchModalKey(lastTopButton, MODAL_CONSTANTS.KEY_ESCAPE);
    expect(topModal.backdrop.isConnected).toBe(false);
    expect(lowerModal.backdrop.isConnected).toBe(true);
    expect(lowerModal.container.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(lowerButton);
    lowerModal.close();
  });
});
