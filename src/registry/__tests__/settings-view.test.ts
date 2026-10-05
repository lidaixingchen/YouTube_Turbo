import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsModalView } from "../settings-view";
import { FeatureRegistry } from "../feature-registry";
import type { FeatureDescriptor } from "../../types";
import type { FeatureStateListener, FeatureStateSnapshot } from "../types";

interface MockFeatureRegistry {
  hasInitialized: boolean;
  initAll: ReturnType<typeof vi.fn>;
  getAllDescriptors: ReturnType<typeof vi.fn>;
  getAllStates: ReturnType<typeof vi.fn>;
  isEnabled: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  setEnabled: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

const DEFAULT_STEPPER_VALUE: number = 0;
const SAVED_STEPPER_VALUE: number = 600;
const EDITED_STEPPER_VALUE: number = 400;
const STEPPER_MIN_VALUE: number = -1000;
const STEPPER_MAX_VALUE: number = 1000;
const STEPPER_STEP: number = 100;

describe("SettingsModalView Component & Interactions", () => {
  let mockRegistry: MockFeatureRegistry;
  let subscribedListener: FeatureStateListener | null = null;
  let unsubscribeSpy: () => void;
  let reloadSpy: ReturnType<typeof vi.fn>;

  const sampleDescriptor: FeatureDescriptor = {
    id: "testFeature",
    order: 1,
    i18nKey: "feature_test",
    titleI18nKey: "feature_test_title",
    descI18nKey: "feature_test_desc",
    defaultValue: false,
    setup: vi.fn(),
    teardown: vi.fn()
  };

  const sampleSnapshot: FeatureStateSnapshot = {
    id: "testFeature",
    enabled: false,
    applied: false,
    runtime: "disabled",
    error: null,
    persistence: "persistent"
  };

  const createStepperDescriptor = (
    getValue: () => number,
    setValue: (value: number) => void
  ): FeatureDescriptor => ({
    ...sampleDescriptor,
    extraFields: [
      {
        key: "testStep",
        type: "stepper",
        titleI18nKey: "step_title",
        defaultValue: DEFAULT_STEPPER_VALUE,
        min: STEPPER_MIN_VALUE,
        max: STEPPER_MAX_VALUE,
        step: STEPPER_STEP,
        getValue,
        setValue
      }
    ]
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    (SettingsModalView as unknown as { isOpen: boolean }).isOpen = false;

    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        host: "www.youtube.com",
        reload: reloadSpy
      }
    });

    subscribedListener = null;
    unsubscribeSpy = vi.fn();

    mockRegistry = {
      hasInitialized: true,
      initAll: vi.fn().mockResolvedValue(undefined),
      getAllDescriptors: vi.fn().mockReturnValue([sampleDescriptor]),
      getAllStates: vi.fn().mockReturnValue({ testFeature: false }),
      isEnabled: vi.fn().mockReturnValue(false),
      getState: vi.fn().mockReturnValue(sampleSnapshot),
      setEnabled: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockImplementation((listener: FeatureStateListener) => {
        subscribedListener = listener;
        listener(sampleSnapshot);
        return unsubscribeSpy;
      })
    };

    vi.spyOn(FeatureRegistry, "getInstance").mockReturnValue(mockRegistry as unknown as FeatureRegistry);
  });

  it("should render modal with feature switch and subscribe to snapshots", () => {
    SettingsModalView.show();

    expect(mockRegistry.subscribe).toHaveBeenCalledTimes(1);

    const input = document.querySelector("#yt_feat_testFeature") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.checked).toBe(false);

    const statusEl = document.querySelector(".setting-status");
    expect(statusEl).not.toBeNull();
  });

  it("should prevent duplicate modal instances when already open", () => {
    SettingsModalView.show();
    SettingsModalView.show();

    expect(mockRegistry.subscribe).toHaveBeenCalledTimes(1);
  });

  it("should display session mode notice when persistence is session", () => {
    mockRegistry.getState.mockReturnValue({
      ...sampleSnapshot,
      persistence: "session"
    });

    SettingsModalView.show();

    const notice = document.querySelector(".yt-settings-notice-session");
    expect(notice).not.toBeNull();
  });

  it("should update aria-busy and status text when snapshot indicates starting or stopping", () => {
    SettingsModalView.show();

    const input = document.querySelector("#yt_feat_testFeature") as HTMLInputElement;
    const statusEl = document.querySelector(".setting-status") as HTMLElement;

    // 状态变迁为 starting
    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      runtime: "starting"
    });

    expect(input.getAttribute("aria-busy")).toBe("true");
    expect(input.disabled).toBe(false);
    expect(statusEl.classList.contains("setting-status-starting")).toBe(true);

    // 状态变迁为 stopping
    subscribedListener!({
      ...sampleSnapshot,
      enabled: false,
      runtime: "stopping"
    });

    expect(input.getAttribute("aria-busy")).toBe("true");
    expect(input.disabled).toBe(false);
    expect(statusEl.classList.contains("setting-status-stopping")).toBe(true);

    input.checked = true;
    input.dispatchEvent(new Event("change"));
    expect(mockRegistry.setEnabled).toHaveBeenCalledWith("testFeature", true);

    // 状态变迁为 enabled
    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      applied: true,
      runtime: "enabled"
    });

    expect(input.getAttribute("aria-busy")).toBeNull();
    expect(statusEl.classList.contains("setting-status-starting")).toBe(false);
  });

  it("should render retry button on retryable error and invoke setEnabled on click", async () => {
    SettingsModalView.show();

    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      runtime: "error",
      error: {
        stage: "setup",
        retryable: true
      }
    });

    const statusEl = document.querySelector(".setting-status") as HTMLElement;
    expect(statusEl.classList.contains("setting-status-error")).toBe(true);

    const retryBtn = statusEl.querySelector(".yt-settings-btn-action") as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();

    retryBtn.click();
    expect(mockRegistry.setEnabled).toHaveBeenCalledWith("testFeature", true);
  });

  it("shows a storage error while preserving the user's switch target", () => {
    SettingsModalView.show();

    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      applied: true,
      runtime: "enabled",
      error: { stage: "storage", retryable: true }
    });

    const statusEl = document.querySelector(".setting-status") as HTMLElement;
    expect(statusEl.classList.contains("setting-status-error")).toBe(true);
    expect(statusEl.querySelector(".yt-settings-btn-action")).toBeNull();

    const input = document.querySelector("#yt_feat_testFeature") as HTMLInputElement;
    input.checked = false;
    input.dispatchEvent(new Event("change"));
    expect(mockRegistry.setEnabled).toHaveBeenCalledWith("testFeature", false);
  });

  it("shows initialization failure and opens feature rows after retry", async () => {
    mockRegistry.hasInitialized = false;
    mockRegistry.initAll
      .mockRejectedValueOnce(new Error("Storage read error"))
      .mockImplementationOnce(async (): Promise<void> => {
        mockRegistry.hasInitialized = true;
      });

    SettingsModalView.show();
    expect(document.querySelector("#yt_feat_testFeature")).toBeNull();

    const retryButton: HTMLButtonElement = await vi.waitFor((): HTMLButtonElement => {
      const button = document.querySelector<HTMLButtonElement>(".yt-settings-btn-action");
      expect(button).not.toBeNull();
      expect(button?.disabled).toBe(false);
      return button!;
    });
    retryButton.click();

    await vi.waitFor((): void => {
      expect(document.querySelector("#yt_feat_testFeature")).not.toBeNull();
    });
    expect(mockRegistry.initAll).toHaveBeenCalledTimes(2);
  });

  it("keeps the modal closed when initialization finishes after dismissal", async () => {
    mockRegistry.hasInitialized = false;
    let finishInitialization!: () => void;
    mockRegistry.initAll.mockImplementation((): Promise<void> => new Promise<void>((resolve: () => void): void => {
      finishInitialization = (): void => {
        mockRegistry.hasInitialized = true;
        resolve();
      };
    }));

    SettingsModalView.show();
    const closeButton = document.querySelector(".yt-modal-close-btn") as HTMLButtonElement;
    closeButton.click();
    finishInitialization();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector(".yt-modal-backdrop")).toBeNull();
    expect(document.querySelector("#yt_feat_testFeature")).toBeNull();
  });

  it("should render reload button on non-retryable error and reload-required", () => {
    SettingsModalView.show();

    const statusEl = document.querySelector(".setting-status") as HTMLElement;

    // 非可重试错误
    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      runtime: "error",
      error: {
        stage: "cleanup",
        retryable: false
      }
    });

    const reloadBtn1 = statusEl.querySelector(".yt-settings-btn-action") as HTMLButtonElement;
    expect(reloadBtn1).not.toBeNull();
    reloadBtn1.click();
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // reload-required 状态
    subscribedListener!({
      ...sampleSnapshot,
      runtime: "reload-required"
    });

    expect(statusEl.classList.contains("setting-status-reload-required")).toBe(true);
    const reloadBtn2 = statusEl.querySelector(".yt-settings-btn-action") as HTMLButtonElement;
    expect(reloadBtn2).not.toBeNull();
    reloadBtn2.click();
    expect(reloadSpy).toHaveBeenCalledTimes(2);
  });

  it("should revert switch on setEnabled rejection", async () => {
    mockRegistry.setEnabled.mockRejectedValue(new Error("Storage error"));
    mockRegistry.getState.mockReturnValue({
      ...sampleSnapshot,
      enabled: false
    });

    SettingsModalView.show();

    const input = document.querySelector("#yt_feat_testFeature") as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      expect(input.checked).toBe(false);
    });
  });

  it("should toggle extra stepper fields availability based on enabled & runtime===enabled", () => {
    let stepperValue = 0;
    const descWithExtra: FeatureDescriptor = {
      ...sampleDescriptor,
      extraFields: [
        {
          key: "testStep",
          type: "stepper",
          titleI18nKey: "step_title",
          defaultValue: 0,
          min: -10,
          max: 10,
          step: 1,
          getValue: () => stepperValue,
          setValue: (v: number) => {
            stepperValue = v;
          }
        }
      ]
    };

    mockRegistry.getAllDescriptors.mockReturnValue([descWithExtra]);
    mockRegistry.getState.mockReturnValue({
      ...sampleSnapshot,
      enabled: false,
      runtime: "disabled"
    });

    SettingsModalView.show();

    const extraConfig = document.querySelector(".setting-extra-config") as HTMLElement;
    expect(extraConfig).not.toBeNull();
    expect(extraConfig.classList.contains("is-disabled")).toBe(true);
    const input = extraConfig.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);

    // 开启且运行就绪
    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      applied: true,
      runtime: "enabled"
    });

    expect(extraConfig.classList.contains("is-disabled")).toBe(false);
    expect(input.disabled).toBe(false);
  });

  it("syncs the saved stepper value after the feature finishes enabling", () => {
    let offsetValue: number = DEFAULT_STEPPER_VALUE;
    mockRegistry.getAllDescriptors.mockReturnValue([
      createStepperDescriptor(
        (): number => offsetValue,
        (value: number): void => {
          offsetValue = value;
        }
      )
    ]);

    SettingsModalView.show();

    const input: HTMLInputElement = document.querySelector(".setting-extra-config input") as HTMLInputElement;
    expect(input.value).toBe(String(DEFAULT_STEPPER_VALUE));

    offsetValue = SAVED_STEPPER_VALUE;
    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      applied: false,
      runtime: "starting"
    });
    expect(input.value).toBe(String(DEFAULT_STEPPER_VALUE));

    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      applied: true,
      runtime: "enabled"
    });
    expect(input.value).toBe(String(SAVED_STEPPER_VALUE));
  });

  it("shows a storage failure and retries the pending stepper value", () => {
    let offsetValue: number = DEFAULT_STEPPER_VALUE;
    let storageFails: boolean = true;
    const setOffset = vi.fn((value: number): void => {
      if (storageFails) {
        throw new Error("Storage unavailable");
      }
      offsetValue = value;
    });
    mockRegistry.getAllDescriptors.mockReturnValue([
      createStepperDescriptor((): number => offsetValue, setOffset)
    ]);

    SettingsModalView.show();
    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      applied: true,
      runtime: "enabled"
    });

    const input: HTMLInputElement = document.querySelector(".setting-extra-config input") as HTMLInputElement;
    input.focus();
    input.value = String(SAVED_STEPPER_VALUE);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const statusEl: HTMLElement = document.querySelector(".setting-extra-config .setting-status-error") as HTMLElement;
    const retryButton: HTMLButtonElement = statusEl.querySelector(".yt-settings-btn-action") as HTMLButtonElement;
    expect(statusEl.getAttribute("role")).toBe("status");
    expect(retryButton).not.toBeNull();
    expect(offsetValue).toBe(DEFAULT_STEPPER_VALUE);

    storageFails = false;
    retryButton.click();

    expect(setOffset).toHaveBeenCalledTimes(2);
    expect(setOffset).toHaveBeenNthCalledWith(2, SAVED_STEPPER_VALUE);
    expect(offsetValue).toBe(SAVED_STEPPER_VALUE);
    expect(statusEl.isConnected).toBe(false);
    expect(input.value).toBe(String(SAVED_STEPPER_VALUE));
  });

  it("preserves the focused stepper value while a feature snapshot refreshes", () => {
    let offsetValue: number = DEFAULT_STEPPER_VALUE;
    mockRegistry.getAllDescriptors.mockReturnValue([
      createStepperDescriptor(
        (): number => offsetValue,
        (value: number): void => {
          offsetValue = value;
        }
      )
    ]);

    SettingsModalView.show();
    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      applied: true,
      runtime: "enabled"
    });

    const input: HTMLInputElement = document.querySelector(".setting-extra-config input") as HTMLInputElement;
    input.focus();
    input.value = String(EDITED_STEPPER_VALUE);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    offsetValue = SAVED_STEPPER_VALUE;
    subscribedListener!({
      ...sampleSnapshot,
      enabled: true,
      applied: true,
      runtime: "enabled"
    });
    expect(input.value).toBe(String(EDITED_STEPPER_VALUE));

    input.blur();
    expect(input.value).toBe(String(SAVED_STEPPER_VALUE));
  });

  it("should unsubscribe on modal close and trigger reload if requiresReload feature changed", () => {
    const reloadableDesc: FeatureDescriptor = {
      ...sampleDescriptor,
      requiresReload: true
    };
    mockRegistry.getAllDescriptors.mockReturnValue([reloadableDesc]);
    mockRegistry.getAllStates
      .mockReturnValueOnce({ testFeature: false }) // initialStates
      .mockReturnValueOnce({ testFeature: true }); // currentStates on close

    SettingsModalView.show();

    // 触发 Modal 关闭按钮点击
    const closeBtn = document.querySelector(".yt-modal-close-btn") as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
