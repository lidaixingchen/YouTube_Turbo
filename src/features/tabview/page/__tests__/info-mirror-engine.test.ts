import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeMutationObserver } from "../../../../test/fake-observers";
import { PAGE_CONSTANTS } from "../constants";
import { InfoMirrorEngine } from "../info-mirror-engine";
import type { PolymerElementInstance } from "../types";

interface DescriptionFixture {
  readonly engine: InfoMirrorEngine;
  readonly source: HTMLElement;
  readonly mirror: HTMLElement;
  readonly data: Record<string, unknown>;
  readonly dataSignal: NonNullable<
    NonNullable<NonNullable<PolymerElementInstance["signalProxy"]>["signalCache"]>["data"]
  >;
  readonly originalSetWithPath: (...args: unknown[]) => unknown;
  readonly mirrorController: PolymerElementInstance;
  readonly mirrorSet: ReturnType<typeof vi.fn<(path: string, value: unknown) => void>>;
}

const createdEngines: Set<InfoMirrorEngine> = new Set();

function createDescriptionFixture(): DescriptionFixture {
  const flexy: HTMLElement = document.createElement(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
  const templateSandbox: HTMLElement = document.createElement(PAGE_CONSTANTS.TAGS.NOSCRIPT);
  templateSandbox.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.NS_TEMPLATE, "");
  const metadata: HTMLElement = document.createElement(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
  const source: HTMLElement = document.createElement(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER);
  const mirror: HTMLElement = document.createElement(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER);
  const tabInfo: HTMLElement = document.createElement("div");
  const data: Record<string, unknown> = { title: "initial" };
  const dataSignal = {
    setWithPath: (...args: unknown[]): unknown => args[1]
  };
  const originalSetWithPath = dataSignal.setWithPath;
  const sourceController: PolymerElementInstance = {
    data,
    signalProxy: { signalCache: { data: dataSignal } }
  };
  const mirrorController: PolymerElementInstance = {};
  const mirrorSet = vi.fn((path: string, value: unknown): void => {
    if (path === "data" && typeof value === "object" && value !== null) {
      mirrorController.data = value as Record<string, unknown>;
    }
  });
  mirrorController.set = mirrorSet;
  mirrorController.notifyPath = vi.fn((_path: string): void => {});

  source.setAttribute("id", "native-description");
  Object.assign(source, { inst: sourceController });
  mirror.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_INFO_RENDERER, "");
  Object.assign(mirror, { inst: mirrorController });
  tabInfo.id = PAGE_CONSTANTS.IDS.TAB_INFO;
  templateSandbox.appendChild(mirror);
  metadata.appendChild(source);
  flexy.append(templateSandbox, metadata, tabInfo);
  document.body.appendChild(flexy);

  const engine: InfoMirrorEngine = new InfoMirrorEngine();
  createdEngines.add(engine);
  engine.ensureMainDescription();

  return {
    engine,
    source,
    mirror,
    data,
    dataSignal,
    originalSetWithPath,
    mirrorController,
    mirrorSet
  };
}

function findSourceObserver(source: HTMLElement): FakeMutationObserver {
  const observer = Array.from(FakeMutationObserver.activeInstances).find((candidate) =>
    candidate.observedTargets.some((record) => record.target === source)
  );
  if (!observer) {
    throw new Error("Expected an active data reflection observer for the source node");
  }
  return observer;
}

function triggerSourceChange(observer: FakeMutationObserver, source: HTMLElement): void {
  observer.trigger([
    {
      target: source,
      attributeName: PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER
    }
  ]);
}

afterEach((): void => {
  for (const engine of createdEngines) {
    engine.destroy();
  }
  createdEngines.clear();
});

describe("InfoMirrorEngine data reflection lifecycle", () => {
  it("reuses a description observer and disconnects the old source when the description is replaced", () => {
    const fixture: DescriptionFixture = createDescriptionFixture();
    fixture.engine.ensureMainDescription();
    fixture.engine.ensureMainDescription();

    const oldObserver = findSourceObserver(fixture.source);
    expect(
      Array.from(FakeMutationObserver.activeInstances).filter((observer) =>
        observer.observedTargets.some((record) => record.target === fixture.source)
      )
    ).toHaveLength(1);

    const replacement: HTMLElement = document.createElement(PAGE_CONSTANTS.TAGS.EXPANDABLE_DESC_BODY_RENDERER);
    const replacementController: PolymerElementInstance = { data: { title: "replacement" } };
    Object.assign(replacement, { inst: replacementController });
    fixture.source.replaceWith(replacement);
    fixture.engine.ensureMainDescription();

    expect(oldObserver.disconnectCount).toBeGreaterThan(0);
    expect(fixture.source.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_OBSERVED)).toBe(false);
    expect(findSourceObserver(replacement).observedTargets).toHaveLength(1);
  });

  it("copies an in-place source data mutation when the Polymer signal notifies", async () => {
    const fixture: DescriptionFixture = createDescriptionFixture();
    const observer: FakeMutationObserver = findSourceObserver(fixture.source);
    fixture.data.title = "updated";
    fixture.dataSignal.setWithPath?.("data.title", "updated");
    triggerSourceChange(observer, fixture.source);

    await Promise.resolve();

    expect(fixture.mirrorSet).toHaveBeenCalledTimes(2);
    expect(fixture.mirrorController.data?.title).toBe("updated");
  });

  it.each(["info-first", "sync-first"] as const)(
    "flushes topology and data work when scheduling order is %s",
    async (order: "info-first" | "sync-first"): Promise<void> => {
      const fixture: DescriptionFixture = createDescriptionFixture();
      const observer: FakeMutationObserver = findSourceObserver(fixture.source);
      const engineInternals = fixture.engine as unknown as { runInfoFixInternal: () => void };
      const runInfoFixInternal = vi.spyOn(engineInternals, "runInfoFixInternal");

      if (order === "info-first") {
        fixture.engine.scheduleInfoFix();
        triggerSourceChange(observer, fixture.source);
      } else {
        triggerSourceChange(observer, fixture.source);
        fixture.engine.scheduleInfoFix();
      }

      await Promise.resolve();

      expect(runInfoFixInternal).toHaveBeenCalledTimes(1);
      expect(fixture.mirrorSet).toHaveBeenCalledTimes(2);
      expect(fixture.mirrorController.data?.title).toBe("initial");
    }
  );

  it("disconnects observers and invalidates queued work across destroy and reinitialization", (): void => {
    const fixture: DescriptionFixture = createDescriptionFixture();
    const queuedTasks: VoidFunction[] = [];
    vi.stubGlobal("queueMicrotask", (callback: VoidFunction): void => {
      queuedTasks.push(callback);
    });
    const metadata: HTMLElement | null = fixture.source.closest(PAGE_CONSTANTS.SELECTORS.WATCH_METADATA);
    if (!metadata) {
      throw new Error("Expected the native description to remain inside watch metadata");
    }
    const extraContentContainer: HTMLElement = document.createElement("div");
    extraContentContainer.setAttribute("slot", "extra-content");
    metadata.appendChild(extraContentContainer);
    fixture.engine.observeExtraContent(metadata);
    const extraContentObserver = Array.from(FakeMutationObserver.activeInstances).find((observer) =>
      observer.observedTargets.some((record) => record.target === extraContentContainer)
    );
    if (!extraContentObserver) {
      throw new Error("Expected an active extra-content observer");
    }

    const oldObserver: FakeMutationObserver = findSourceObserver(fixture.source);
    fixture.data.title = "stale";
    triggerSourceChange(oldObserver, fixture.source);

    fixture.engine.destroy();
    expect(oldObserver.disconnectCount).toBeGreaterThan(0);
    expect(extraContentObserver.disconnectCount).toBeGreaterThan(0);
    expect(FakeMutationObserver.activeInstances.size).toBe(0);
    expect(fixture.source.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_OBSERVED)).toBe(false);
    expect(fixture.source.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_DATA_CHANGE_COUNTER)).toBeNull();
    expect(fixture.dataSignal.setWithPath).toBe(fixture.originalSetWithPath);

    triggerSourceChange(oldObserver, fixture.source);
    fixture.engine.ensureMainDescription();
    const currentObserver: FakeMutationObserver = findSourceObserver(fixture.source);
    fixture.data.title = "reinitialized";
    fixture.dataSignal.setWithPath?.("data.title", "reinitialized");
    triggerSourceChange(currentObserver, fixture.source);

    expect(queuedTasks).toHaveLength(2);
    queuedTasks[0]?.();
    expect(fixture.mirrorSet).toHaveBeenCalledTimes(2);
    queuedTasks[1]?.();

    expect(fixture.mirrorSet).toHaveBeenCalledTimes(3);
    expect(fixture.mirrorController.data?.title).toBe("reinitialized");
  });
});
