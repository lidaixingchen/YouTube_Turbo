import { vi, expect } from "vitest";

export interface FakeObserverRecord<TTarget = Node, TOptions = unknown> {
  target: TTarget;
  options?: TOptions;
}

export class FakeMutationObserver {
  public static readonly allInstances: FakeMutationObserver[] = [];
  public static readonly activeInstances: Set<FakeMutationObserver> = new Set();

  public readonly callback: MutationCallback;
  public readonly observedTargets: FakeObserverRecord<Node, MutationObserverInit>[] = [];
  public disconnectCount: number = 0;

  public constructor(callback: MutationCallback) {
    this.callback = callback;
    FakeMutationObserver.allInstances.push(this);
  }

  public observe(target: Node, options?: MutationObserverInit): void {
    this.observedTargets.push({ target, options });
    FakeMutationObserver.activeInstances.add(this);
  }

  public disconnect(): void {
    this.disconnectCount++;
    this.observedTargets.length = 0;
    FakeMutationObserver.activeInstances.delete(this);
  }

  public takeRecords(): MutationRecord[] {
    return [];
  }

  public trigger(records: Partial<MutationRecord>[]): void {
    const fullRecords = records.map((rec) => {
      return {
        type: rec.type ?? "attributes",
        target: rec.target ?? (this.observedTargets[0]?.target as Node),
        addedNodes: rec.addedNodes ?? ([] as unknown as NodeList),
        removedNodes: rec.removedNodes ?? ([] as unknown as NodeList),
        previousSibling: rec.previousSibling ?? null,
        nextSibling: rec.nextSibling ?? null,
        attributeName: rec.attributeName ?? null,
        attributeNamespace: rec.attributeNamespace ?? null,
        oldValue: rec.oldValue ?? null
      } as MutationRecord;
    });
    this.callback(fullRecords, this as unknown as MutationObserver);
  }
}

export class FakeResizeObserver {
  public static readonly allInstances: FakeResizeObserver[] = [];
  public static readonly activeInstances: Set<FakeResizeObserver> = new Set();

  public readonly callback: ResizeObserverCallback;
  public readonly observedTargets: Element[] = [];
  public disconnectCount: number = 0;

  public constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.allInstances.push(this);
  }

  public observe(target: Element): void {
    if (!this.observedTargets.includes(target)) {
      this.observedTargets.push(target);
    }
    FakeResizeObserver.activeInstances.add(this);
  }

  public unobserve(target: Element): void {
    const idx = this.observedTargets.indexOf(target);
    if (idx !== -1) {
      this.observedTargets.splice(idx, 1);
    }
  }

  public disconnect(): void {
    this.disconnectCount++;
    this.observedTargets.length = 0;
    FakeResizeObserver.activeInstances.delete(this);
  }

  public trigger(entries: Partial<ResizeObserverEntry>[]): void {
    const fullEntries = entries.map((entry) => {
      const target = entry.target ?? this.observedTargets[0];
      const contentRect = entry.contentRect ?? ({
        width: 100,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 100,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRectReadOnly);

      return {
        target,
        contentRect,
        borderBoxSize: entry.borderBoxSize ?? [
          { inlineSize: contentRect.width, blockSize: contentRect.height }
        ],
        contentBoxSize: entry.contentBoxSize ?? [
          { inlineSize: contentRect.width, blockSize: contentRect.height }
        ],
        devicePixelContentBoxSize: entry.devicePixelContentBoxSize ?? []
      } as unknown as ResizeObserverEntry;
    });

    this.callback(fullEntries, this as unknown as ResizeObserver);
  }
}

export class FakeIntersectionObserver {
  public static readonly allInstances: FakeIntersectionObserver[] = [];
  public static readonly activeInstances: Set<FakeIntersectionObserver> = new Set();

  public readonly callback: IntersectionObserverCallback;
  public readonly options?: IntersectionObserverInit;
  public readonly observedTargets: Element[] = [];
  public disconnectCount: number = 0;

  public constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.allInstances.push(this);
  }

  public observe(target: Element): void {
    if (!this.observedTargets.includes(target)) {
      this.observedTargets.push(target);
    }
    FakeIntersectionObserver.activeInstances.add(this);
  }

  public unobserve(target: Element): void {
    const idx = this.observedTargets.indexOf(target);
    if (idx !== -1) {
      this.observedTargets.splice(idx, 1);
    }
  }

  public disconnect(): void {
    this.disconnectCount++;
    this.observedTargets.length = 0;
    FakeIntersectionObserver.activeInstances.delete(this);
  }

  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  public trigger(entries: Partial<IntersectionObserverEntry>[]): void {
    const fullEntries = entries.map((entry) => {
      const target = entry.target ?? this.observedTargets[0];
      const isIntersecting = entry.isIntersecting ?? true;
      const boundingClientRect = entry.boundingClientRect ?? ({
        width: 100,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 100,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as DOMRectReadOnly);

      return {
        target,
        isIntersecting,
        intersectionRatio: entry.intersectionRatio ?? (isIntersecting ? 1 : 0),
        boundingClientRect,
        intersectionRect: entry.intersectionRect ?? boundingClientRect,
        rootBounds: entry.rootBounds ?? null,
        time: entry.time ?? Date.now()
      } as unknown as IntersectionObserverEntry;
    });

    this.callback(fullEntries, this as unknown as IntersectionObserver);
  }
}

export function installFakeObservers(): void {
  vi.stubGlobal("MutationObserver", FakeMutationObserver);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
}

export function resetFakeObservers(): void {
  FakeMutationObserver.allInstances.length = 0;
  FakeMutationObserver.activeInstances.clear();

  FakeResizeObserver.allInstances.length = 0;
  FakeResizeObserver.activeInstances.clear();

  FakeIntersectionObserver.allInstances.length = 0;
  FakeIntersectionObserver.activeInstances.clear();
}

export function assertNoActiveFakeObservers(): void {
  expect(
    FakeMutationObserver.activeInstances.size,
    `Detected ${FakeMutationObserver.activeInstances.size} active MutationObserver instance(s)`
  ).toBe(0);

  expect(
    FakeResizeObserver.activeInstances.size,
    `Detected ${FakeResizeObserver.activeInstances.size} active ResizeObserver instance(s)`
  ).toBe(0);

  expect(
    FakeIntersectionObserver.activeInstances.size,
    `Detected ${FakeIntersectionObserver.activeInstances.size} active IntersectionObserver instance(s)`
  ).toBe(0);
}
