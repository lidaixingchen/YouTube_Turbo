import type {
  ObserverConfig,
  MutationObserverConfig,
  ResizeObserverConfig,
  IntersectionObserverConfig
} from "./types";

interface ActiveObserverEntry {
  config: ObserverConfig;
  instance: MutationObserver | ResizeObserver | IntersectionObserver | null;
  active: boolean;
}

export class ObserverRegistry {
  private static instance: ObserverRegistry | null = null;
  private observers: Map<string, ActiveObserverEntry> = new Map();
  private eventCleanupFns: Array<() => void> = [];

  public static getInstance(): ObserverRegistry {
    if (!ObserverRegistry.instance) {
      ObserverRegistry.instance = new ObserverRegistry();
    }
    return ObserverRegistry.instance;
  }

  public register(config: ObserverConfig): void {
    if (this.observers.has(config.id)) {
      this.deactivate(config.id);
    }
    this.observers.set(config.id, {
      config,
      instance: null,
      active: false
    });
  }

  public activate(id?: string): void {
    if (id) {
      const entry = this.observers.get(id);
      if (entry && !entry.active) {
        this.bindObserver(entry);
      }
      return;
    }

    for (const entry of this.observers.values()) {
      if (!entry.active) {
        this.bindObserver(entry);
      }
    }
  }

  public deactivate(id?: string): void {
    if (id) {
      const entry = this.observers.get(id);
      if (entry && entry.active) {
        this.unbindObserver(entry);
      }
      return;
    }

    for (const entry of this.observers.values()) {
      if (entry.active) {
        this.unbindObserver(entry);
      }
    }
  }

  public retryPending(): void {
    for (const entry of this.observers.values()) {
      if (!entry.active || entry.instance === null) {
        this.bindObserver(entry);
      }
    }
  }

  public addDOMListener<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (ev: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  public addDOMListener<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (ev: DocumentEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  public addDOMListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    target.addEventListener(type, listener, options);
    this.eventCleanupFns.push(() => {
      target.removeEventListener(type, listener, options);
    });
  }

  public clearAll(): void {
    this.deactivate();
    this.observers.clear();

    for (const cleanup of this.eventCleanupFns) {
      try {
        cleanup();
      } catch (err) {
        console.warn("[ObserverRegistry] Failed to cleanup DOM event listener", err);
      }
    }
    this.eventCleanupFns = [];
  }

  private bindObserver(entry: ActiveObserverEntry): void {
    const { config } = entry;
    const target = config.getTarget();
    if (!target) {
      return;
    }

    try {
      if (config.type === "mutation") {
        const mutConfig = config as MutationObserverConfig;
        const observer = new MutationObserver(mutConfig.callback);
        observer.observe(target as Node, mutConfig.options);
        entry.instance = observer;
        entry.active = true;
      } else if (config.type === "resize") {
        const resConfig = config as ResizeObserverConfig;
        const observer = new ResizeObserver(resConfig.callback);
        observer.observe(target as Element);
        entry.instance = observer;
        entry.active = true;
      } else if (config.type === "intersection") {
        const intConfig = config as IntersectionObserverConfig;
        const observer = new IntersectionObserver(intConfig.callback, intConfig.options);
        observer.observe(target as Element);
        entry.instance = observer;
        entry.active = true;
      }
    } catch (err) {
      console.warn(`[ObserverRegistry] Failed to bind observer '${config.id}':`, err);
    }
  }

  private unbindObserver(entry: ActiveObserverEntry): void {
    if (entry.instance) {
      try {
        entry.instance.disconnect();
      } catch (err) {
        console.warn(`[ObserverRegistry] Failed to disconnect observer '${entry.config.id}':`, err);
      }
      entry.instance = null;
    }
    entry.active = false;
  }
}
