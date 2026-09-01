# YouTube Turbo – 字幕与工具栏子系统深模块化重构方案 (Caption & Toolbar Architecture Deepening Plan)

本方案基于 **Codebase Design** 哲学（深模块、清晰缝隙、局部性、删除测试、依赖反转与单一测试面），针对代码库中的 **Candidate 3（字幕校准子系统）** 与 **Candidate 4（多插槽工具栏子系统）** 进行系统性深化重构与架构升级。

---

## 1. 架构目标与设计原则

- **深模块封装与最小外部表面（Deep Module Encapsulation）**：
  将网络拦截、Transcript 解析、二分寻帧、DOM 覆盖层、反应式插槽渲染与浮层防溢出定位等复杂逻辑完全封装在深模块内部，对外仅暴露最小公共接口（Leverage 最大化）。
- **去中心化注册与依赖反转（Inversion of Control & Decoupled Architecture）**：
  解除 UI 基础设施层对上层业务特性的静态反向依赖。`ToolbarController` 保持为纯粹的 UI 调度引擎，各业务 Feature 在自身生命周期内向 `Toolbar` 声明式注册动作。
- **纯被动拦截与单一事实源（Passive Capture & Single Source of Truth）**：
  字幕子系统彻底废弃脆弱的主动 `fetch`，由 `TimedTextInterceptor` 作为唯一权威输入源；通过纯计算内核 `SubtitleTimeline` 统一管理 Cue 时间轴与 `O(log N)` 毫秒级二分查找。
- **反应式挂载与零开销常态（Event-Driven Reactive Mount）**：
  彻底废除 500ms `setInterval` 轮询守护定时器，采用“路由生命周期钩子 + 局部按需 `MutationObserver`（就绪即断开）”的反应式总线，实现 0 闲置 CPU 消耗与即时挂载。
- **样式单例生命周期受控（StyleEngine Lifecycle Discipline）**：
  所有子系统样式必须注册在 `StyleEngine` 专属 ID 命名空间下，并在 `destroy` 或 `unmount` 时精准释放，杜绝样式污染。

---

## 2. 领域模型与目录拓扑

### 2.1 核心领域模型术语

- **`CaptionController`**：字幕子系统核心协调深模块，统管网络拦截、时间轴解析、覆盖层渲染、快捷键调度与全局/临时基准偏移状态。
- **`SubtitleTimeline`**：字幕时间轴纯计算引擎，负责 JSON3/XML 格式解析、时间戳偏移修正与毫秒级二分切片检索（无 DOM 依赖，支持 100% 单元测试覆盖）。
- **`TimedTextInterceptor`**：运行在主页面上下文的全局网络拦截器，拦截 YouTube `/api/timedtext` 并将原始 payload 派发给时间轴引擎。
- **`CaptionOverlayRenderer`**：字幕覆盖层渲染引擎，负责 `rAF` 帧同步渲染、原生字幕互斥隐藏与 `StyleEngine` 样式集成。
- **`ToolbarController`**：多插槽悬浮工具箱与操作栏核心深模块，统管全站插槽装载、Popover 浮层边界定位与动作调度。
- **`ReactiveMounter`**：无定时器的反应式挂载引擎，利用 SPA 导航事件和局部 MutationObserver 实现按需精准挂载。
- **`ActionRegistry`**：动作注册表，维护插槽动作配置、动态图标解析与响应式状态订阅。

### 2.2 目标目录结构拓扑

```
src/
├── features/
│   └── caption/
│       ├── index.ts               # 统一导出 CaptionController
│       ├── controller.ts          # CaptionController (深模块外观，状态机调度)
│       ├── interceptor.ts         # TimedTextInterceptor (Fetch/XHR 网络拦截器)
│       ├── timeline.ts            # SubtitleTimeline (纯计算：解析、二分检索与时间偏移)
│       ├── renderer.ts            # CaptionOverlayRenderer (DOM 覆盖层与 StyleEngine 接入)
│       ├── constants.ts           # 常量定义
│       └── types.ts               # 类型契约
└── ui/
    └── toolbar/
        ├── index.ts               # 统一导出 Toolbar / ToolbarController
        ├── toolbar.ts             # ToolbarController (插槽总线与生命周期)
        ├── action-registry.ts     # ActionRegistry (动作注册表与状态绑定)
        ├── reactive-mounter.ts    # ReactiveMounter (无定时器的事件驱动挂载引擎)
        ├── popover.ts             # PopoverEngine (边界防溢出定位)
        ├── constants.ts           # 常量与 Slot 枚举
        └── types.ts               # 插槽与动作接口
```

---

## 3. Candidate 3：字幕校准子系统深化方案 (`CaptionController`)

### 3.1 架构设计与单向数据流

```
[ YouTube Network /api/timedtext ]
               │
               ▼ (Fetch/XHR Hook)
┌──────────────────────────────────────────────────────────────────┐
│ TimedTextInterceptor                                             │
│  └─ Modify timestamps in payload & dispatch raw text             │
└──────────────────────────────┬───────────────────────────────────┘
                               │ (Passive Capture)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ Deep Module: CaptionController                                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ SubtitleTimeline (Pure Core, Binary Search)                │  │
│  │  • parsePayload(json3/xml) -> SubtitleCue[]               │  │
│  │  • findActiveCues(cues, targetMs) -> O(log N)             │  │
│  │  • shiftTimestamps(cues, offsetMs)                         │  │
│  └────────────────────────────┬───────────────────────────────┘  │
│                               │                                  │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ CaptionOverlayRenderer                                     │  │
│  │  • rAF loop synced with video.currentTime                  │  │
│  │  • Mutex control with native caption container             │  │
│  │  • StyleEngine lifecycle (Scoped ID)                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Public Interface: init, destroy, advance, delay, reset,         │
│                    getEffectiveOffsetMs, getState, ...           │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 纯计算时间轴引擎 (`SubtitleTimeline`)

`SubtitleTimeline` 专注于纯数据转换与检索，不引入任何 DOM、Window 或 GM API 依赖，保证极高的执行性能与测试便利性：

```typescript
export class SubtitleTimeline {
  private cuesCache: Map<string, SubtitleCue[]> = new Map();
  private currentCues: SubtitleCue[] = [];
  private currentKey: string = "";

  public parseJson3(text: string): SubtitleCue[];
  public parseXml(text: string): SubtitleCue[];
  public parsePayload(rawText: string): SubtitleCue[];

  public ingest(key: string, rawText: string): void;
  public setCurrentKey(key: string): void;
  public getCurrentCues(): SubtitleCue[];

  /**
   * 基于二分查找在 O(log N) 复杂度内检索当前时间戳命中的 Cue 片段
   */
  public findActiveCues(currentMs: number): SubtitleCue[];
  public clear(): void;
}
```

### 3.3 目标接口定义 (`src/features/caption/controller.ts`)

```typescript
export interface CaptionOffsetState {
  globalDefaultOffsetMs: number;
  sessionOffsetMs: number;
  effectiveOffsetMs: number;
}

export class CaptionController {
  private static instance: CaptionController | null = null;
  public static getInstance(): CaptionController;

  public init(): void;
  public destroy(): void;

  public advance(stepMs?: number): void;
  public delay(stepMs?: number): void;
  public reset(): void;

  public getEffectiveOffsetMs(): number;
  public getGlobalDefaultOffsetMs(): number;
  public setGlobalDefaultOffset(offsetMs: number): void;
  public getState(): CaptionOffsetState;

  public renderSettingsConfig(container: HTMLElement, language: LanguageDefinition): void;
}
```

### 3.4 交付与变更清单

1. **清理死代码与假缝隙**：删除 `src/features/caption/reloader.ts`，移除 `SubtitleOffset` 浅包装。
2. **重构数据摄入为纯被动式**：移除 `CaptionStore.fetchCues`，统一通过 `TimedTextInterceptor` 在网络层拦截并导入 `SubtitleTimeline`。
3. **提取纯计算时间轴**：新建 `src/features/caption/timeline.ts`，实现 Json3/XML 解析与二分切片查找。
4. **收敛内部依赖**：`interceptor.ts`、`timeline.ts`、`renderer.ts` 仅作为内部模块，`src/features/caption/index.ts` 仅导出 `CaptionController`。
5. **对齐 FeatureRegistry**：`src/registry/descriptors.ts` 的 `isOpenSubtitleOffset` 直接绑定到 `CaptionController.getInstance().init()` / `destroy()`。

---

## 4. Candidate 4：工具栏与多插槽悬浮箱子系统深化 (`ToolbarController`)

### 4.1 架构设计与依赖反转

```
┌──────────────────────────────────────────────────────────────────┐
│ Deep Module: ToolbarController (UI Infrastructure)               │
│                                                                  │
│  ├── Unified Public Interface                                    │
│  │    ├── init() / destroy()                                     │
│  │    ├── registerAction(config) / registerActions(configs)      │
│  │    ├── mountSlot(slotKey) / unmountSlot(slotKey)              │
│  │    └── refreshSlot(slotKey)                                   │
│  │                                                               │
│  └── Encapsulated Subsystems                                     │
│       ├── ReactiveMounter                                        │
│       │    (Event-driven hooks + target-specific Observer)       │
│       ├── ActionRegistry                                         │
│       │    (Action Definitions, State Subscriptions)             │
│       ├── PopoverEngine                                          │
│       │    (Viewport Clamp Calculation, Hover Delay)             │
│       └── SlotRenderers (Data-Driven for Controls/Shorts/Watch)  │
└──────────────────────────────────────────────────────────────────┘
                               ▲
                               │ (Self-Registration: IoC Pattern)
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────┴────────┐     ┌───────┴────────┐     ┌───────┴────────┐
│ PlayerFeature  │     │  ThemeFeature  │     │ DownloadFeature│
│ (loop/shot/pip)│     │ (theme toggle) │     │ (watch/shorts) │
└────────────────┘     └────────────────┘     └────────────────┘
```

### 4.2 反应式挂载总线 (`ReactiveMounter`)

彻底淘汰 500ms `setInterval`，使用事件与针对性局部观察者驱动：

```typescript
export interface SlotDefinition {
  containerSelector: string;
  targetSelector: string;
  elementId: string;
  mount: (target: HTMLElement, element: HTMLElement) => void;
}

export class ReactiveMounter {
  private observers: Map<string, MutationObserver> = new Map();
  private registeredRenderers: Map<string, () => HTMLElement | null> = new Map();

  public bindEvents(): void;
  public mountSlot(slotKey: string, definition: SlotDefinition, renderer: () => HTMLElement | null): void;
  public unmountSlot(slotKey: string, definition: SlotDefinition): void;
  public refreshAll(): void;
  public destroy(): void;
}
```

- **挂载策略**：
  1. 监听 `yt-navigate-finish`、`yt-page-type-changed`、`DOMContentLoaded` 时执行挂载尝试；
  2. 若目标 DOM 已存在，直接执行 `mount` 并完成；
  3. 若目标 DOM 尚未生成，在父容器上建立局部 `MutationObserver`，一旦目标节点被创建并插入立即完成挂载，并**立刻断开该 Observer**，杜绝无谓的持续监听开销。

### 4.3 全插槽数据驱动与自注册机制

所有插槽（包括 Shorts 侧边栏与 Watch 视频信息栏）统一由 `ActionRegistry.getActionsBySlot(slotKey)` 提供数据驱动渲染，彻底移除硬编码 DOM：

```typescript
export interface ActionContext {
  actionId: string;
  slot: string;
  buttonElement: HTMLElement;
  refresh: () => void;
}

export interface ActionConfig {
  id: string;
  slot: string;
  titleKey: string;
  defaultTitle: string;
  icon: string | { normal: string; active: string };
  order?: number;
  isVisible?: () => boolean;
  isActive?: () => boolean;
  onClick: (event: MouseEvent, ctx: ActionContext) => void;
  onStateBind?: (refreshCallback: () => void) => (() => void) | void;
}
```

### 4.4 目标接口定义 (`src/ui/toolbar/toolbar.ts`)

```typescript
export class ToolbarController {
  private static instance: ToolbarController | null = null;
  public static getInstance(): ToolbarController;

  public init(): void;
  public destroy(): void;

  public registerAction(action: ActionConfig): void;
  public registerActions(actions: ActionConfig[]): void;

  public mountSlot(slotKey: string): void;
  public unmountSlot(slotKey: string): void;
  public refreshSlot(slotKey: string): void;
  public refresh(): void;
}

export const Toolbar = ToolbarController.getInstance();
```

### 4.5 交付与变更清单

1. **删除冗余门面**：删除 `src/ui/toolbar/toolbox.ts`。
2. **剥离业务循环依赖**：`toolbar.ts` 移除对 `FeatureRegistry`、`ThemeController`、`PlayerController`、`Modal` 的静态引用，改为外部通过 `Toolbar.registerAction(...)` 注入。
3. **升级为反应式挂载**：重构 `src/ui/toolbar/mount-adapter.ts` 为 `src/ui/toolbar/reactive-mounter.ts`，废除 `setInterval`。
4. **统一数据驱动渲染**：Shorts、Watch Metadata、Player Controls 插槽统一通过 `ActionRegistry` 渲染按钮，消除硬编码。
5. **样式管理规范化**：通过 `StyleEngine.inject(TOOLBAR_CONSTANTS.STYLE_ID, css)` / `remove` 统一接管生命周期。

---

## 5. 验证计划与测试策略

### 5.1 纯计算内核单元测试

针对脱离 DOM 的计算模块编写单元测试：
1. **`SubtitleTimeline` 测试**：
   - 验证 JSON3 / XML (Srv1 & Srv3) 格式的解析正确性；
   - 验证时间偏移注入（正负偏移、下溢边界截断为 0ms）；
   - 验证二分查找在密集与稀疏字幕轴上的 `O(log N)` 毫秒级命中准确性。
2. **`PopoverEngine` 测试**：
   - 验证不同视口尺寸与播放器边界下的坐标夹紧（Clamping）逻辑，确保不出现负值坐标与视口溢出。

### 5.2 TypeScript 严格类型检查

```powershell
pnpm run check
```
- 验证所有模块无隐式 `any`，已删除的浅对象/死文件无遗留引用，接口类型完全契合严格模式。

### 5.3 构建与端到端运行验证

```powershell
pnpm run build
```
- 确保 `dist/youtube-turbo.user.js` 打包产物无异常；
- 验证 `Alt+[` / `Alt+]` / `Alt+\` 快捷键在全屏、剧院及默认模式下的字幕即时响应与 HUD 提示；
- 验证播放器工具箱、Shorts 下载按钮、视频下方下载按钮在 SPA 路由切换中的即时挂载与无痕卸载。
