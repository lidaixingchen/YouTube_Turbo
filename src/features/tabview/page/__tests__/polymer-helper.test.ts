import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PolymerHelper } from "../polymer-helper";
import { PAGE_CONSTANTS } from "../constants";

interface CeWaitRegistryStateForTest {
  readonly entries: Map<string, unknown>;
}

let createdTags: Set<string> = new Set<string>();

function createTestTag(suffix: string): string {
  const tag: string = `tyt-test-ce-${suffix}`;
  createdTags.add(tag);
  return tag;
}

function getSharedWaitEntries(): Map<string, unknown> | undefined {
  const registryState: Record<symbol, CeWaitRegistryStateForTest | undefined> =
    customElements as unknown as Record<symbol, CeWaitRegistryStateForTest | undefined>;
  return registryState[Symbol.for(PAGE_CONSTANTS.SYMBOLS.CE_WAIT_REGISTRY)]?.entries;
}

beforeEach(() => {
  createdTags = new Set<string>();
});

afterEach(async () => {
  for (const tag of createdTags) {
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }
  }
  await Promise.resolve();
  vi.restoreAllMocks();
});

describe("PolymerHelper.retrieveCE", () => {
  it("resolves the controller prototype for an already defined tag", async () => {
    const tag = createTestTag("defined");
    class TestElement extends HTMLElement {
      public static readonly marker = "controller";
    }
    customElements.define(tag, TestElement);

    const proto = await PolymerHelper.retrieveCE(tag);
    expect(proto).toBe(TestElement.prototype);
  });

  it("resolves null for an invalid custom element tag", async () => {
    const proto = await PolymerHelper.retrieveCE("invalid<<tag>>");
    expect(proto).toBeNull();
  });

  it("resolves the prototype once the tag becomes defined later", async () => {
    const tag = createTestTag("late");
    class LateElement extends HTMLElement {}
    const pending = PolymerHelper.retrieveCE(tag);
    customElements.define(tag, LateElement);
    const proto = await pending;
    expect(proto).not.toBeNull();
    expect((proto as unknown as Record<string, unknown>)).toBe(LateElement.prototype);
  });

  it("resolves null as soon as the abort signal fires while waiting", async () => {
    const tag = createTestTag("abort");
    const controller = new AbortController();
    const pending = PolymerHelper.retrieveCE(tag, controller.signal);
    controller.abort();
    await expect(pending).resolves.toBeNull();
  });

  it("ignores abort for a subscription that already settled", async () => {
    const tag = createTestTag("abort-after-settle");
    class SettleElement extends HTMLElement {}
    customElements.define(tag, SettleElement);
    const controller = new AbortController();
    const proto = await PolymerHelper.retrieveCE(tag, controller.signal);
    expect(proto).not.toBeNull();
    controller.abort();
    expect(proto).not.toBeNull();
  });

  it("deduplicates the native wait entry for concurrent subscriptions", async () => {
    const tag = createTestTag("dedup");
    const whenDefinedSpy = vi.spyOn(customElements, "whenDefined");
    const first = PolymerHelper.retrieveCE(tag);
    const second = PolymerHelper.retrieveCE(tag);
    expect(whenDefinedSpy).toHaveBeenCalledTimes(1);

    class DedupElement extends HTMLElement {}
    customElements.define(tag, DedupElement);
    await Promise.all([first, second]);
    expect(whenDefinedSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves cancelled subscriptions to null but keeps resolving active ones", async () => {
    const tag = createTestTag("mixed");
    const controller = new AbortController();
    const cancelled = PolymerHelper.retrieveCE(tag, controller.signal);
    const active = PolymerHelper.retrieveCE(tag);
    controller.abort();
    await expect(cancelled).resolves.toBeNull();

    class MixedElement extends HTMLElement {}
    customElements.define(tag, MixedElement);
    await expect(active).resolves.not.toBeNull();
  });

  it("keeps the wait entry while subscriptions exist and removes it after definition", async () => {
    const tag = createTestTag("entry-lifecycle");
    const whenDefinedSpy = vi.spyOn(customElements, "whenDefined");
    const controller = new AbortController();
    const pending = PolymerHelper.retrieveCE(tag, controller.signal);
    controller.abort();
    await expect(pending).resolves.toBeNull();

    class LifecycleElement extends HTMLElement {}
    customElements.define(tag, LifecycleElement);
    await PolymerHelper.retrieveCE(tag);
    expect(whenDefinedSpy).toHaveBeenCalledTimes(1);

    const fastPath = await PolymerHelper.retrieveCE(tag);
    expect(fastPath).toBe(LifecycleElement.prototype);
    expect(whenDefinedSpy).toHaveBeenCalledTimes(1);
  });

  it("shares one pending wait across isolated helper modules and resolves active subscribers after definition", async () => {
    const tag = createTestTag("shared-modules");
    const whenDefinedSpy = vi.spyOn(customElements, "whenDefined");
    const controller = new AbortController();

    vi.resetModules();
    const firstModule = await import("../polymer-helper");
    const cancelled = firstModule.PolymerHelper.retrieveCE(tag, controller.signal);

    vi.resetModules();
    const secondModule = await import("../polymer-helper");
    const active = secondModule.PolymerHelper.retrieveCE(tag);

    expect(whenDefinedSpy).toHaveBeenCalledTimes(1);
    expect(getSharedWaitEntries()?.has(tag)).toBe(true);

    controller.abort();
    await expect(cancelled).resolves.toBeNull();

    class SharedModuleElement extends HTMLElement {}
    customElements.define(tag, SharedModuleElement);
    await expect(active).resolves.toBe(SharedModuleElement.prototype);
    expect(getSharedWaitEntries()?.has(tag)).toBe(false);
    await expect(secondModule.PolymerHelper.retrieveCE(tag)).resolves.toBe(SharedModuleElement.prototype);
    expect(whenDefinedSpy).toHaveBeenCalledTimes(1);
  });

  it("releases the shared wait after late definition when every module subscriber cancelled", async () => {
    const tag = createTestTag("shared-all-cancelled");
    const whenDefinedSpy = vi.spyOn(customElements, "whenDefined");
    const firstController = new AbortController();
    const secondController = new AbortController();

    vi.resetModules();
    const firstModule = await import("../polymer-helper");
    const first = firstModule.PolymerHelper.retrieveCE(tag, firstController.signal);

    vi.resetModules();
    const secondModule = await import("../polymer-helper");
    const second = secondModule.PolymerHelper.retrieveCE(tag, secondController.signal);

    expect(whenDefinedSpy).toHaveBeenCalledTimes(1);
    firstController.abort();
    secondController.abort();
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toBeNull();
    expect(getSharedWaitEntries()?.has(tag)).toBe(true);

    class AllCancelledElement extends HTMLElement {}
    customElements.define(tag, AllCancelledElement);
    await Promise.resolve();

    expect(getSharedWaitEntries()?.has(tag)).toBe(false);
    await expect(secondModule.PolymerHelper.retrieveCE(tag)).resolves.toBe(AllCancelledElement.prototype);
    expect(whenDefinedSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves null when the custom elements registry is unavailable", async () => {
    const original = (globalThis as { customElements?: CustomElementRegistry }).customElements;
    Object.defineProperty(globalThis, "customElements", {
      configurable: true,
      value: undefined
    });
    try {
      const proto = await PolymerHelper.retrieveCE(createTestTag("no-registry"));
      expect(proto).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "customElements", {
        configurable: true,
        value: original
      });
    }
  });
});

describe("PolymerHelper.getDefinedPrototype", () => {
  it("returns null for an undefined tag without waiting", () => {
    expect(PolymerHelper.getDefinedPrototype(createTestTag("sync-missing"))).toBeNull();
  });

  it("returns the prototype synchronously for a defined tag", () => {
    const tag = createTestTag("sync-defined");
    class SyncElement extends HTMLElement {}
    customElements.define(tag, SyncElement);
    expect(PolymerHelper.getDefinedPrototype(tag)).toBe(SyncElement.prototype);
  });
});
