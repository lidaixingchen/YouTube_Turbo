export class ScopedGridObserver {
  private observer: MutationObserver | null = null;
  private targetEl: HTMLElement | null = null;
  private isSilenced: boolean = false;
  private onMutationCallback: (() => void) | null = null;

  public observe(target: HTMLElement, onMutation: () => void): void {
    if (this.targetEl === target && this.observer) {
      return;
    }
    this.disconnect();

    this.targetEl = target;
    this.onMutationCallback = onMutation;

    this.observer = new MutationObserver((mutations: MutationRecord[]) => {
      if (this.isSilenced) return;
      let hasAdded = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasAdded = true;
          break;
        }
      }
      if (hasAdded && this.onMutationCallback) {
        this.onMutationCallback();
      }
    });

    this.observer.observe(target, {
      childList: true,
      subtree: false
    });
  }

  public runWithSilence(action: () => void): void {
    if (this.isSilenced) {
      action();
      return;
    }

    this.isSilenced = true;
    if (this.observer) {
      this.observer.disconnect();
    }

    try {
      action();
    } finally {
      if (this.targetEl && this.observer) {
        this.observer.observe(this.targetEl, {
          childList: true,
          subtree: false
        });
      }
      this.isSilenced = false;
    }
  }

  public disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.targetEl = null;
    this.onMutationCallback = null;
    this.isSilenced = false;
  }
}
