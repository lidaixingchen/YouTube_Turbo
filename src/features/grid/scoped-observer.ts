export interface MutationBatchSummary {
  hasAdded: boolean;
  hasRemoved: boolean;
  addedNodes: Node[];
  removedNodes: Node[];
}

export class ScopedGridObserver {
  private observer: MutationObserver | null = null;
  private targetEl: HTMLElement | null = null;
  private silenceGateDepth: number = 0;
  private onMutationCallback: ((summary: MutationBatchSummary) => void) | null = null;

  public observe(target: HTMLElement, onMutation: (summary: MutationBatchSummary) => void): void {
    if (this.targetEl === target && this.observer) {
      return;
    }
    this.disconnect();

    this.targetEl = target;
    this.onMutationCallback = onMutation;

    this.observer = new MutationObserver((mutations: MutationRecord[]) => {
      if (this.silenceGateDepth > 0) {
        return;
      }

      const addedNodes: Node[] = [];
      const removedNodes: Node[] = [];

      for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        for (let j = 0; j < mutation.addedNodes.length; j++) {
          addedNodes.push(mutation.addedNodes[j]);
        }
        for (let k = 0; k < mutation.removedNodes.length; k++) {
          removedNodes.push(mutation.removedNodes[k]);
        }
      }

      const hasAdded = addedNodes.length > 0;
      const hasRemoved = removedNodes.length > 0;

      if ((hasAdded || hasRemoved) && this.onMutationCallback) {
        this.onMutationCallback({
          hasAdded,
          hasRemoved,
          addedNodes,
          removedNodes
        });
      }
    });

    this.observer.observe(target, {
      childList: true,
      subtree: false
    });
  }

  public runWithSilence(action: () => void): void {
    this.silenceGateDepth++;
    try {
      action();
    } finally {
      queueMicrotask(() => {
        this.silenceGateDepth = Math.max(0, this.silenceGateDepth - 1);
      });
    }
  }

  public disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.targetEl = null;
    this.onMutationCallback = null;
    this.silenceGateDepth = 0;
  }
}
