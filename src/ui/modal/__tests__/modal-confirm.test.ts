import { afterEach, describe, expect, it } from "vitest";
import { StyleEngine } from "../../../core/style-engine";
import { MODAL_CONSTANTS, Modal } from "../modal";

describe("Modal promise settlement", (): void => {
  afterEach((): void => {
    document.querySelectorAll<HTMLElement>(".yt-modal-backdrop").forEach((element: HTMLElement): void => {
      element.remove();
    });
    StyleEngine.remove(MODAL_CONSTANTS.STYLE_ELEMENT_ID);
  });

  it("preserves confirmed, canceled, and closed results without callbacks", async (): Promise<void> => {
    const confirmed: Promise<boolean> = Modal.confirm();
    const confirmedResult: Promise<void> = expect(confirmed).resolves.toBe(true);
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
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
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
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
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
});
