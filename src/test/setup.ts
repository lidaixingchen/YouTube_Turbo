import { afterEach, beforeEach, vi, expect } from "vitest";
import {
  installFakeObservers,
  resetFakeObservers,
  assertNoActiveFakeObservers
} from "./fake-observers";

interface TrackedListener {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
}

const activeListeners: Set<TrackedListener> = new Set<TrackedListener>();

const originalWindowAddEventListener = window.addEventListener.bind(window);
const originalWindowRemoveEventListener = window.removeEventListener.bind(window);

const JSDOM_INTERNAL_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "focus",
  "focusin",
  "keydown",
  "keyup",
  "mouseover",
  "mousedown",
  "mouseup",
  "click",
  "mouseout"
]);

if (typeof (globalThis as any).ResizeObserver === "undefined") {
  class MockResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (window as any).ResizeObserver = MockResizeObserver;
}

if (typeof (globalThis as any).IntersectionObserver === "undefined") {
  class MockIntersectionObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as any).IntersectionObserver = MockIntersectionObserver;
  (window as any).IntersectionObserver = MockIntersectionObserver;
}

window.addEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): void => {
  if (!JSDOM_INTERNAL_EVENT_TYPES.has(type)) {
    activeListeners.add({ target: window, type, listener });
  }
  originalWindowAddEventListener(type, listener as EventListener, options);
}) as typeof window.addEventListener;

window.removeEventListener = ((
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
): void => {
  for (const item of activeListeners) {
    if (item.target === window && item.type === type && item.listener === listener) {
      activeListeners.delete(item);
      break;
    }
  }
  originalWindowRemoveEventListener(type, listener as EventListener, options);
}) as typeof window.removeEventListener;

beforeEach(() => {
  activeListeners.clear();
  installFakeObservers();
  resetFakeObservers();
});

afterEach(() => {
  try {
    assertNoActiveFakeObservers();
  } finally {
    resetFakeObservers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }

  // 清理 DOM
  if (document.head) {
    document.head.innerHTML = "";
  }
  if (document.body) {
    document.body.innerHTML = "";
  }
  document.documentElement.removeAttribute("tabview-loaded");

  const leakedCount = activeListeners.size;
  if (leakedCount > 0) {
    // 强制清理残留避免影响后续测试
    for (const item of activeListeners) {
      try {
        originalWindowRemoveEventListener(item.type, item.listener);
      } catch {
        // ignore
      }
    }
    activeListeners.clear();
    expect(leakedCount, `Detected ${leakedCount} leaked active event listener(s) on window`).toBe(0);
  }
});
