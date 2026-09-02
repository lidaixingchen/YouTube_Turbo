# YouTube Turbo – 字幕子系统深模块化重构方案

本方案基于 **Codebase Design** 哲学（深模块 Deep Modules、清晰 Seam、高杠杆 Leverage、局部性 Locality 与删除测试 Deletion Test），针对字幕子系统（`src/features/caption/`）制定严谨、完备且无隐患的深模块重构方案。

---

## 1. 架构目标与设计原则

- **收束深模块与封闭内部状态（Deep Module & Clean Boundary）**：将分散导出的 4 个单例（`CaptionController`、`CaptionOverlayRenderer`、`TimedTextInterceptor`、`SubtitleTimeline`）收拢为单一深度模块 `CaptionController`。渲染器、时间轴与网络拦截器降级为控制器持有的私有适配器，对外仅暴露极简的领域方法。
- **媒体生命周期自治闭环（Autonomous Media Lifecycle）**：`CaptionOverlayRenderer` 作为内部私有渲染组件，直接对目标 `<video>` 绑定精准且被动（`passive: true`）的媒体原生事件（`play`、`pause`、`ended`、`seeked`），独立维护播放态闭环，杜绝因外部状态流缺陷导致渲染状态失控。
- **彻底对齐项目性能与突变红线（Eliminate Bare Listeners & Subtree Mutation）**：
  - 彻底清除 `window` 上裸绑定的 `keydown`（监听 `c` / `C` 键与 `setTimeout` 探测）；
  - 彻底消除对播放器容器挂载的深层突变监听（`{ subtree: true }` MutationObserver），改为对字幕按钮单节点的目标观察，以及结合播放器原型 API 惰性断言；
  - 闲置期主线程与渲染开销严格收敛为零。
- **精准践行双层防御与按需渲染闸门（Two-Tier Calibration & ADR-0001 Alignment）**：严格落实 [ADR 0001](adr/0001-caption-rendering-reactive-gate.md) 确立的 `ReactiveRenderGate`：
  - **第一层（网络静态基准）**：`/api/timedtext` 请求时直接改写基准偏移（`globalDefaultOffsetMs`），由 YouTube 官方播放器承载原生高质量渲染，覆盖层保持停机；
  - **第二层（覆盖层动态补偿）**：当且仅当发生会话级临时偏移（`sessionOffsetMs !== 0`）时，激活三元闸门（`isPlaying && isSubtitlesOn && sessionOffsetMs !== 0`）启动硬件级 `requestAnimationFrame` 驱动覆盖层接管渲染，任一条件不满足立即 `cancelAnimationFrame`。
- **视图解耦与契约零破坏（View Separation & Contract Compatibility）**：抽离独立的 UI 渲染视图 `CaptionSettingsView`，领域控制器专注状态流调度，同时向注册表保持一致的挂载契约。

---

## 2. 领域模型与术语对齐

- **`CaptionController`**：字幕子系统唯一的深度入口单例。负责统管持久化基准偏移与会话增量、调度网络拦截器、时间轴与覆盖层渲染器的生命周期，协调外部快捷键与设置面板。
- **`SubtitleTimeline`**：字幕时间轴索引与解析私有组件。纯内存数据结构，负责 JSON3 与 XML (srv1/srv3) 格式解析、时间戳排序以及 $O(\log N)$ 二分查找与连续快照滑动窗口匹配。
- **`TimedTextInterceptor`**：网络拦截私有适配器。挂载于 `fetch` 与 `XMLHttpRequest` 原型链，拦截 `/api/timedtext` 流量，在内存中完成静态基准偏移改写并将原始 Cue 交付给时间轴。
- **`CaptionOverlayRenderer`**：动态覆盖层渲染私有组件。内置 `ReactiveRenderGate`，直接持有媒体播放态，在会话增量非零且字幕开启时驱动自定义字幕高保真绘制。
- **`CaptionSettingsView`**：独立的设置面板视图组件。纯 DOM 构造器，承接设置面板内的输入框、步进按钮及文案渲染，与控制器解耦。
- **`SubtitleOffset`**：双层时间轴偏移模型（单位毫秒）：
  - `globalDefaultOffsetMs`：持久化基准偏移，由网络拦截层静态注入；
  - `sessionOffsetMs`：随视频会话变动重置的临时增量，由覆盖层动态补偿；
  - `effectiveOffsetMs`：总有效偏移量（`globalDefaultOffsetMs + sessionOffsetMs`）。

---

## 3. 现状分析与架构摩擦点 (Friction)

### 3.1 四单例割裂与跨模块穿透

当前 `src/features/caption/` 包含 4 个相互引用的有状态单例，并在 `index.ts` 中全量对外导出：

```
【当前架构：散落的 4 个导出单例与泄漏 Seam】
                      ┌────────────────────────────────────────┐
                      │ src/features/caption/index.ts          │
                      │ (全量 export * 泄漏内部细节)             │
                      └──────────────────┬─────────────────────┘
                                         │
       ┌───────────────────┬─────────────┴───────┬──────────────────┐
       ▼                   ▼                     ▼                  ▼
CaptionController  CaptionOverlayRenderer  TimedTextInterceptor  SubtitleTimeline
 (快捷键/配置调度)     (rAF 渲染循环/DOM)       (网络拦截/改包)     (Cue 缓存与二分查找)
       │                   │                     │                  │
       ├── manual sync ───►│                     │                  │
       ├── raw keydown ───►│                     │                  │
       │                   ├── query cues ───────┼─────────────────►│
       │                   │                     ├── ingest cues ──►│
       ├── install ────────┼────────────────────►│                  │
       └── clearCurrent ───┴─────────────────────┴─────────────────►│
```

1. **生命周期高频交叉渗透**：
   - `CaptionController` 必须在状态变动时手动调用 `CaptionOverlayRenderer.getInstance().attachVideo(...)`、`syncCCState()`、`updateGateState()`、`renderCurrentFrame(true)`；
   - `CaptionOverlayRenderer` 直接调用 `SubtitleTimeline.getInstance().getActiveCueText(...)` 与 `resetPointer()`；
   - `TimedTextInterceptor` 静态方法直接调用 `SubtitleTimeline.getInstance().ingest(...)`。
2. **事件监听与突变观察红线违背**：
   - `CaptionController` 为侦测字幕开启状态，裸绑了 `window.addEventListener("keydown")` 监听字符 `c` / `C`，配合 `setTimeout(50ms)` 延迟探测，违背项目快捷键调度红线；
   - `CaptionOverlayRenderer` 在未找到字幕按钮时，对播放器容器挂载了 `{ childList: true, subtree: true }` 深度 MutationObserver。播放器高频更新（时间戳、进度条、缓冲）会引发大量无效回调，违反局部性与零开销原则。
3. **领域控制器混杂 98 行 UI 构造逻辑**：
   - `CaptionController.renderSettingsConfig` 内嵌了大量命令式 DOM 拼接逻辑，使核心控制器承担了视图渲染责任。
4. **遗留别名与浅模块暴露**：
   - `src/features/caption/renderer.ts` 底部保留了遗留别名 `export const CaptionRenderer = CaptionOverlayRenderer;`，造成外部认知负担。

---

## 4. 重构方案与演进架构

### 4.1 深度模块拓扑演化

通过将 `TimedTextInterceptor`、`SubtitleTimeline` 与 `CaptionOverlayRenderer` 收拢为 `CaptionController` 内部的私有组件，并将设置界面抽离至 `CaptionSettingsView`，外部 Seam 仅保留干净的领域接口：

```
【重构后架构：深模块与高内聚私有适配器】

                 src/registry/descriptors.ts
                   │                     │
          (setup / teardown)     (renderExtraConfig)
                   │                     │
                   ▼                     ▼
         ┌──────────────────┐   ┌──────────────────────────┐
         │CaptionController │   │ CaptionSettingsView      │
         │ (唯一领域深模块)   │◄──┤ (独立设置视图，纯 UI 渲染) │
         └─────────┬────────┘   └──────────────────────────┘
                   │ (管理私有组件生命周期与内部事件协调)
   ┌───────────────┼───────────────────────────┐
   ▼               ▼                           ▼
┌──────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│Subtitle      │ │TimedTextInterceptor  │ │CaptionOverlayRenderer│
│Timeline      │ │(网络改包 / 私有适配器) │ │(动态渲染 / 媒体事件自治)│
│(纯内存结构)   │ │- 静态注入基准偏移     │ │- 精准闭环 play/pause │
│- 二分查找 Cue │ │- 回调直通内部时间轴  │ │- 仅 session!=0 激活  │
└──────────────┘ └──────────────────────┘ └──────────────────────┘
```

### 4.2 具体改动明细

#### 1. 抹除外部多单例导出与清理遗留别名
- 修改 `src/features/caption/index.ts`：
  - 仅导出 `CaptionController`、`SUBTITLE_CONSTANTS`、`CaptionSettingsView` 以及状态类型 `CaptionOffsetState`、`SubtitleCue`；
  - 彻底移除对 `CaptionOverlayRenderer`、`CaptionRenderer`、`TimedTextInterceptor`、`SubtitleTimeline` 的顶层 re-export。

#### 2. 收纳并纯化 `SubtitleTimeline`
- 将 `SubtitleTimeline` 转为纯内存数据结构管理类，移除其单例模式（取消 `getInstance`）；
- 作为 `CaptionController` 构造时持有的内部私有成员；
- 暴露标准的纯函数/方法接口：
  - `ingest(key: string, rawText: string): SubtitleCue[]`
  - `getActiveCueText(effectiveMs: number): string`
  - `resetPointer(): void`
  - `clearCurrent(): void`
  - `clear(): void`

#### 3. 规范 `TimedTextInterceptor` 的生命周期与注入解耦
- 取消对全局 `SubtitleTimeline` 单例的直接访问，改为构造时注入回调：
  - `offsetProvider`: 获取当前基准偏移量；
  - `onTrackIngested`: 上报新解析的字幕内容并直接存入 `CaptionController` 的私有时间轴；
- 统一在 `CaptionController.init()` 时执行原型链安装（`install()`），在 `CaptionController.destroy()` 时安全还原原型链（`destroy()`）。

#### 4. 优化 `CaptionOverlayRenderer` 的事件与突变闭环
- **媒体事件自治闭环**：
  - `CaptionOverlayRenderer` 内部精准监听目标 `<video>` 的 `play`、`pause`、`ended`、`seeked` 事件，严密维护 `isPlaying` 播放状态，确保视频暂停时 rAF 循环立即停机；
  - 切换视频或销毁时原子性移除视频监听。
- **清除 `subtree: true` 突变隐患**：
  - 废弃针对播放器容器的深层子树观察器；
  - 采用靶向绑定：定位字幕控制按钮 `.ytp-subtitles-button`，仅对该元素挂载单一节点属性观察器（`attributes: true, attributeFilter: ["aria-pressed"]`）；
  - 结合播放器原型 API `player.isSubtitlesOn()` 进行静默回退断言。
- **清除全局裸 keydown**：
  - 彻底移除 `window.addEventListener("keydown")` 对 `c` / `C` 键的监听与 50ms 延迟探测，按键触发的字幕开关由按钮属性观察器与播放器原生事件自动响应。

#### 5. 抽离独立的 UI 视图组件 `CaptionSettingsView`
- 新建 `src/features/caption/settings-view.ts`，承接原 `renderSettingsConfig` 中的全部 DOM 创建与双向数值同步逻辑；
- `CaptionController` 提供纯粹的领域数值操作：`getGlobalDefaultOffsetMs()` 与 `setGlobalDefaultOffset(offsetMs: number)`；
- 在 `CaptionController` 保留轻量委托方法或直接在 `descriptors.ts` 接入 `CaptionSettingsView.render(container, language, controller)`，确保外部调用契约零破坏。

---

## 5. 详细代码结构设计

### 5.1 领域控制器 (`src/features/caption/controller.ts`)

```typescript
import { SUBTITLE_CONSTANTS } from "./constants";
import { TimedTextInterceptor } from "./interceptor";
import { SubtitleTimeline } from "./timeline";
import { CaptionOverlayRenderer } from "./renderer";
import { CaptionSettingsView } from "./settings-view";
import { ShortcutDispatcher } from "../../core/shortcuts";
import { PlaybackHUD } from "../../core/hud";
import { StorageUtil } from "../../core/storage";
import { Locale } from "../../i18n";
import { PlayerController, type PlayerState } from "../player";
import type { CaptionOffsetState } from "./types";
import type { LanguageDefinition } from "../../types";

export class CaptionController {
  private static instance: CaptionController | null = null;

  // 私有核心组件
  private readonly timeline: SubtitleTimeline;
  private readonly renderer: CaptionOverlayRenderer;
  private readonly interceptor: TimedTextInterceptor;

  // 领域状态
  private globalDefaultOffsetMs: number = SUBTITLE_CONSTANTS.DEFAULT_OFFSET_MS;
  private sessionOffsetMs: number = 0;
  private shortcutCleanups: Array<() => void> = [];
  private playerReadyCleanup: (() => void) | null = null;
  private navigateHandler: (() => void) | null = null;
  private isInitialized: boolean = false;

  private constructor() {
    this.timeline = new SubtitleTimeline();

    this.renderer = new CaptionOverlayRenderer(
      () => ({
        sessionOffsetMs: this.sessionOffsetMs,
        effectiveOffsetMs: this.getEffectiveOffsetMs()
      }),
      this.timeline
    );

    this.interceptor = new TimedTextInterceptor(
      () => this.globalDefaultOffsetMs,
      (key: string, rawText: string) => {
        this.timeline.ingest(key, rawText);
        if (this.sessionOffsetMs !== 0) {
          this.renderer.renderCurrentFrame(true);
        }
      }
    );
  }

  public static getInstance(): CaptionController {
    if (!CaptionController.instance) {
      CaptionController.instance = new CaptionController();
    }
    return CaptionController.instance;
  }

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.globalDefaultOffsetMs = StorageUtil.getValue<number>(
      SUBTITLE_CONSTANTS.STORAGE_KEY_OFFSET,
      SUBTITLE_CONSTANTS.DEFAULT_OFFSET_MS
    );
    this.sessionOffsetMs = 0;

    this.interceptor.install();
    this.renderer.init();

    this.bindPlayerEvents();
    this.bindShortcuts();
    this.bindNavigation();
  }

  private bindPlayerEvents(): void {
    this.playerReadyCleanup = PlayerController.getInstance().onReady((state: PlayerState) => {
      this.renderer.attachVideo(state.videoElement);
    });
  }

  public advance(stepMs: number = SUBTITLE_CONSTANTS.STEP_OFFSET_MS): void {
    const current = this.getEffectiveOffsetMs();
    const next = Math.max(SUBTITLE_CONSTANTS.MIN_OFFSET_MS, current - stepMs);
    this.sessionOffsetMs = next - this.globalDefaultOffsetMs;
    this.applyOffsetChange();
  }

  public delay(stepMs: number = SUBTITLE_CONSTANTS.STEP_OFFSET_MS): void {
    const current = this.getEffectiveOffsetMs();
    const next = Math.min(SUBTITLE_CONSTANTS.MAX_OFFSET_MS, current + stepMs);
    this.sessionOffsetMs = next - this.globalDefaultOffsetMs;
    this.applyOffsetChange();
  }

  public reset(): void {
    this.sessionOffsetMs = 0;
    this.applyOffsetChange(true);
  }

  public getGlobalDefaultOffsetMs(): number {
    return this.globalDefaultOffsetMs;
  }

  public setGlobalDefaultOffset(offsetMs: number): void {
    const clamped = Math.max(
      SUBTITLE_CONSTANTS.MIN_OFFSET_MS,
      Math.min(SUBTITLE_CONSTANTS.MAX_OFFSET_MS, offsetMs)
    );
    this.globalDefaultOffsetMs = clamped;
    StorageUtil.setValue(SUBTITLE_CONSTANTS.STORAGE_KEY_OFFSET, clamped);
    this.applyOffsetChange();
  }

  public getEffectiveOffsetMs(): number {
    return this.globalDefaultOffsetMs + this.sessionOffsetMs;
  }

  public getState(): CaptionOffsetState {
    return {
      globalDefaultOffsetMs: this.globalDefaultOffsetMs,
      sessionOffsetMs: this.sessionOffsetMs,
      effectiveOffsetMs: this.getEffectiveOffsetMs()
    };
  }

  public renderSettingsConfig(container: HTMLElement, language: LanguageDefinition): void {
    CaptionSettingsView.render(container, language, this);
  }

  private applyOffsetChange(isReset: boolean = false): void {
    if (this.sessionOffsetMs === 0) {
      this.renderer.deactivate();
    } else {
      this.renderer.activate(true);
    }
    this.showHUD(isReset);
  }

  private showHUD(isReset: boolean): void {
    const effective = this.getEffectiveOffsetMs();
    const sec = (effective / 1000).toFixed(2);
    const sign = effective > 0 ? "+" : "";
    const label = Locale.t("subtitle_offset_label") || "字幕时间轴";
    let message = `${label}: ${sign}${sec}s`;
    if (isReset && effective === 0) {
      const suffix = Locale.t("subtitle_offset_reset_suffix") || "(已重置)";
      message = `${label}: ${sign}${sec}s ${suffix}`;
    }
    PlaybackHUD.show(message);
  }

  private bindShortcuts(): void {
    this.clearShortcuts();
    const unbindAdvance = ShortcutDispatcher.register({
      key: SUBTITLE_CONSTANTS.SHORTCUT_ADVANCE_KEY,
      altKey: true,
      description: "Advance subtitles timing (-0.25s)",
      handler: () => this.advance()
    });

    const unbindDelay = ShortcutDispatcher.register({
      key: SUBTITLE_CONSTANTS.SHORTCUT_DELAY_KEY,
      altKey: true,
      description: "Delay subtitles timing (+0.25s)",
      handler: () => this.delay()
    });

    const unbindReset = ShortcutDispatcher.register({
      key: SUBTITLE_CONSTANTS.SHORTCUT_RESET_KEY,
      altKey: true,
      description: "Reset subtitles timing to default",
      handler: () => this.reset()
    });

    this.shortcutCleanups.push(unbindAdvance, unbindDelay, unbindReset);
  }

  private clearShortcuts(): void {
    this.shortcutCleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (err) {
        console.error("[CaptionController] Shortcut cleanup error:", err);
      }
    });
    this.shortcutCleanups = [];
  }

  private bindNavigation(): void {
    if (!this.navigateHandler) {
      this.navigateHandler = () => {
        this.sessionOffsetMs = 0;
        this.timeline.clearCurrent();
        this.renderer.deactivate();
      };
      window.addEventListener("yt-navigate-finish", this.navigateHandler, { passive: true });
    }
  }

  private unbindNavigation(): void {
    if (this.navigateHandler) {
      window.removeEventListener("yt-navigate-finish", this.navigateHandler);
      this.navigateHandler = null;
    }
  }

  public destroy(): void {
    this.clearShortcuts();
    this.unbindNavigation();
    if (this.playerReadyCleanup) {
      this.playerReadyCleanup();
      this.playerReadyCleanup = null;
    }
    this.renderer.destroy();
    this.interceptor.destroy();
    this.timeline.clear();
    this.isInitialized = false;
  }
}
```

### 5.2 独立设置视图 (`src/features/caption/settings-view.ts`)

```typescript
import { SUBTITLE_CONSTANTS } from "./constants";
import type { CaptionController } from "./controller";
import type { LanguageDefinition } from "../../types";

export class CaptionSettingsView {
  public static render(
    container: HTMLElement,
    language: LanguageDefinition,
    controller: CaptionController
  ): void {
    const configWrapper = document.createElement("div");
    configWrapper.className = "yt-subtitle-offset-config";

    const titleRow = document.createElement("div");
    titleRow.className = "yt-subtitle-offset-header";

    const titleEl = document.createElement("span");
    titleEl.className = "yt-subtitle-offset-title";
    titleEl.textContent = language.content.subtitle_global_offset_title || "全局默认基准偏移";

    const badgeEl = document.createElement("kbd");
    badgeEl.className = "yt-turbo-kbd";
    badgeEl.textContent = "Alt+[ / ] / \\";

    titleRow.appendChild(titleEl);
    titleRow.appendChild(badgeEl);
    configWrapper.appendChild(titleRow);

    const controlsRow = document.createElement("div");
    controlsRow.className = "yt-subtitle-offset-controls";

    const btnAdvance = document.createElement("button");
    btnAdvance.type = "button";
    btnAdvance.className = "yt-offset-btn yt-offset-btn-advance";
    btnAdvance.textContent = "-0.25s";

    const inputWrap = document.createElement("div");
    inputWrap.className = "yt-offset-input-wrap";

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.className = "yt-offset-input";
    numberInput.step = "0.05";
    numberInput.min = String(SUBTITLE_CONSTANTS.MIN_OFFSET_MS / 1000);
    numberInput.max = String(SUBTITLE_CONSTANTS.MAX_OFFSET_MS / 1000);
    numberInput.value = (controller.getGlobalDefaultOffsetMs() / 1000).toFixed(2);

    const unitEl = document.createElement("span");
    unitEl.className = "yt-offset-unit";
    unitEl.textContent = language.content.subtitle_offset_unit || "秒";

    inputWrap.appendChild(numberInput);
    inputWrap.appendChild(unitEl);

    const btnDelay = document.createElement("button");
    btnDelay.type = "button";
    btnDelay.className = "yt-offset-btn yt-offset-btn-delay";
    btnDelay.textContent = "+0.25s";

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "yt-offset-btn yt-offset-btn-reset";
    btnReset.textContent = language.content.subtitle_offset_reset_btn || "重置为 0s";

    const updateInputValue = (offsetMs: number) => {
      numberInput.value = (offsetMs / 1000).toFixed(2);
    };

    numberInput.addEventListener("input", () => {
      const valSec = parseFloat(numberInput.value);
      if (!isNaN(valSec)) {
        const offsetMs = Math.round(valSec * 1000);
        controller.setGlobalDefaultOffset(offsetMs);
      }
    });

    btnAdvance.addEventListener("click", () => {
      const current = controller.getGlobalDefaultOffsetMs();
      const next = Math.max(SUBTITLE_CONSTANTS.MIN_OFFSET_MS, current - SUBTITLE_CONSTANTS.STEP_OFFSET_MS);
      controller.setGlobalDefaultOffset(next);
      updateInputValue(next);
    });

    btnDelay.addEventListener("click", () => {
      const current = controller.getGlobalDefaultOffsetMs();
      const next = Math.min(SUBTITLE_CONSTANTS.MAX_OFFSET_MS, current + SUBTITLE_CONSTANTS.STEP_OFFSET_MS);
      controller.setGlobalDefaultOffset(next);
      updateInputValue(next);
    });

    btnReset.addEventListener("click", () => {
      controller.setGlobalDefaultOffset(0);
      updateInputValue(0);
    });

    controlsRow.appendChild(btnAdvance);
    controlsRow.appendChild(inputWrap);
    controlsRow.appendChild(btnDelay);
    controlsRow.appendChild(btnReset);
    configWrapper.appendChild(controlsRow);

    const descEl = document.createElement("div");
    descEl.className = "yt-subtitle-offset-desc";
    descEl.textContent = language.content.subtitle_global_offset_desc || "新打开的视频将以此基准开始。播放中按 Alt+[ / Alt+] 仅对当前视频临时生效，切视频自动复位。";
    configWrapper.appendChild(descEl);

    container.appendChild(configWrapper);
  }
}
```

---

## 6. 架构收益评估 (Benefits & Wins)

| 评估维度 | 重构前现状 | 深模块化重构后（最佳实践） |
| :--- | :--- | :--- |
| **Locality (局部性)** | 状态与逻辑散落在 Controller、Renderer、Timeline 与 Interceptor 4 个导出类中，必须跨文件来回跳转。 | 字幕生命周期调度、时间轴管理、网络拦截与覆盖层渲染统一由 `CaptionController` 闭环管辖。 |
| **Leverage (高杠杆)** | 上层模块与单测需理解 4 个单例的公开方法与联动次序，提防未初始化的全局状态。 | 外部调用方仅需面对唯一的 `CaptionController` 领域方法；UI 渲染交由 `CaptionSettingsView` 处理。 |
| **Deletion Test (删除测试)** | 尝试删除 `CaptionOverlayRenderer` 会导致外部引用报错。 | 外部完全无感知 Renderer/Timeline 的存在，内部组件可随意替换或重构。 |
| **运行时安全性与零开销** | 存在裸绑 `window.keydown` 与对播放器容器的深层 `{ subtree: true }` MutationObserver；可能在暂停时维持 rAF 空转。 | 零裸 keydown，零深层 subtree 突变观察；Renderer 保持媒体原生事件闭环，严格落实暂停停机。 |
| **关注点分离 (SoC)** | 核心控制器混杂了 98 行具体的 DOM 构建与样式拼接代码。 | 控制器回归纯数值与状态调度，视图渲染完全抽离至 `CaptionSettingsView`。 |

---

## 7. 破坏面分析与实施步骤

### 7.1 破坏面排查
- **导出收敛**：经全局检索确认，除 `src/registry/descriptors.ts` 与字幕模块自身外，全工程没有任何外部文件引用 `CaptionOverlayRenderer`、`SubtitleTimeline` 或 `TimedTextInterceptor`。收归为私有组件安全无副作用。
- **别名清理**：移除 `export const CaptionRenderer = CaptionOverlayRenderer;` 遗留别名，全局无任何调用依赖。
- **配置面板挂载**：`CaptionController.renderSettingsConfig` 作为委托保留，[`src/registry/descriptors.ts`](../../src/registry/descriptors.ts) 无需修改即可保持编译通过并平滑运行。

### 7.2 实施步骤
1. **抽离 `settings-view.ts`**：创建独立的设置视图组件；
2. **纯化 `timeline.ts`**：消除单例模式，改为可实例化的纯内存 Cue 管理结构；
3. **改造 `interceptor.ts`**：支持实例化与回调注入，消除对全局 Timeline 单例的硬编码依赖；
4. **改造 `renderer.ts`**：
   - 构造时接收控制器提供的状态回调与私有时间轴引用；
   - 精确绑定 `<video>` 原生事件以闭环维护 `isPlaying`；
   - 消除对容器的深层 subtree MutationObserver，优化为字幕按钮的单一节点属性观察；
5. **重塑 `controller.ts`**：收拢各组件为内部私有实例，消除裸 keydown 监听，提供纯粹的领域数值与生命周期方法；
6. **收敛 `index.ts`**：仅对外导出 `CaptionController`、`CaptionSettingsView`、常量及类型；
7. **自动化校验**：执行 `pnpm check` 与 `pnpm build` 确保零类型报错及构建产物正常生成。
