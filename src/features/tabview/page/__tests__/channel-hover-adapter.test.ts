import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ChannelHoverAdapter } from "../channel-hover-adapter";
import { PAGE_CONSTANTS } from "../constants";
import type { RouteGeneration } from "../types";
import {
  installFakeObservers,
  resetFakeObservers,
  assertNoActiveFakeObservers,
  FakeResizeObserver
} from "../../../../test/fake-observers";

describe("ChannelHoverAdapter", () => {
  let adapter: ChannelHoverAdapter;
  const gen1 = 1 as RouteGeneration;
  const gen2 = 2 as RouteGeneration;

  beforeEach(() => {
    installFakeObservers();
    resetFakeObservers();
    adapter = new ChannelHoverAdapter();
  });

  afterEach(() => {
    adapter.destroy();
    assertNoActiveFakeObservers();
    resetFakeObservers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("returns no-op disposer if upload-info is missing", () => {
    adapter.activateRoute(gen1);
    const metadata = document.createElement("div");
    metadata.className = PAGE_CONSTANTS.SELECTORS.WATCH_METADATA.slice(1);

    const disposer = adapter.attachMetadata(metadata, gen1);
    expect(typeof disposer).toBe("function");
    expect(FakeResizeObserver.allInstances.length).toBe(0);

    disposer();
    expect(FakeResizeObserver.allInstances.length).toBe(0);
  });

  it("attaches exact metadata, observes upload-info, and manages hover lifecycle", () => {
    adapter.activateRoute(gen1);
    const metadata = document.createElement("div");
    metadata.className = PAGE_CONSTANTS.SELECTORS.WATCH_METADATA.slice(1);
    const uploadInfo = document.createElement("div");
    uploadInfo.id = "upload-info";
    metadata.appendChild(uploadInfo);
    document.body.appendChild(metadata);

    const disposer = adapter.attachMetadata(metadata, gen1);
    expect(FakeResizeObserver.allInstances.length).toBe(1);
    const ro = FakeResizeObserver.allInstances[0];
    expect(ro.observedTargets).toContain(uploadInfo);

    // pointerenter sets hover class
    uploadInfo.dispatchEvent(new Event("pointerenter"));
    expect(metadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER)).toBe(true);

    // simulated overflow inside deadline
    Object.defineProperty(uploadInfo, "scrollWidth", { value: 200, configurable: true });
    Object.defineProperty(uploadInfo, "clientWidth", { value: 100, configurable: true });

    ro.trigger([
      {
        target: uploadInfo,
        contentRect: { width: 100, height: 20 } as DOMRectReadOnly
      }
    ]);
    expect(metadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED)).toBe(true);

    // pointerleave removes both hover and resized classes
    uploadInfo.dispatchEvent(new Event("pointerleave"));
    expect(metadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER)).toBe(false);
    expect(metadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED)).toBe(false);

    // disposer cleans up
    disposer();
    expect(ro.observedTargets).not.toContain(uploadInfo);
  });

  it("ignores resize outside the valid hover window", () => {
    adapter.activateRoute(gen1);
    const metadata = document.createElement("div");
    metadata.className = PAGE_CONSTANTS.SELECTORS.WATCH_METADATA.slice(1);
    const uploadInfo = document.createElement("div");
    uploadInfo.id = "upload-info";
    metadata.appendChild(uploadInfo);
    document.body.appendChild(metadata);

    adapter.attachMetadata(metadata, gen1);
    const ro = FakeResizeObserver.allInstances[0];

    // Trigger resize without pointerenter
    Object.defineProperty(uploadInfo, "scrollWidth", { value: 200, configurable: true });
    Object.defineProperty(uploadInfo, "clientWidth", { value: 100, configurable: true });

    ro.trigger([
      {
        target: uploadInfo,
        contentRect: { width: 100, height: 20 } as DOMRectReadOnly
      }
    ]);
    expect(metadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED)).toBe(false);
  });

  it("handles target replacement idempotently", () => {
    adapter.activateRoute(gen1);

    const meta1 = document.createElement("div");
    const info1 = document.createElement("div");
    info1.id = "upload-info";
    meta1.appendChild(info1);

    const meta2 = document.createElement("div");
    const info2 = document.createElement("div");
    info2.id = "upload-info";
    meta2.appendChild(info2);

    const disp1 = adapter.attachMetadata(meta1, gen1);
    const ro = FakeResizeObserver.allInstances[0];
    expect(ro.observedTargets).toContain(info1);

    // Attach new target: old one should be cleaned up
    const disp2 = adapter.attachMetadata(meta2, gen1);
    expect(ro.observedTargets).not.toContain(info1);
    expect(ro.observedTargets).toContain(info2);

    // Repeating disp1 is a safe no-op
    disp1();
    expect(ro.observedTargets).toContain(info2);

    disp2();
    expect(ro.observedTargets).not.toContain(info2);
  });

  it("rejects callbacks from stale generation", () => {
    adapter.activateRoute(gen1);
    const metadata = document.createElement("div");
    metadata.className = PAGE_CONSTANTS.SELECTORS.WATCH_METADATA.slice(1);
    const uploadInfo = document.createElement("div");
    uploadInfo.id = "upload-info";
    metadata.appendChild(uploadInfo);
    document.body.appendChild(metadata);

    adapter.attachMetadata(metadata, gen1);
    const ro = FakeResizeObserver.allInstances[0];

    uploadInfo.dispatchEvent(new Event("pointerenter"));
    expect(metadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER)).toBe(true);

    // Deactivate gen1 and switch to gen2
    adapter.deactivateRoute(gen1);
    adapter.activateRoute(gen2);

    Object.defineProperty(uploadInfo, "scrollWidth", { value: 200, configurable: true });
    Object.defineProperty(uploadInfo, "clientWidth", { value: 100, configurable: true });

    // Late trigger with gen1
    ro.trigger([
      {
        target: uploadInfo,
        contentRect: { width: 100, height: 20 } as DOMRectReadOnly
      }
    ]);
    expect(metadata.classList.contains(PAGE_CONSTANTS.CLASSES.METADATA_HOVER_RESIZED)).toBe(false);
  });
});
