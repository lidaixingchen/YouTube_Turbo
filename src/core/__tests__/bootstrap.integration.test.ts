import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { FeatureDescriptor } from "../../types";
import type { ActionConfig } from "../../ui/toolbar/types";
import type { FeatureStateSnapshot } from "../../registry/types";
import type { PlayerController } from "../../features/player/controller";

vi.mock("../config-hacks", () => ({
  setupConfigHacks: vi.fn()
}));

vi.mock("../trusted-types", () => ({}));

const SPEED_FEATURE_ID: string = "isOpenSpeedControl";
const DOWNLOAD_FEATURE_ID: string = "isOpenYoutubedownloading";
const LOOP_FEATURE_ID: string = "isOpenLoopPlayback";
const VIDEO_LOOP_STORAGE_KEY: string = "py/videoLoop";
const VIDEO_SPEED_STORAGE_KEY: string = "yt/videoPlaySpeed";

interface MenuCommand {
  readonly title: string;
  readonly callback: () => void;
}

interface StorageHarness {
  readonly values: Map<string, unknown>;
  readonly readKeys: string[];
  readonly writtenValues: Array<{ key: string; value: unknown }>;
  readonly menuCommands: MenuCommand[];
  failNextRead(key: string): void;
}

interface BootstrapModules {
  readonly bootstrapApplication: typeof import("../bootstrap").bootstrapApplication;
  readonly FeatureRegistry: typeof import("../../registry/feature-registry").FeatureRegistry;
  readonly defaultFeatureDescriptors: typeof import("../../registry/descriptors").defaultFeatureDescriptors;
  readonly StorageUtil: typeof import("../storage").StorageUtil;
  readonly Locale: typeof import("../../i18n").Locale;
  readonly Toolbar: typeof import("../../ui/toolbar").Toolbar;
  readonly PlayerController: typeof import("../../features/player/controller").PlayerController;
  readonly PlayerSpeedFeature: typeof import("../../features/player/speed-feature").PlayerSpeedFeature;
  readonly PlayerLoopFeature: typeof import("../../features/player/loop-feature").PlayerLoopFeature;
  readonly ThemeController: typeof import("../../features/theme/theme-controller").ThemeController;
}

type FeatureRegistryInstance = InstanceType<BootstrapModules["FeatureRegistry"]>;

let modules: BootstrapModules | null = null;

function preparePage(): void {
  Object.defineProperty(window, "location", {
    value: new URL("https://www.youtube.com/watch?v=startup-test"),
    writable: true,
    configurable: true
  });
  document.documentElement.lang = "zh-CN";
  document.body.replaceChildren();
}

function installStorageHarness(): StorageHarness {
  const values: Map<string, unknown> = new Map<string, unknown>();
  const failures: Map<string, number> = new Map<string, number>();
  const readKeys: string[] = [];
  const writtenValues: Array<{ key: string; value: unknown }> = [];
  const menuCommands: MenuCommand[] = [];

  const getValue: <T>(key: string, defaultValue: T) => T = <T>(key: string, defaultValue: T): T => {
    readKeys.push(key);
    const remainingFailures: number = failures.get(key) ?? 0;
    if (remainingFailures > 0) {
      failures.set(key, remainingFailures - 1);
      throw new Error("Storage read failed");
    }
    return values.has(key) ? values.get(key) as T : defaultValue;
  };

  const setValue: <T>(key: string, value: T) => void = <T>(key: string, value: T): void => {
    values.set(key, value);
    writtenValues.push({ key, value });
  };

  const registerMenuCommand: (title: string, callback: () => void) => number = (
    title: string,
    callback: () => void
  ): number => {
    menuCommands.push({ title, callback });
    return menuCommands.length;
  };

  vi.stubGlobal("GM_getValue", getValue);
  vi.stubGlobal("GM_setValue", setValue);
  vi.stubGlobal("GM_registerMenuCommand", registerMenuCommand);

  return {
    values,
    readKeys,
    writtenValues,
    menuCommands,
    failNextRead(key: string): void {
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }
  };
}

async function loadModules(): Promise<BootstrapModules> {
  vi.resetModules();
  const bootstrapModule: typeof import("../bootstrap") = await import("../bootstrap");
  const registryModule: typeof import("../../registry/feature-registry") = await import("../../registry/feature-registry");
  const descriptorsModule: typeof import("../../registry/descriptors") = await import("../../registry/descriptors");
  const storageModule: typeof import("../storage") = await import("../storage");
  const localeModule: typeof import("../../i18n") = await import("../../i18n");
  const toolbarModule: typeof import("../../ui/toolbar") = await import("../../ui/toolbar");
  const controllerModule: typeof import("../../features/player/controller") = await import("../../features/player/controller");
  const speedFeatureModule: typeof import("../../features/player/speed-feature") = await import("../../features/player/speed-feature");
  const loopFeatureModule: typeof import("../../features/player/loop-feature") = await import("../../features/player/loop-feature");
  const themeModule: typeof import("../../features/theme/theme-controller") = await import("../../features/theme/theme-controller");

  return {
    bootstrapApplication: bootstrapModule.bootstrapApplication,
    FeatureRegistry: registryModule.FeatureRegistry,
    defaultFeatureDescriptors: descriptorsModule.defaultFeatureDescriptors,
    StorageUtil: storageModule.StorageUtil,
    Locale: localeModule.Locale,
    Toolbar: toolbarModule.Toolbar,
    PlayerController: controllerModule.PlayerController,
    PlayerSpeedFeature: speedFeatureModule.PlayerSpeedFeature,
    PlayerLoopFeature: loopFeatureModule.PlayerLoopFeature,
    ThemeController: themeModule.ThemeController
  };
}

function configureFeatureStates(
  loadedModules: BootstrapModules,
  storage: StorageHarness,
  enabledFeatureIds: readonly string[],
  legacyStates: Record<string, boolean> = {}
): void {
  const enabledIds: Set<string> = new Set<string>(enabledFeatureIds);
  storage.values.set(loadedModules.StorageUtil.keys.youtube.functionState, legacyStates);
  const descriptors: readonly FeatureDescriptor[] = loadedModules.defaultFeatureDescriptors;
  for (const descriptor of descriptors) {
    storage.values.set(
      loadedModules.StorageUtil.keys.youtube.functionStateForFeature(descriptor.id),
      enabledIds.has(descriptor.id)
    );
  }
}

function createWatchVideo(): HTMLVideoElement {
  const watchPage: HTMLElement = document.createElement("ytd-watch-flexy");
  const player: HTMLDivElement = document.createElement("div");
  player.id = "movie_player";
  const video: HTMLVideoElement = document.createElement("video");
  video.className = "html5-main-video video-stream";
  player.appendChild(video);
  watchPage.appendChild(player);
  document.body.appendChild(watchPage);
  return video;
}

async function cleanupModules(loadedModules: BootstrapModules): Promise<void> {
  const registry: FeatureRegistryInstance = loadedModules.FeatureRegistry.getInstance();
  if (registry.hasInitialized) {
    const descriptors: readonly FeatureDescriptor[] = loadedModules.defaultFeatureDescriptors;
    for (const descriptor of descriptors) {
      if (registry.getState(descriptor.id).applied === true) {
        await registry.setEnabled(descriptor.id, false);
      }
    }
  }
  loadedModules.PlayerSpeedFeature.disable();
  loadedModules.PlayerLoopFeature.disable();
  loadedModules.ThemeController.getInstance().destroy();
  loadedModules.Toolbar.destroy();
  loadedModules.PlayerController.getInstance().destroy();
}

beforeEach((): void => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  preparePage();
  modules = null;
});

afterEach(async (): Promise<void> => {
  if (modules) {
    await cleanupModules(modules);
    modules = null;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("application bootstrap and real feature descriptors", () => {
  it("keeps disabled loop and download features inactive while localizing the settings menu", async (): Promise<void> => {
    const storage: StorageHarness = installStorageHarness();
    modules = await loadModules();
    vi.spyOn(modules.StorageUtil, "isPersistenceAvailable").mockReturnValue(false);
    const video: HTMLVideoElement = createWatchVideo();
    configureFeatureStates(modules, storage, [SPEED_FEATURE_ID], {});
    storage.values.set(VIDEO_LOOP_STORAGE_KEY, true);
    const registerActionsSpy: MockInstance<BootstrapModules["Toolbar"]["registerActions"]> = vi.spyOn(
      modules.Toolbar,
      "registerActions"
    );

    await modules.bootstrapApplication();

    const registry: FeatureRegistryInstance = modules.FeatureRegistry.getInstance();
    const registeredActionIds: string[] = registerActionsSpy.mock.calls.flatMap(
      ([actions]: [readonly ActionConfig[]]): string[] => actions.map((action: ActionConfig): string => action.id)
    );
    const settingsLabel: string = modules.Locale.t("action_setting");

    expect(registry.getState(LOOP_FEATURE_ID).enabled).toBe(false);
    expect(registry.getState(DOWNLOAD_FEATURE_ID).enabled).toBe(false);
    expect(modules.PlayerController.getInstance().isLoopEnabled()).toBe(false);
    expect(video.loop).toBe(false);
    expect(storage.values.get(VIDEO_LOOP_STORAGE_KEY)).toBe(true);
    expect(storage.writtenValues.some(({ key }: { key: string }): boolean => key === VIDEO_LOOP_STORAGE_KEY)).toBe(false);
    expect(registeredActionIds).not.toContain("download");
    expect(registeredActionIds).not.toContain("shorts_download");
    expect(registeredActionIds).not.toContain("watch_download");
    expect(storage.menuCommands).toHaveLength(1);
    expect(storage.menuCommands[0].title).toBe(settingsLabel);
    expect(settingsLabel).toBe("设置");
  });

  it("restores the saved loop state when the real loop descriptor is enabled", async (): Promise<void> => {
    const storage: StorageHarness = installStorageHarness();
    modules = await loadModules();
    vi.spyOn(modules.StorageUtil, "isPersistenceAvailable").mockReturnValue(false);
    const video: HTMLVideoElement = createWatchVideo();
    configureFeatureStates(modules, storage, [LOOP_FEATURE_ID], {});
    storage.values.set(VIDEO_LOOP_STORAGE_KEY, true);

    await modules.bootstrapApplication();

    const registry: FeatureRegistryInstance = modules.FeatureRegistry.getInstance();
    expect(registry.getState(LOOP_FEATURE_ID).runtime).toBe("enabled");
    expect(modules.PlayerController.getInstance().isLoopEnabled()).toBe(true);
    expect(video.loop).toBe(true);
  });

  it("retries a failed loop storage read through the registry setting action", async (): Promise<void> => {
    const storage: StorageHarness = installStorageHarness();
    modules = await loadModules();
    vi.spyOn(modules.StorageUtil, "isPersistenceAvailable").mockReturnValue(false);
    const video: HTMLVideoElement = createWatchVideo();
    configureFeatureStates(modules, storage, [LOOP_FEATURE_ID], {});
    storage.values.set(VIDEO_LOOP_STORAGE_KEY, true);
    storage.failNextRead(VIDEO_LOOP_STORAGE_KEY);
    const initSpy: MockInstance<PlayerController["init"]> = vi.spyOn(
      modules.PlayerController.getInstance(),
      "init"
    );

    await modules.bootstrapApplication();

    const registry: FeatureRegistryInstance = modules.FeatureRegistry.getInstance();
    expect(registry.getState(LOOP_FEATURE_ID).runtime).toBe("error");
    expect(initSpy).not.toHaveBeenCalled();
    expect(video.loop).toBe(false);
    expect(storage.writtenValues.some(({ key }: { key: string }): boolean => key === VIDEO_LOOP_STORAGE_KEY)).toBe(false);

    await registry.setEnabled(LOOP_FEATURE_ID, true);

    expect(registry.getState(LOOP_FEATURE_ID).runtime).toBe("enabled");
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(modules.PlayerController.getInstance().isLoopEnabled()).toBe(true);
    expect(video.loop).toBe(true);
  });

  it("retries a failed shared player initialization without retaining its failed state", async (): Promise<void> => {
    const storage: StorageHarness = installStorageHarness();
    modules = await loadModules();
    vi.spyOn(modules.StorageUtil, "isPersistenceAvailable").mockReturnValue(false);
    createWatchVideo();
    configureFeatureStates(modules, storage, [SPEED_FEATURE_ID]);
    storage.failNextRead(VIDEO_SPEED_STORAGE_KEY);
    const controller = modules.PlayerController.getInstance();
    const initSpy: MockInstance<PlayerController["init"]> = vi.spyOn(controller, "init");
    const addEventListenerSpy: MockInstance<Window["addEventListener"]> = vi.spyOn(window, "addEventListener");
    const errorSpy: MockInstance<typeof console.error> = vi.spyOn(console, "error").mockImplementation((): void => {});

    await modules.bootstrapApplication();

    const registry: FeatureRegistryInstance = modules.FeatureRegistry.getInstance();
    const initialSnapshot: FeatureStateSnapshot = registry.getState(SPEED_FEATURE_ID);
    const initialNavigationListeners: number = addEventListenerSpy.mock.calls.filter(
      ([eventName]: [string | symbol, ...unknown[]]): boolean => eventName === "yt-navigate-finish"
    ).length;
    expect(initialSnapshot.runtime).toBe("error");
    expect(initialSnapshot.error?.retryable).toBe(true);
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initialNavigationListeners).toBe(0);

    await registry.setEnabled(SPEED_FEATURE_ID, true);

    const retriedSnapshot: FeatureStateSnapshot = registry.getState(SPEED_FEATURE_ID);
    const navigationListeners: number = addEventListenerSpy.mock.calls.filter(
      ([eventName]: [string | symbol, ...unknown[]]): boolean => eventName === "yt-navigate-finish"
    ).length;
    expect(retriedSnapshot.runtime).toBe("enabled");
    expect(initSpy).toHaveBeenCalledTimes(2);
    expect(navigationListeners).toBe(1);
    expect(modules.PlayerSpeedFeature.isActive()).toBe(true);
    expect(storage.readKeys.filter((key: string): boolean => key === VIDEO_SPEED_STORAGE_KEY)).toHaveLength(2);
    expect(errorSpy).toHaveBeenCalled();
  });
});
