# Tabview 观察职责领域化架构深化方案

## 1. 方案目标

本方案将 Tabview 页面端的 DOM 观察、状态投影与生命周期清理收敛到实际拥有这些行为的领域 module，使每个 module 的 interface 隐藏完整的观察 implementation，并让 `TabviewLifecycleCoordinator` 只承担路由生命周期编排。

目标终态如下：

- `TabviewPanelState` 统管直播聊天、播放列表、评论与互动面板的观察和布局状态投影。
- `ExpanderFixer` 统管 right-tabs 尺寸变化与 comment-entry 可见性交互。
- `ChannelHoverAdapter` 统管 upload-info 尺寸变化与 pointer 交互。
- `DOMRelocator` 统管 secondary-inner 的局部突变观察与 Slot 重排。
- `TabviewLifecycleCoordinator` 统管 navigation listener、route generation 与 teardown ordering。
- `PolymerPatcher` 仅负责 Polymer hook 的安装、恢复与领域语义转发。
- 删除 `ObserverRegistry`、`ObserverConfig` 及其 mutation/resize/intersection 配置类型。
- 不导出通用 `ObserverFactory`，测试通过替换 jsdom 全局 Observer 构造器控制 implementation。

该终态提高 module 的 **depth**：caller 只表达“进入详情页路由”“绑定面板宿主”“挂载右侧 Tab”等领域意图，Observer 的创建、复用、目标替换、回调过滤和清理均隐藏在 implementation 内。它同时提高 **locality** 与 **leverage**：一次修改面板状态规则、展开器触发规则或节点重排规则时，不再需要跨越集中式 registry 与领域 caller 来回追踪。

## 2. 约束与架构基线

### 2.1 ADR-0003：纯事件驱动生命周期

本方案延续 `docs/adr/0003-event-driven-tabview-lifecycle.md` 的既有决策：

- 不引入 `setInterval`、递归 timeout、级联延时或其他常驻任务。允许由明确 owner 持有、具名且可在 teardown 中取消的 one-shot timeout。
- 路由同步由 `yt-navigate-finish`、`yt-page-type-changed`、`yt-action`、`popstate`、`DOMContentLoaded` 与 Polymer 生命周期事件驱动。
- Slot 和面板状态变化由局部 Observer 精确驱动。
- 离开 `/watch` 路由后，route-scoped Observer 立即断开。
- 静止页面没有待处理 DOM 事件或 Observer 通知时，JavaScript 主线程开销归零。

### 2.2 ADR-0005：聚合挂载总线

本方案不改变 `SlotMountBus` 的 ownership，也不建立与之竞争的全局观察器：

- `SlotMountBus` 继续负责工具栏多插槽的聚合挂载。
- `DOMRelocator` 只观察当前 `/watch` 路由内精确的 secondary-inner 直接子节点。
- 禁止向 `document.body` 或 `document.documentElement` 建立无边界 `subtree` 观察。
- secondary-inner Observer 在 route teardown 时断开，不作为跨路由总线存在。

### 2.3 跨上下文物理隔离

本次深化仅发生在 Tabview page implementation 内：

- `TabviewPanelState`、`ExpanderFixer`、`ChannelHoverAdapter`、`DOMRelocator`、`PolymerPatcher` 与 `TabviewLifecycleCoordinator` 均运行于页面上下文。
- 不在页面端调用 `GM_*`。
- 不让 sandbox 直接读取 `window.yt`、Polymer controller 或页面端 Observer。
- `TabviewSession` 的跨上下文协议不承担任何 DOM Observer ownership。

### 2.4 实施顺序

本方案在 `docs/tabview-session-architecture-deepening-plan.md` 完成后实施，并复用其中建立的 Vitest + jsdom 基础设施。该顺序先稳定 sandbox/page seam 与 teardown 语义，再调整 page implementation 内的 Observer ownership，避免同时改变跨上下文 protocol 与页面生命周期。

## 3. 当前架构摩擦

现有 `ObserverRegistry` 的 public interface 同时暴露两类不一致能力：

1. 以 `ObserverConfig`、字符串 id、`register()`、`activate()`、`deactivate()` 表达的通用 registry。
2. 以 `observeChat()`、`observePlaylist()`、`observeRightTabs()`、`observeSecondaryInner()` 等方法表达的领域行为。

通用 interface 并未隐藏领域复杂度，领域 callback、状态字段、DOM 属性投影与 selector 仍集中在同一文件中，因此它是一个 **shallow module**。同时，`deactivate()` 只处理通用配置 Map，而多数实际 Observer 由独立字段持有，使 caller 无法从 interface 判断一次 route teardown 会停止哪些观察。

该组织还形成反向依赖：registry 需要了解 `ExpanderFixer`、`PolymerHelper`、Tabview 属性以及不同面板的业务状态。一次面板规则调整会同时触及 owner、registry 与 coordinator，降低 locality；全局 `clearAll()` 则把多个领域 module 的错误处理和 cleanup ordering 压缩成一个不透明操作，降低测试 leverage。

删除 `ObserverRegistry` 后，复杂度不会转移到 caller，而是集中到各自领域 module 的 private implementation。因此该变化通过 deletion test，并形成更 deep 的 module。

## 4. 目标架构

```text
TabviewSession（sandbox/page seam）
              │
              ▼
TabviewLifecycleCoordinator
  ├─ navigation listeners + route generation
  ├─ teardown ordering
  ├─ TabviewPanelState ── chat / playlist / comments / engagement
  ├─ DOMRelocator ─────── secondary-inner Mutation
  ├─ ExpanderFixer ────── right-tabs Resize / comment Intersection
  ├─ ChannelHoverAdapter ─ upload-info Resize / pointer
  └─ PolymerPatcher ───── hook install / restore / semantic forwarding
```

原生 `MutationObserver`、`ResizeObserver` 与 `IntersectionObserver` 是各 owner 的 private implementation detail。唯一公开的观察相关 seam 是 `PolymerPatcher` 的语义 hook interface，因为 YouTube Polymer 生命周期 adapter 与多个领域 module 之间存在真实的双侧协作。

## 5. Ownership 表

| 原生资源或状态 | 唯一 owner module | 创建时机 | 停止时机 | callback 的领域结果 |
| --- | --- | --- | --- | --- |
| navigation DOM listeners | `TabviewLifecycleCoordinator` | feature `init()` | feature `destroy()` 前半段 | 解析路由并推进 route generation |
| 未触发的 `DOMContentLoaded` listener | `TabviewLifecycleCoordinator` | document 尚在 loading 时 | 触发后或 feature `destroy()` | 单次路由同步 |
| secondary-inner `MutationObserver` | `DOMRelocator` | watch route 挂载且目标存在 | route unmount 或 target replacement | `sweepSecondary()` |
| chat `MutationObserver` | `TabviewPanelState` | chat host 语义 attached | exact-element disposer、route unmount 或 destroy | 投影折叠状态到当前 flexy |
| playlist `MutationObserver` | `TabviewPanelState` | playlist host 语义 attached | exact-element disposer、route unmount 或 destroy | 投影展开状态到当前 flexy |
| comments `MutationObserver` | `TabviewPanelState` | comments host 语义 attached | exact-element disposer、route unmount 或 destroy | 投影可见性与禁用状态 |
| engagement panel `MutationObserver` | `TabviewPanelState` | panel host 语义 attached | exact-element disposer、route unmount 或 destroy | 投影可见面板集合状态 |
| right-tabs `ResizeObserver` | `ExpanderFixer` | right-tabs 挂载 | route unmount、target replacement 或 destroy | 仅在宽度变化时修复展开器 |
| comment-entry `IntersectionObserver` | `ExpanderFixer` | comment entry 语义 attached | exact-element disposer、route unmount 或 destroy | comments tab 激活时计算折叠能力 |
| upload-info `ResizeObserver` | `ChannelHoverAdapter` | metadata host 语义 attached 后由 adapter 私下定位 upload-info | metadata exact-element disposer、route unmount 或 destroy | pointer 活跃窗口内检测溢出 |
| upload-info pointer listeners | `ChannelHoverAdapter` | 与同 metadata attachment 的 Resize 绑定同时 | 与同 metadata attachment 同时 | 设置和清理 hover 布局状态 |
| Polymer prototype restore entries | `PolymerPatcher` | `applyPatches()` | `restorePatches()` | 恢复原始 prototype method |
| exact-element disposer 集合 | `PolymerPatcher` | semantic attached hook 返回 disposer | detached hook 或 `restorePatches()` | 容错反向 cleanup |

## 6. Interface 草图

以下草图表达目标 public interface。所有参数、返回值和回调均显式标注类型，不使用隐式 `any`。

### 6.1 共享生命周期类型

```ts
declare const routeGenerationBrand: unique symbol;

export type RouteGeneration = number & {
  readonly [routeGenerationBrand]: true;
};

export type IdempotentDisposer = () => void;

export interface WatchRouteContext {
  readonly generation: RouteGeneration;
  readonly state: Readonly<NavigationState>;
  readonly flexy: HTMLElement;
}
```

`RouteGeneration` 由 `TabviewLifecycleCoordinator` 单调推进，只在 page implementation 内流转。每个 route-scoped callback 捕获创建时的 generation，并在执行前与 owner 当前 generation 比对。

### 6.2 TabviewLifecycleCoordinator

```ts
export interface TabviewLifecycleCallbacks {
  readonly onTabChanged?: (tabKey: TabKey) => void;
  readonly onFontSizeChanged?: (
    tabKey: TabKey,
    fontSize: number
  ) => void;
}

export class TabviewLifecycleCoordinator {
  public static getInstance(): TabviewLifecycleCoordinator;

  public init(
    initialLocale: LocaleSnapshot,
    callbacks?: TabviewLifecycleCallbacks
  ): void;

  public getState(): Readonly<NavigationState>;
  public setLocale(snapshot: LocaleSnapshot): void;
  public setActiveTab(tabKey: TabKey): void;
  public setFontSize(tabKey: TabKey, fontSize: number): void;
  public destroy(): void;
}
```

caller 不接触 generation、Observer 或 cleanup 数组。`init()` 与 `destroy()` 均幂等；`init()` 建立 feature-scoped navigation interface，路由切换时由 private implementation 创建或替换 watch route。

### 6.3 TabviewPanelState

```ts
export interface TabviewPanelStateCallbacks {
  readonly onPlaylistAvailabilityChanged: (
    isAvailable: boolean
  ) => void;

  readonly onCommentsAvailabilityChanged: (
    isAvailable: boolean
  ) => void;
}

export class TabviewPanelState {
  public constructor(callbacks: TabviewPanelStateCallbacks);
  public activateRoute(context: WatchRouteContext): void;

  public attachChat(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer;

  public attachPlaylist(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer;

  public attachComments(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer;

  public attachEngagementPanel(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer;

  public deactivateRoute(generation: RouteGeneration): void;
  public destroy(): void;
}
```

`attach*()` 同时完成初始状态投影与增量观察。对同一 exact element、同一 generation 的重复调用复用现有 attachment，并返回指向同一 attachment 的幂等 disposer。旧 generation 的 attachment 请求返回安全的 no-op disposer，且不产生 DOM 副作用。

属性投影内部包含脏检查守卫（Dirty Check）：在向 `flexy` 写入或移除属性（如 `tyt-chat-collapsed`、`tyt-playlist-expanded`、`tyt-comment-disabled`、`tyt-egm-panel-wrap`）前比对当前状态，仅在状态发生真实跃迁时才执行 DOM 变更，避免无意义的属性写入触发 YouTube 内部布局样式重算或产生重入。

`deactivateRoute()` 只清理匹配 generation 的 attachment 和投影属性。`destroy()` 清理全部 attachment，并将当前 flexy 上由 `TabviewPanelState` 拥有的属性恢复到未投影状态。

`TabviewPanelStateCallbacks` 只把播放列表与评论可用性变化同步通知 `TabviewLifecycleCoordinator`，由 coordinator 决定 tab 可见性与 active tab 回退。`TabviewPanelState` 不依赖 `TabviewSession`，也不直接发送任何跨上下文 event；tab change 与 font-size change 仍由既有 coordinator/session 路径发送。

### 6.4 ExpanderFixer

```ts
export interface ExpanderRouteContext {
  readonly generation: RouteGeneration;
  readonly rightTabs: HTMLElement;
  readonly initialTab: TabKey;
}

export class ExpanderFixer {
  public constructor(tabsView: TabsView);

  public activateRoute(context: ExpanderRouteContext): void;
  public setActiveTab(
    tabKey: TabKey,
    generation: RouteGeneration
  ): void;

  public attachCommentEntry(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer;

  public fixForTabDisplay(
    isResize?: boolean,
    activeTabSelector?: string
  ): void;

  public updateCommentsCounter(): void;
  public deactivateRoute(generation: RouteGeneration): void;
  public destroy(): void;
}
```

right-tabs `ResizeObserver` 完全隐藏在 `activateRoute()` 后面。相同 target 重复激活不重复 observe；target replacement 先断开旧 target。comment-entry `IntersectionObserver` 及 comments-active 状态由 `ExpanderFixer` 一并拥有，callback 不再跨 module 查询全局 registry。

### 6.5 ChannelHoverAdapter

```ts
export class ChannelHoverAdapter {
  public activateRoute(generation: RouteGeneration): void;

  public attachMetadata(
    metadata: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer;

  public deactivateRoute(generation: RouteGeneration): void;
  public destroy(): void;
}
```

`ChannelHoverAdapter` 是 YouTube metadata DOM 与 Tabview hover 行为之间的 adapter。它在 `attachMetadata()` 的 private implementation 内定位属于该 exact metadata 的 upload-info；Resize 与 pointer listener 作为一个 attachment 原子安装、原子清理，caller 不分别查找或操作底层资源。metadata 尚未包含 upload-info 时返回幂等 no-op disposer，后续由新的 metadata 语义 replay 或 attached 事件重试，不建立宽泛观察器。

### 6.6 DOMRelocator

```ts
export interface RelocatorRouteOptions {
  readonly generation: RouteGeneration;
  readonly secondaryInner: HTMLElement;
  readonly tabsOptions: TabsViewOptions;
}

export class DOMRelocator {
  public static getInstance(): DOMRelocator;

  public mountRoute(options: RelocatorRouteOptions): HTMLElement;
  public registerDefaultSlots(): void;
  public tryRelocateSlot(tabKey: TabKey): boolean;
  public refreshAllSlots(): void;
  public restoreSlot(tabKey: TabKey): void;
  public unmountRoute(generation: RouteGeneration): void;
  public getTabsView(): TabsView;
  public isContainerMounted(): boolean;
  public destroy(): void;
}
```

`mountRoute()` 在创建或复用 right-tabs 的同时绑定 exact secondary-inner。Mutation callback 内部完成节点过滤并直接调用 private `sweepSecondary()`，避免向 coordinator 暴露“观察后再 sweep”的 shallow 两步 interface。

### 6.7 PolymerPatcher 语义 seam

```ts
export interface PolymerSemanticHooks {
  readonly onChatAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onPlaylistAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onCommentsAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onEngagementPanelAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onCommentEntryAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onMetadataAttached: (
    element: HTMLElement
  ) => IdempotentDisposer;

  readonly onRelatedAttached: (element: HTMLElement) => void;
  readonly onCommentsHeaderDataChanged: (element: HTMLElement) => void;
}

export class PolymerPatcher {
  public static getInstance(): PolymerPatcher;
  public applyPatches(hooks: PolymerSemanticHooks): void;
  public patchFlexyInstance(flexy: HTMLElement): void;
  public replayConnected(): void;
  public restorePatches(): void;
}
```

`PolymerPatcher` 只把 `attached`、`detached`、`dataChanged` 等原始 hook 翻译成领域语义。它不创建领域 Observer、不投影布局状态、不调用 `DOMRelocator`、`TabviewPanelState`、`ExpanderFixer` 或 `ChannelHoverAdapter` singleton。

对于返回 disposer 的 attached 语义，`PolymerPatcher` 使用 exact element 作为 key 保存 disposer。对应 detached hook 只执行该 exact element 的 disposer，并立即从活跃集合中注销；`restorePatches()` 按 attachment 创建顺序的逆序清理仍存活的 disposer，然后逆序恢复 prototype method。`pruneDisconnectedDisposers()` 在路由停用及代际更迭时主动遍历清理已脱离文档（`isConnected === false`）的陈旧 disposer，防止在不触发 Polymer 原型 `detached` 的宿主 DOM 替换场景下于长单页会话中积累内存驻留。

`replayConnected()` 对调用时已经连接的 Polymer element 同步重放相同语义 interface，不等待未来 Custom Elements 注册或 attached 事件；尚未完成的异步 patch 只产生 diagnostic，不阻塞当前启动的 READY barrier。当任意延迟升级的 Custom Element 异步完成原型 patch（如 `retrieveCE` resolve）后，立即针对当前 DOM 中已存在的该 tag 实例触发局部自愈重放（Self-healing Replay），闭合冷启动期间元素提前挂载但错失 `attached` 调用的异步时序空窗。

这一 interface 是真实 seam：一侧是易变化的 YouTube Polymer 生命周期 adapter，另一侧是稳定的 Tabview 领域 module。它把 Polymer method 名称隔离在 implementation 中，同时允许领域测试不依赖真实 Custom Elements 注册过程。

## 7. Caller-first 组合方式

`TabviewLifecycleCoordinator.init()` 只组合一次语义 hook：

```ts
this.panelState = new TabviewPanelState({
  onPlaylistAvailabilityChanged: (isAvailable: boolean): void =>
    this.handlePlaylistAvailabilityChanged(isAvailable),
  onCommentsAvailabilityChanged: (isAvailable: boolean): void =>
    this.handleCommentsAvailabilityChanged(isAvailable)
});

this.polymerPatcher.applyPatches({
  onChatAttached: (element: HTMLElement): IdempotentDisposer =>
    this.panelState.attachChat(element, this.routeGeneration),

  onPlaylistAttached: (element: HTMLElement): IdempotentDisposer =>
    this.panelState.attachPlaylist(element, this.routeGeneration),

  onCommentsAttached: (element: HTMLElement): IdempotentDisposer =>
    this.panelState.attachComments(element, this.routeGeneration),

  onEngagementPanelAttached: (element: HTMLElement): IdempotentDisposer =>
    this.panelState.attachEngagementPanel(element, this.routeGeneration),

  onCommentEntryAttached: (element: HTMLElement): IdempotentDisposer =>
    this.expanderFixer.attachCommentEntry(element, this.routeGeneration),

  onMetadataAttached: (metadata: HTMLElement): IdempotentDisposer => {
    this.refreshCurrentMetadata(metadata);
    return this.channelHoverAdapter.attachMetadata(
      metadata,
      this.routeGeneration
    );
  },

  onRelatedAttached: (): void => this.refreshCurrentRouteSlots(),
  onCommentsHeaderDataChanged: (): void =>
    this.expanderFixer.updateCommentsCounter()
});
```

`refreshCurrentMetadata()` 由 coordinator 调用既有 `InfoMirrorEngine` owner 完成信息镜像同步；`ChannelHoverAdapter` 只拥有 metadata 内的 hover attachment。两条行为共享同一个 Polymer metadata 语义入口，但互不持有对方 dependency。

外部 caller 仍保持最短路径：

```ts
const coordinator: TabviewLifecycleCoordinator =
  TabviewLifecycleCoordinator.getInstance();

coordinator.init(initialLocale, callbacks);
coordinator.destroy();
```

navigation caller 不操作子 module：

```ts
private handleRouteChange(): void {
  const nextState: NavigationState = this.resolveNavigationState();
  const generation: RouteGeneration = this.advanceRouteGeneration();

  this.deactivateCurrentRoute();
  this.currentState = nextState;

  if (nextState.pageType === "watch") {
    this.activateWatchRoute(generation, nextState);
  }
}
```

## 8. 生命周期不变量

### 8.1 单一 ownership

1. 每个原生 Observer 实例只有一个领域 owner。
2. owner 的 public `destroy()` 覆盖其全部 Observer、DOM listener、element attachment 和投影副作用。
3. caller 不保存原生 Observer，也不调用 `observe()`、`unobserve()` 或 `disconnect()`。
4. `PolymerPatcher` 只保存 disposer，不理解 disposer 背后的领域 implementation。

### 8.2 exact-element 幂等 disposer

1. attachment identity 是 `owner + element + generation + semantic kind`。
2. 同一 identity 重复 attach 不创建第二个 Observer 或 listener。
3. disposer 只清理其 exact element，不通过 selector 查找“当前元素”。
4. disposer 重复调用为 no-op。
5. disposer 在 route teardown 后调用仍为 no-op。
6. 新 element 替换旧 element 时，旧 disposer 不能清理新 attachment。
7. disposer 执行后同步从 owner 的 `WeakMap` 与活跃可枚举集合注销；路由注销时主动淘汰 `isConnected === false` 的孤儿 attachment，防止长会话内存驻留。

### 8.3 route generation

1. 每次被接受的 navigation sync 在读取新 DOM 前推进 generation。
2. generation 推进立即使旧 callback 失效，即使底层回调已进入任务队列。
3. 所有 route-scoped Observer callback、microtask 和语义 hook 在写 DOM 前验证 generation。
4. `destroy()` 先推进 generation，再解绑 navigation，确保 teardown 期间没有旧回调重新挂载。
5. generation 只表达生命周期身份，不承载业务时间或视频序号。

### 8.4 状态投影

1. `TabviewPanelState` 只向当前 route context 的 flexy 投影属性。
2. attach 后立即执行一次同步投影，不等待首次 mutation。
3. 属性投影执行脏检查（Dirty Check），当前计算状态与 flexy 现有属性一致时跳过写入，杜绝重复写入触发宿主样式重算与重入。
4. route deactivation 清除本 module 拥有的全部投影属性。
5. stale generation、断开连接的 element 或不存在的 flexy 均不产生写入。
6. engagement panel 多元素状态以当前 generation 的 attachment 集合为唯一事实来源。

### 8.5 局部观察与闲置停机

1. secondary-inner Mutation 仅使用 `childList: true`、`subtree: false`。
2. 面板 Mutation 只观察状态所需的 attribute filter。
3. right-tabs Resize 仅在量化宽度变化时触发修复。
4. comment-entry Intersection 仅在 comments tab 激活时执行 Polymer 计算。
5. upload-info Resize 仅在 pointer 触发的有效检查窗口内执行溢出判断。
6. 不使用轮询、级联延时或全局 body observer。

## 9. Navigation 与 teardown ordering

### 9.1 Feature 初始化

1. 保存 locale 与 bridge callbacks。
2. 创建领域 module，并组合 `PolymerSemanticHooks`。
3. `PolymerPatcher.applyPatches()` 安装 hook。
4. 注册 feature-scoped navigation listeners。
5. 执行一次同步 route resolution，并完成当前 route owners 的激活与 mount。
6. `PolymerPatcher.replayConnected()` 同步转发调用时已经连接的 element。
7. 标记 initialized，并向 page `TabviewSession` 报告启动完成；session 发送唯一 READY。
8. `TabviewSession` 在 READY 后按产生顺序 FIFO 发送启动期间暂存的 page event。

初始化过程中任一步失败时，按已经完成步骤的逆序 cleanup；失败后的 `destroy()` 仍安全。

READY barrier 固定为 **hooks → route owners/mount → replayConnected → READY**。它只保证调用时可见的同步页面状态已经完成语义重放，不等待未来 Custom Elements 注册。异步 patch 暂缺或 method 尚不可用只记录 diagnostic；未来成功安装的 hook 在 patch 就绪时对已有 DOM 实例立即执行局部自愈重放，并按正常 attached/dataChanged 路径继续工作，不回退为轮询，也不阻塞 READY。

### 9.2 Watch route 激活

1. 推进 route generation，并使旧 callback 失效。
2. 按第 9.3 节停用旧 route。
3. 解析 exact flexy 与 secondary-inner；缺失时保持事件驱动等待，不建立宽泛 observer。
4. `TabviewPanelState.activateRoute()` 建立投影上下文。
5. `DOMRelocator.mountRoute()` 创建 right-tabs、绑定 secondary-inner 并注册 Slot。
6. `ExpanderFixer.activateRoute()` 绑定 right-tabs Resize 并完成初次展开器同步。
7. `ChannelHoverAdapter.activateRoute()` 接受当前 generation。
8. 刷新 Slot、面板状态、评论计数、链接评论与信息镜像。

首次 feature 初始化中的现存 element 重放统一由第 9.1 节的 `replayConnected()` 执行；后续 route 激活由已安装 hook 与 route generation 驱动。若新 route 的宿主在 navigation 完成前已连接，coordinator 可在 route owners/mount 完成后调用一次 `replayConnected()`，仍须保持 replay 在该 route 的任何 READY 或 ready-equivalent 通知之前。

### 9.3 Watch route 停用

停用顺序与激活依赖逆向对应：

1. `ChannelHoverAdapter.deactivateRoute()` 清理 upload-info attachment。
2. `ExpanderFixer.deactivateRoute()` 清理 Intersection、Resize 与 route 状态。
3. `TabviewPanelState.deactivateRoute()` 清理面板观察与 flexy 投影。
4. `DOMRelocator.unmountRoute()` 断开 secondary-inner、恢复 Slot 与移除 right-tabs。
5. 清理链接评论与信息镜像的 route-scoped 状态。
6. `PolymerPatcher.pruneDisconnectedDisposers()` 淘汰已脱离文档的孤儿 disposer 记录，防止长单页会话内存驻留。

每一步独立执行；某一步 cleanup 抛错时记录 owner 与 generation 后继续后续步骤。

### 9.4 Feature 销毁

1. 标记 destroying 并推进 generation。
2. 移除 navigation listeners 与尚未触发的 `DOMContentLoaded` listener。
3. 执行 watch route 停用顺序。
4. `PolymerPatcher.restorePatches()` 逆序执行残余 exact-element disposer 并恢复 prototype。
5. 依次销毁 `ChannelHoverAdapter`、`ExpanderFixer`、`TabviewPanelState` 与 `DOMRelocator`。
6. 销毁其余 page module，并清空 callbacks、locale 与 route state。
7. 标记 uninitialized。

### 9.5 TabviewSession 与观察 ownership 联合生命周期

`TabviewSession` 与 page 观察 module 具有互补且不重叠的 ownership：

- `TabviewSession` 拥有跨上下文 channel、READY barrier、READY 前 page event FIFO 与 session teardown 请求。
- `TabviewLifecycleCoordinator` 拥有页面端 navigation、route generation 和全部领域 owner 的 teardown ordering。
- 各观察 owner 只写页面 DOM 或同步通知 coordinator，不直接访问 bridge，也不发送跨上下文 event。
- page session 收到 teardown 后，先调用 `TabviewLifecycleCoordinator.destroy()`，确认观察、listener、disposer 与 Polymer patch 已完成容错反向 cleanup，再关闭 page channel。
- sandbox 再次 setup 时创建全新 `TabviewSession` 与 page session；旧 generation callback 和旧 session event 均不得进入新会话。

READY 之前由 coordinator callback 产生的 tab/font-size page event 由 `TabviewSession` 依产生顺序暂存。完成 `replayConnected()` 后，session 先发送 READY，再 FIFO flush 这些 pre-READY event；观察 module 不感知队列存在。teardown 期间不再接受新 page event，重复 teardown 为幂等 no-op。

## 10. 错误模式与处理规则

| 错误模式 | 检测位置 | 行为 | 保证 |
| --- | --- | --- | --- |
| Observer 构造失败 | 领域 owner attach | 报告 owner、semantic kind、generation；返回 no-op disposer | 不留下半初始化 attachment |
| `observe()` 失败 | 领域 owner attach | disconnect 已创建实例并移除 attachment | 后续同元素 attach 可重试 |
| callback 收到 stale generation | 每个 route-scoped callback | 立即返回 | 不写入新 route DOM |
| attached 重复触发 | owner attachment Map | 返回现有幂等 disposer | 单元素单 attachment |
| detached 重复或早于 attached | `PolymerPatcher` disposer Map | 安全忽略 | restore 顺序不受破坏 |
| target replacement | `DOMRelocator`、`ExpanderFixer`、`ChannelHoverAdapter` | 先清理旧 exact element，再绑定新元素 | 旧 disposer 不影响新目标 |
| element 已断开 | callback 与 disposer | 停止投影并释放 attachment | 不通过 selector 误清理替代元素 |
| 未触发 detached 的宿主 DOM 替换 | `PolymerPatcher` / 路由停用 | 遍历注销 `isConnected === false` 的孤儿 disposer | 防止长单页会话内存驻留泄露 |
| CE 异步升级晚于 DOM 挂载 | `PolymerPatcher` 异步 patch 完成时 | 对 DOM 中已存在匹配标签实例执行局部自愈重放 | 不遗漏冷启动期间提前挂载的元素 |
| 连续相同状态突变 | `TabviewPanelState` 属性投影 | 脏检查（Dirty Check）命中时跳过写入 | 避免无意义 DOM 写操作触发宿主样式重算 |
| cleanup 抛错 | coordinator 或 patcher 反向 cleanup | 记录后继续下一项 | teardown 尽最大努力完成 |
| Polymer method 不存在 | `PolymerPatcher` 安装 | 跳过该 hook 并报告 tag/method | 其他 hook 继续安装 |
| route 必需节点缺失 | coordinator 激活 | 保持未挂载；等待既有语义事件再次同步 | 不建立全局 fallback observer |
| feature 重复 init/destroy | coordinator 状态机 | init no-op；destroy 幂等 | 不重复 listener 或 patch |

错误日志不得依赖通用 registry id。诊断字段统一使用领域 owner、semantic kind、route generation 与 element tag，使故障信息与实际 module interface 对齐。

## 11. Implementation 结构

### 11.1 私有 attachment 记录

每个 owner 可使用 private `WeakMap<HTMLElement, Attachment>` 保存 exact-element 状态：

```ts
interface ElementAttachment {
  readonly generation: RouteGeneration;
  readonly dispose: IdempotentDisposer;
}
```

若一个元素存在多种 semantic kind，则每种 kind 使用独立 WeakMap，避免用字符串拼接生成 key。需要在 route teardown 主动遍历的 attachment 另由 owner 维护可枚举的 `Set<ElementAttachment>`；disposer 同时从 WeakMap 与 Set 移除自身。在路由停用与代际更迭时，主动检查 `isConnected === false` 的孤儿 attachment 并调用其 dispose 从 Set 中注销，杜绝宿主 DOM 替换未触发 detached 时的长会话内存驻留。

### 11.2 私有 cleanup 工具

允许在 page implementation 内使用不导出的 cleanup helper，统一幂等标记与异常隔离，但不得形成可注册任意 Observer 的新 shallow module。helper 不接受 `ObserverConfig`，不持有 selector，也不理解领域语义。

```ts
function onceDisposer(cleanup: () => void): IdempotentDisposer {
  let disposed: boolean = false;
  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    cleanup();
  };
}
```

### 11.3 Polymer 容错反向 cleanup 与自愈重放

`PolymerPatcher` 为每次成功语义 attach 记录 disposer 与创建序号：

- exact detached：执行并移除 exact element disposer。
- method restore：先逆序执行所有残余 disposer，再恢复 prototype。
- 中途安装失败：只逆序恢复已安装 method，并执行已产生 disposer。
- 异步 patch 自愈重放：对于延迟升级的 Custom Element，当 `retrieveCE` 完成 prototype hook 后，立即对当前已连接（`isConnected === true`）的该 tag 实例重放对应 attached 语义，闭合冷启动错失 attached 调用的时间窗口。
- route deactivation 淘汰：`pruneDisconnectedDisposers()` 遍历注销 `!element.isConnected` 的孤儿记录并执行其 disposer，杜绝跨路由累积 DOM 闭包强引用。
- disposer 抛错：记录后继续，不中断剩余恢复。

该机制确保 hook installation 与领域 attachment 的生命周期具有严格对称性，同时不让 `PolymerPatcher` 获得面板或展开器业务知识。

## 12. 依赖方向

目标依赖方向为：

```text
TabviewLifecycleCoordinator
  ├─→ TabviewPanelState
  ├─→ DOMRelocator
  ├─→ ExpanderFixer
  ├─→ ChannelHoverAdapter
  └─→ PolymerPatcher

PolymerPatcher
  → PolymerHelper
  → PolymerSemanticHooks（interface）

领域 owner
  → PAGE_CONSTANTS
  → 原生 Observer implementation
```

禁止以下依赖：

- `TabviewPanelState` 依赖 coordinator singleton。
- `ExpanderFixer` 或 `ChannelHoverAdapter` 依赖 `PolymerPatcher`。
- `PolymerPatcher` 依赖任何领域 owner singleton。
- `DOMRelocator` 依赖 coordinator callback 才能执行 `sweepSecondary()`。
- 任一 module 重新引入通用 Observer registry、字符串 observer id 或导出的 Observer factory。
- `TabviewPanelState`、`DOMRelocator`、`ExpanderFixer` 与 `ChannelHoverAdapter` 彼此直接依赖或串行调用。

`TabviewLifecycleCoordinator` 对五个 module 形成 fan-out。owner 之间通过 coordinator 编排或 `PolymerSemanticHooks` 的返回值协作，不形成 owner → owner 链；因此任一 owner 的 implementation 调整不会把底层观察知识传递给相邻 owner。

### 12.1 文件落位

| 文件 | 终态职责 |
| --- | --- |
| `src/features/tabview/page/panel-state.ts` | 新增 `TabviewPanelState`、callbacks、四类面板 attachment 与状态投影 implementation |
| `src/features/tabview/page/types.ts` | 放置 `RouteGeneration`、`WatchRouteContext`、`IdempotentDisposer` 与 `PolymerSemanticHooks`；删除 `ObserverConfig` 类型族 |
| `src/features/tabview/page/coordinator.ts` | 五个 module fan-out、navigation listeners、generation、READY 前启动完成通知与 teardown ordering |
| `src/features/tabview/page/polymer-patcher.ts` | hook 安装/恢复、`replayConnected()`、exact-element disposer 配对与 diagnostic |
| `src/features/tabview/page/expander-fixer.ts` | right-tabs Resize 与 comment-entry Intersection ownership |
| `src/features/tabview/page/channel-hover-adapter.ts` | metadata attachment、private upload-info 定位、Resize 与 pointer ownership |
| `src/features/tabview/page/relocator.ts` | secondary-inner Mutation ownership 与 private `sweepSecondary()` |
| `src/features/tabview/page/observer-registry.ts` | 迁移完成后删除 |
| `src/features/tabview/page/index.ts` | 执行 hooks → route owners/mount → replayConnected → READY barrier，并连接 `TabviewSession` FIFO |
| `CONTEXT.md` | 保持 `TabviewPanelState` 领域定义，并以 `ObserverRegistry` 作为 Avoid 名称 |
| `src/features/tabview/page/__tests__/panel-state.test.ts` | 面板 attachment、投影、callbacks、generation 与 disposer 测试 |
| `src/features/tabview/page/__tests__/expander-fixer.test.ts` | Resize、Intersection、active-tab 与 target replacement 测试 |
| `src/features/tabview/page/__tests__/channel-hover-adapter.test.ts` | metadata/upload-info、pointer、Resize 与 deadline 测试 |
| `src/features/tabview/page/__tests__/relocator.test.ts` | secondary-inner 范围、节点过滤、重排与 teardown 测试 |
| `src/features/tabview/page/__tests__/polymer-patcher.test.ts` | hook、replay、diagnostic 与反向 cleanup 测试 |
| `src/features/tabview/page/__tests__/coordinator.test.ts` | route generation、fan-out ordering 与异常隔离测试 |
| `src/features/tabview/__tests__/session-ownership.integration.test.ts` | 扩展第一份方案建立的联合测试，覆盖 READY FIFO、teardown/re-setup 与旧 session/generation 隔离 |
| `src/test/fake-observers.ts` | jsdom fake Mutation/Resize/Intersection Observer；仅测试代码可见 |
| `src/test/setup.ts` | 复用共享 `afterEach` 资源断言、DOM 清理与 `vi.unstubAllGlobals()` |

第 11.2 节 `onceDisposer()` pseudocode 的 owner 是产生 attachment 的领域 module 本身：它以文件内 private function 落在 `panel-state.ts`、`expander-fixer.ts`、`channel-hover-adapter.ts` 与 `polymer-patcher.ts`，不形成共享 production module，也不从 barrel export。coordinator 的容错反向 cleanup 另由 `coordinator.ts` 的 private method 持有，避免 owner 之间为了 cleanup helper 形成依赖链。

## 13. 迁移阶段

### 阶段一：建立生命周期契约

- 增加 `RouteGeneration`、`WatchRouteContext`、`IdempotentDisposer` 与 `PolymerSemanticHooks` 类型。
- 在 `TabviewLifecycleCoordinator` 建立 generation 推进、route activate/deactivate 与容错反向 cleanup 骨架。
- 为现有行为建立 characterization tests，锁定面板属性、Slot 重排、展开器与 hover 行为。

完成条件：尚未迁移 Observer 时，route generation 与 teardown ordering 已可独立测试。

### 阶段二：深化 ChannelHoverAdapter

- 将 upload-info `ResizeObserver` 从 `ObserverRegistry` 移入 `ChannelHoverAdapter`。
- 将 metadata 作为 public attachment target，在 private implementation 内定位 upload-info，并把 Resize 与 pointer listener 合并为 exact-element attachment。
- 实现 target replacement、generation gate 与幂等 disposer。
- 通过返回 disposer 的 `onMetadataAttached` 语义 hook 接入；信息镜像同步继续由 coordinator 调用既有 `InfoMirrorEngine` owner。

完成条件：`ChannelHoverAdapter` 不再依赖 `ObserverRegistry`，其 public interface 足以覆盖完整 hover 生命周期。

### 阶段三：深化 ExpanderFixer

- 将 right-tabs `ResizeObserver` 移入 `ExpanderFixer.activateRoute()`。
- 将 comment-entry `IntersectionObserver` 与 comments-active 状态移入 `ExpanderFixer`。
- 通过 `onCommentEntryAttached` 返回 exact-element disposer。
- 将 tab change caller 收敛到 `setActiveTab()`。

完成条件：展开器观察、状态与修复 implementation 位于同一 module，coordinator 不再转发底层 Observer 操作。

### 阶段四：深化 DOMRelocator

- 将 secondary-inner `MutationObserver` 移入 `DOMRelocator.mountRoute()`。
- 将新增节点过滤与 `sweepSecondary()` 设为 private implementation。
- 在 `unmountRoute()` 中先断开 Observer，再恢复 Slot。
- 保持 `childList: true`、`subtree: false` 的局部范围。

完成条件：caller 只表达 route mount/unmount，不再表达 observe + callback + sweep 三步操作。

### 阶段五：建立 TabviewPanelState

- 新建 `TabviewPanelState`，迁移 chat、playlist、comments、engagement panel Observer。
- 迁移全部相关 flexy 属性投影、初始同步与恢复逻辑。
- 为四种 semantic kind 建立独立 exact-element attachment。
- 对 engagement panel 集合实现 generation-scoped 聚合状态。
- 通过 `TabviewPanelStateCallbacks` 只向 coordinator 同步 playlist/comments 可用性，不直接依赖或调用 `TabviewSession`。

完成条件：面板状态变化只通过 `TabviewPanelState` interface 发生，其他 module 不写入其拥有的投影属性。

### 阶段六：收敛 PolymerPatcher

- 将所有直接领域 singleton 调用替换为 `PolymerSemanticHooks`。
- 为 attached/detached 建立 exact-element disposer 配对。
- 实现 `replayConnected()`，为初始已挂载 element 同步复用同一语义转发路径。
- 将异步 patch 暂缺收敛为 diagnostic，不等待未来 Custom Elements，也不阻塞 READY。
- 完成中途失败与 restore 的容错反向 cleanup。

完成条件：`PolymerPatcher` 只包含 hook discovery、安装、语义转发、disposer 配对和 prototype 恢复。

### 阶段七：收敛 Coordinator

- 将所有 navigation listener 纳入 coordinator 的 feature-scoped cleanup。
- 纳入当前未统一登记的 `animationstart` 与待触发 `DOMContentLoaded` listener。
- 固化 hooks → route owners/mount → replayConnected → READY，以及 watch deactivate 与 feature destroy 顺序。
- 连接 `TabviewSession` 的 READY 前 page event FIFO，确保观察 owner 不直接发送跨上下文 event。
- 删除对 `ObserverRegistry.activate()`、`deactivate()`、`clearAll()` 的调用。

完成条件：一次 `destroy()` 可从 coordinator interface 证明所有 page 资源均有 owner 和清理路径。

### 阶段八：清理旧 interface

- 删除 `src/features/tabview/page/observer-registry.ts`。
- 删除 `ObserverType`、`MutationObserverConfig`、`ResizeObserverConfig`、`IntersectionObserverConfig` 与 `ObserverConfig`。
- 删除全部 `ObserverRegistry` import、singleton 获取与字符串 observer id。
- 更新 barrel export、构建入口和文档引用。
- 删除 `NavigationCoordinator` alias、过渡 export、迁移期临时标记与测试专用 production entry。

完成条件：仓库中不存在 `ObserverRegistry`、`ObserverConfig`、`NavigationCoordinator` alias、过渡 export、迁移期临时标记、测试专用 production entry，也不存在功能等价的重命名 registry。

## 14. 测试方案

### 14.1 测试运行时

复用 `docs/tabview-session-architecture-deepening-plan.md` 已建立的 Vitest + jsdom、`"test": "vitest run"` 脚本与测试环境配置。本方案只增加 page 侧 fake Observer 与对应测试；测试不改变生产 interface，也不导出通用 `ObserverFactory`：

```ts
vi.stubGlobal("MutationObserver", FakeMutationObserver);
vi.stubGlobal("ResizeObserver", FakeResizeObserver);
vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
```

fake observer 需要记录：

- 构造 callback。
- `observe()` 的 exact target 与 options。
- `unobserve()` 的 exact target。
- `disconnect()` 次数。
- 手动投递 mutation、resize 与 intersection entries 的能力。

每个测试结束后恢复全局构造器并断言不存在仍活跃的 fake observer。

所有 page 测试复用 session 方案的 `src/test/setup.ts`，并采用同一共享 `afterEach` 约束：

```ts
afterEach((): void => {
  assertNoActiveFakeObservers();
  resetFakeObservers();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("tabview-loaded");
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
```

任何测试若使用 fake timer，必须在本测试内清除仍挂起的具名 one-shot timeout；共享 `afterEach` 不通过执行未知 pending task 来掩盖资源泄漏。所有 `stubGlobal` 必须由 `vi.unstubAllGlobals()` 恢复，禁止 fake Observer 泄漏到下一个 test file。

### 14.2 TabviewPanelState 单元测试

- attach chat 后立即投影当前 collapsed 状态。
- chat attribute mutation 只更新当前 generation 的 flexy。
- 属性投影脏检查：计算状态未变时不产生冗余 DOM 属性写操作，不触发无意义样式失效。
- playlist hidden/collapsed 组合正确投影展开状态。
- comments data status 与可见性正确投影禁用状态和 tab visibility。
- 多个 engagement panel 的可见集合正确聚合。
- 同一 exact element 重复 attach 只 observe 一次。
- disposer 重复调用只 disconnect 一次。
- stale disposer 不清理新 route 的同类 attachment。
- route deactivate 清除所有本 module 拥有的投影属性。
- playlist/comments 可用性变化只调用 `TabviewPanelStateCallbacks`，不直接产生 bridge 或 `TabviewSession` event。

### 14.3 ExpanderFixer 单元测试

- right-tabs 宽度不变时不调用 `fixForTabDisplay()`。
- 宽度变化时每次有效 Resize 只调用一次修复。
- target replacement 先 disconnect 旧 ResizeObserver。
- comments tab 未激活时 Intersection 不执行 Polymer 计算。
- comments tab 激活且元素相交时计算折叠能力并投影 intersected 状态。
- comment exact-element disposer 只 unobserve 自身。
- route deactivate 清理 Resize、Intersection 与 comments-active 状态。

### 14.4 ChannelHoverAdapter 单元测试

- `attachMetadata()` 只在 exact metadata 内定位 upload-info。
- attach 同时安装 Resize 与两类 pointer listener。
- metadata 不含 upload-info 时返回 no-op disposer，且不观察 document 或 body。
- pointerenter 打开有效检查窗口并设置 hover 状态。
- 有效窗口内溢出 Resize 设置 resized 状态。
- 窗口外 Resize 不产生布局写入。
- pointerleave 清理 hover 与 resized 状态。
- target replacement 与重复 disposer 保持幂等。
- route deactivate 后晚到 Resize callback 被 generation gate 拒绝。

### 14.5 DOMRelocator 单元测试

- `mountRoute()` 只观察传入的 exact secondary-inner。
- Observer options 固定为直接子节点范围。
- 忽略 wrapper、chat、anchor 与 right-tabs 等自有节点。
- 有效 related 节点新增时执行一次 `sweepSecondary()`。
- 自身重排产生的 mutation 不触发循环重排。
- `unmountRoute()` 先 disconnect，再恢复 Slot。
- stale callback 不修改新 route DOM。

### 14.6 PolymerPatcher 单元测试

- 每个 hook 只安装一次，重复 `applyPatches()` 为 no-op。
- attached 将 exact host 转为对应语义 callback。
- detached 只调用 exact host 的 disposer。
- 重复 detached 不重复 dispose。
- 孤儿 disposer 淘汰：脱离文档（`isConnected === false`）的元素在 `pruneDisconnectedDisposers()` 调用时被主动注销。
- 异步 CE 延迟升级自愈重放：提前挂载的元素当其 tag 异步完成 prototype patch 时立即触发局部 attached 重放。
- `restorePatches()` 按 attachment 与 method 的逆序 cleanup。
- 某个 disposer 抛错时其余 disposer 和 prototype 仍恢复。
- method 缺失不阻断其他 hook 安装。
- 部分安装失败时不留下半 patched prototype。
- `replayConnected()` 只重放调用时已经连接的 element，并复用 attached 的语义 interface。
- 尚未完成的异步 patch 只产生 diagnostic，不阻塞 replay 或 READY。

### 14.7 Coordinator 集成测试

- 并发或重复 `init()` 只安装一组 navigation listeners 与 Polymer patches。
- watch → watch 推进 generation，旧 callback 不影响新页面。
- watch → shorts/home 完整停用 route-scoped owner。
- 非 watch → watch 按既定顺序激活五个 module。
- feature `destroy()` 先停止 navigation，再执行 route teardown 和 patch restore。
- 任一 cleanup 抛错时后续 owner 仍被销毁。
- 节点暂缺时不创建 body fallback observer，后续 Polymer 语义事件仍能完成挂载。
- 销毁后 navigation event 不再触发 mount。
- 启动顺序严格为 hooks → route owners/mount → replayConnected → READY。

### 14.8 Session 与观察联合集成测试

- READY 前由 page 产生的 tab/font-size event 按产生顺序进入 FIFO，并在 READY 后依序 flush。
- `replayConnected()` 产生的 page event 不越过更早进入 FIFO 的 event。
- READY 只发送一次，发生在 replay 完成之后与 FIFO flush 之前。
- sandbox teardown 驱动 page session 先完成 coordinator/owner cleanup，再关闭 channel。
- teardown 过程中产生的 Observer callback 与 page event 均被 generation/session state 拒绝。
- setup → teardown → setup 创建新 session 与新 route generation；旧 disposer、旧 fake observer callback 和旧 session event 均不能影响新实例。
- teardown cleanup 中一个 owner 抛错时，其余 owner、Polymer patch 与 channel 仍完成关闭；下一次 setup 不继承残余资源。

## 15. 验收矩阵

| 验收维度 | 场景 | 通过标准 | 自动化证据 |
| --- | --- | --- | --- |
| ownership | 扫描全部 Observer 构造点 | 每个构造点只位于表中唯一 owner | 静态搜索 + module 单测 |
| interface depth | coordinator 挂载 watch route | caller 不出现原生 Observer 操作 | TypeScript interface 审查 |
| locality | 修改 playlist 投影规则 | 只需修改 `TabviewPanelState` 及其测试 | 变更面审查 |
| route isolation | watch A → watch B | A generation 的 callback 对 B 无写入 | fake observer 集成测试 |
| route teardown | watch → home | route-scoped fake observer 活跃数为 0 | Vitest 资源断言 |
| feature teardown | 启用 → 销毁 → 再启用 | listener、patch、attachment 均无重复 | Coordinator 集成测试 |
| exact element | old element 被新 element 替换 | old disposer 不影响新 attachment | owner 单元测试 |
| 容错恢复 | 中间 disposer 抛错 | 后续 cleanup 与 prototype restore 完成 | Patcher/Coordinator 异常测试 |
| 面板状态 | chat/playlist/comments/engagement 状态变化 | flexy 属性与当前 DOM 状态一致 | `TabviewPanelState` 参数化测试 |
| DOM 写入纯度 | 相同状态连续突变 | 脏检查生效，flexy 属性冗余写操作次数为 0 | `TabviewPanelState` Spy 测试 |
| CE 自愈重放 | 元素挂载后 CE 原型异步完成 patch | 自动触发局部 attached 语义重放并生成有效 attachment | `PolymerPatcher` 异步测试 |
| 展开器 | right-tabs resize 与 comment intersection | 仅满足领域条件时触发修复 | `ExpanderFixer` fake observer 测试 |
| hover | pointer 与 Resize 交错 | 只在有效窗口投影溢出状态 | `ChannelHoverAdapter` 时钟测试 |
| Slot 重排 | secondary-inner 直接子节点新增 | 单次 sweep，无自触发风暴 | `DOMRelocator` mutation 测试 |
| READY barrier | page session 启动 | hooks → route owners/mount → replayConnected → READY，pre-READY event 随后 FIFO flush | session/observer 联合集成测试 |
| session isolation | teardown → re-setup | 旧 session event、generation callback 与 disposer 均不能进入新实例 | session/observer 联合集成测试 |
| 长会话内存释放 | 宿主 DOM 替换未触发 detached | `isConnected === false` 的孤儿 disposer 被主动注销，无引用残留 | Coordinator / Patcher 内存测试 |
| ADR-0003 | 页面静止 | 无 `setInterval`、递归 timeout、级联延时或常驻任务；具名可取消 one-shot timeout 在 teardown 清零 | fake timer + 静态搜索 |
| ADR-0005 | 工具栏与 Tabview 同时启用 | 不新增 body observer，不侵占 `SlotMountBus` | Observer target 断言 |
| clean final state | 全仓静态检查 | 无 `NavigationCoordinator` alias、过渡 export、迁移期临时标记或测试专用 production entry | `rg` + barrel/入口审查 |
| 类型安全 | `pnpm check` | 严格模式零错误、无隐式 `any` | CI 命令 |
| 构建 | `pnpm build` | page sub-bundle 与 userscript 构建成功 | CI 命令 |

## 16. 交付验收命令

```bash
pnpm check
pnpm test
pnpm build
```

生产构建通过后，在 Tampermonkey 或 Violentmonkey 中执行以下端到端路径：

1. 普通详情页 → 带播放列表详情页 → 普通详情页。
2. 详情页 → Shorts → 首页 → 详情页。
3. 打开和折叠直播聊天、播放列表与互动面板。
4. 切换 comments/info/videos/playlist tab 并调整窗口宽度。
5. 触发频道信息 hover，验证文本溢出状态恢复。
6. 功能关闭后再次开启，确认没有重复 hook、重复 listener 或遗留布局属性。

## 17. 完成定义

满足以下条件时，本架构深化完成：

- `ObserverRegistry` 与 `ObserverConfig` 已移除，且没有等价的通用 registry 替代物。
- 五个领域 module 的 ownership 与第 5 节完全一致。
- `PolymerPatcher` 只保留 hook adapter 职责和 disposer 配对。
- `PolymerPatcher.replayConnected()` 与 page session READY barrier 保持 hooks → route owners/mount → replayConnected → READY 顺序，pre-READY page event 随后 FIFO 交付。
- `TabviewPanelStateCallbacks` 只通知 coordinator，任何观察 owner 均不直接发送跨上下文 event。
- `TabviewPanelState` 对 flexy 的属性投影具备脏检查（Dirty Check），无冗余 DOM 写操作。
- `PolymerPatcher` 具备异步 CE 延迟升级自愈重放能力，且在路由注销时淘汰脱离文档的孤儿 disposer，长单页会话无 DOM 闭包泄漏。
- 所有 attachment 都具有 exact-element、generation-scoped、幂等 cleanup。
- route 与 feature teardown 按第 9 节顺序执行，并可在 cleanup 异常时继续。
- Vitest + jsdom fake observer 测试覆盖第 14 节场景。
- ADR-0003 的纯事件驱动与 ADR-0005 的单一聚合挂载总线约束保持成立。
- `NavigationCoordinator` alias、过渡 export、迁移期临时标记与测试专用 production entry 已清理，测试只从正式 production interface 导入。
- `pnpm check`、`pnpm test` 与 `pnpm build` 全部通过。
