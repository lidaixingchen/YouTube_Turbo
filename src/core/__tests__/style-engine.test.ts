import { describe, it, expect, beforeEach } from "vitest";
import { StyleEngine } from "../style-engine";

describe("StyleEngine CSSOM Dirty Check and Connection Guard", () => {
  beforeEach(() => {
    StyleEngine.remove("test-feature");
    StyleEngine.remove("test-feature-2");
  });

  it("should create and mount style element on first injection", () => {
    const css = ".test-class { color: red; }";
    const el = StyleEngine.inject("test-feature", css);

    expect(el).toBeInstanceOf(HTMLStyleElement);
    expect(el.id).toBe("yt-style-test-feature");
    expect(el.textContent).toBe(css);
    expect(el.isConnected).toBe(true);
    expect(StyleEngine.has("test-feature")).toBe(true);
  });

  it("should short-circuit and avoid mutating textContent when injected with identical content", () => {
    const css = ".test-class { color: red; }";
    const el1 = StyleEngine.inject("test-feature", css);

    let setterCallCount = 0;
    const originalDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    if (originalDescriptor && originalDescriptor.set) {
      const origSet = originalDescriptor.set;
      Object.defineProperty(el1, "textContent", {
        set(v: string): void {
          setterCallCount++;
          origSet.call(this, v);
        },
        get(): string {
          return originalDescriptor.get ? originalDescriptor.get.call(this) : "";
        },
        configurable: true
      });
    }

    const el2 = StyleEngine.inject("test-feature", css);
    expect(el2).toBe(el1);
    expect(setterCallCount).toBe(0);
  });

  it("should update textContent when content changes", () => {
    const css1 = ".test-class { color: red; }";
    const css2 = ".test-class { color: blue; }";

    const el1 = StyleEngine.inject("test-feature", css1);
    expect(el1.textContent).toBe(css1);

    const el2 = StyleEngine.inject("test-feature", css2);
    expect(el2).toBe(el1);
    expect(el2.textContent).toBe(css2);
  });

  it("should recover and remount disconnected style element even if content is identical", () => {
    const css = ".test-class { color: red; }";
    const el = StyleEngine.inject("test-feature", css);
    expect(el.isConnected).toBe(true);

    el.remove();
    expect(el.isConnected).toBe(false);
    expect(StyleEngine.has("test-feature")).toBe(false);

    const recovered = StyleEngine.inject("test-feature", css);
    expect(recovered).toBe(el);
    expect(recovered.isConnected).toBe(true);
  });

  it("should clean up element and maps on remove", () => {
    const css = ".test-class { color: red; }";
    const el = StyleEngine.inject("test-feature", css);
    expect(StyleEngine.has("test-feature")).toBe(true);

    StyleEngine.remove("test-feature");
    expect(StyleEngine.has("test-feature")).toBe(false);
    expect(el.isConnected).toBe(false);
  });
});
