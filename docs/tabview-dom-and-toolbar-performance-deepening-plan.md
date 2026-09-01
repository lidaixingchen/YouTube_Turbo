# YouTube Turbo – Tabview 详情页去轮询、DOM 响应式句柄缓存与多插槽聚合挂载架构深化方案 (Tabview, Reactive DOM Registry & Toolbar Slot Bus Deepening Plan)

本方案基于 **Codebase Design** 哲学（深模块、清晰缝隙、局部性、删除测试、单一测试面与零空闲开销），针对架构评估中识别出的 **Candidate 3（Tabview 详情页去轮询与事件驱动生命周期）**、**Candidate 4（底层 DOM 适配器响应式句柄缓存与全局零轮询）** 与 **Candidate 5（工具栏多插槽挂载器路由感知聚合总线）** 制定具体的深化设计与实施规范。

---

## 1. 架构目标与设计原则

- **全工程彻底根除常驻轮询（Global Zero-Polling & Zero Idle CPU）**：
  - 废除 `NavigationCoordinator` 内部每秒执行一次的 `startGuardian` 定时器与级联延时重试数组（`[100, 300, 800, 1500ms]`）；
  - 废除 `dom-adapter.ts` 中的 `commonUtil.waitForElementByInterval` 及其 50ms 轮询定时器，在 `PlayerController` 等核心模块全面转向事件驱动的 Promise 就绪机制；
  - 详情页所有 DOM 迁移、播放列表标签切换、评论计数同步、描述镜像与链接评论置顶完全由 Polymer Custom Elements 原型拦截（`PolymerPatcher`）与 `ObserverRegistry` 响应式总线驱动。
- **底层 DOM 节点访问常数时间化（$O(1)$ Reactive DOM Handle Caching）**：
  - 将无状态的薄封装 `YouTubeDOMAdapter` 升级为具备路由感知、连接性校验与事件就绪通知的深模块 `ReactiveDOMRegistry`；
  - 对 `<video>`、播放器容器与标题等核心节点的访问由全文档选择器扫描降级为 $O(1)$ 内存引用命中，并随 SPA 切页自动失效与按需重绑定。
- **异步数据流的一次性精准捕获（One-Shot Scoped Observers）**：
  - 针对评论区链接置顶（`?lc=...`）与后置元数据（`extra-content`）等异步流，采用局部微观监听器（One-Shot Scoped Observer），在数据到达并完成处理后**立即断开**，杜绝任何常驻监听与轮询。
- **多插槽挂载路由感知与静态直通（Route-Aware Fast-Path Slot Bus）**：
  - 将原本每个未决插槽各自在 `document.body` 注册独立 `MutationObserver` 的离散模式，重构为全局单实例 `SlotMountBus`；
  - 引入插槽路由断言（`isApplicable`）与静态快道（Static Fast-Path），在 90%+ 导航场景下以同步 DOM 命中直接挂载，免于启动 Observer；未决场景在局部容器监听并在全部就绪或超时后即刻停机。
- **深模块封装与最小外部表面（Deep Module Encapsulation）**：
  - 内部复杂的状态机、WeakRef 缓存、生命周期钩子接入与批处理分发完全封装在各深模块之后，对外暴露清晰且稳定的极简接口（Leverage 最大化）。

---

## 2. 领域模型与目录拓扑

### 2.1 核心领域模型术语

- **`TabviewLifecycleCoordinator`**：详情页纯事件驱动生命周期统管深模块，统筹协调 `PolymerPatcher`、`DOMRelocator`、`ExpanderFixer` 与 `InfoMirrorEngine`，实现无定时器的即时重排与自愈。
- **`ReactiveDOMRegistry`**：DOM 核心句柄缓存与响应式就绪深模块，持有高频核心元素（播放器容器、视频节点、元数据标题等）的高速引用，提供常数时间读取与异步事件就绪接口，与 `yt-navigate-finish` 路由生命周期对齐自动失效。
- **`SlotMountBus`**：多插槽路由感知聚合挂载总线，管理全站所有工具栏插槽（播放器控制栏、Shorts 动作栏、视频信息栏等），具备静态探测快道与就绪即停机的调度能力。
- **`LinkedCommentSupervisor`**：链接评论一次性监视器，针对带 `?lc=` 参数的异步评论流进行局部靶向监听，置顶交换完成后即刻销毁。
- **`SecondaryMutationGuard`**：推荐区局部拓扑监视器，对 `#secondary-inner` 顶层节点变动进行窄域监听，取代全局扫描。

### 2.2 目标目录结构拓扑

```
src/
├── core/
│   ├── dom-adapter.ts             # 统一导出 ReactiveDOMRegistry / commonUtil
│   ├── dom-registry.ts            # ReactiveDOMRegistry (深模块：句柄缓存、路由失效与就绪通知)
│   ├── bridge.ts                  # RuntimeBridge 跨上下文桥梁
│   ├── shortcuts.ts               # ShortcutDispatcher 快捷键调度器
│   ├── style-engine.ts            # StyleEngine 样式注入单例
│   └── constants.ts               # 全局常量
├── features/
│   ├── player/
│   │   ├── controller.ts          # PlayerController (全面接入 ReactiveDOMRegistry.waitForVideoElement)
│   │   └── ...
│   └── tabview/
│       ├── index.ts               # 沙箱端入口
│       └── page/
│           ├── coordinator.ts     # TabviewLifecycleCoordinator (纯事件驱动无定时器协调器)
│           ├── relocator.ts       # DOMRelocator (Slot 声明式迁移与 Linked Comment 拓扑调整)
│           ├── expander-fixer.ts  # ExpanderFixer (展开器原型计算与评论计数)
│           ├── observer-registry.ts # ObserverRegistry (统管观察者总线与 Scoped Guard)
│           ├── polymer-patcher.ts # PolymerPatcher (Custom Elements 原型拦截)
│           └── info-mirror-engine.ts # InfoMirrorEngine (描述镜像与 extra-content 响应式同步)
└── ui/
    └── toolbar/
        ├── index.ts               # 统一导出 Toolbar
        ├── toolbar.ts             # Toolbar 主控制器
        ├── reactive-mounter.ts    # SlotMountBus (路由感知单实例聚合挂载总线)
        ├── action-registry.ts     # ActionRegistry (动作注册表)
        └── popover.ts             # PopoverEngine (浮层定位)
```

---

## 3. Candidate 3：Tabview 详情页去轮询与事件驱动生命周期方案

### 3.1 架构设计与事件流

```
[ YouTube Custom Elements Lifecycle ]
  │
  ├──► ytd-watch-next-secondary-results attached  ──► DOMRelocator.tryRelocateSlot("videos")
  ├──► ytd-comments attached                      ──► DOMRelocator.tryRelocateSlot("comments")
  │                                                     └─ If has ?lc: Start LinkedCommentSupervisor (One-Shot)
  ├──► ytd-comments-header-renderer dataChanged   ──► ExpanderFixer.updateCommentsCounter()
  ├──► ytd-playlist-panel attached / attrChanged  ──► ObserverRegistry.updatePlaylistStatus()
  └──► ytd-watch-metadata attached                ──► InfoMirrorEngine.syncMainDescriptionData()
                                                        └─ Observe #extra-content childList (Scoped)

[ SPA Route Events ]
  │
  └──► yt-navigate-finish ──► TabviewLifecycleCoordinator.handleRouteChange()
                                ├─ Single-pass slot mount & one-shot layout alignment
                                ├─ DOMRelocator.checkAndHandleLinkedComment()
                                └─ ReactiveDOMRegistry.invalidateCache()
```

### 3.2 彻底移除 1000ms Guardian Timer 与延时重试队列

1. **废除 `startGuardian` 定时器**：
   - 彻底删除 `this.guardianTimer = setInterval(...)`；
   - 消除页面停留期间每秒重复触发的 `sweepSecondary()`、`updatePlaylistTabVisibility()`、`updateCommentsCounter()` 与 `checkAndHandleLinkedComment()`；
2. **废除级联延时队列**：
   - 移除 `RETRY_DELAYS: [100, 300, 800, 1500]` 中的 `setTimeout` 循环；
   - 由 `patchWatchMetadata`、`patchExpandableDescription` 与 `extra-content` 局部观察者进行精准的响应式数据同步。

### 3.3 异步评论流（`?lc=...`）一次性挂载监视器（One-Shot Scoped Observer）

当用户访问包含 `?lc=XXXX` 链接时，评论内容为异步网络加载。为确保零轮询且 100% 捕获目标评论：

1. **触发时机**：在 `handleRouteChange()` 及 `ytd-comments` 元素原型 `attached` 时，若 URL 包含 `lc` 参数，启动监视；
2. **靶向范围**：仅在 `ytd-comments #contents` 容器上挂载 `childList: true, subtree: true` 的局部 `MutationObserver`；
3. **即时停机**：
   - 每次有新评论节点插入时执行 `findLcComment(targetLc)`；
   - 一旦匹配到目标评论并成功执行 `lcSwapFuncA`，**立即调用 `observer.disconnect()`** 并清理引用；
   - 设置 8000ms 兜底安全定时器，若超时未加载（如网络错误或评论已被删除）自动断开，确保无常驻开销。

### 3.4 推荐列表局部拓扑守护（Secondary Mutation Guard）与 Extra-Content 同步

1. **推荐区局部拓扑守护**：
   - 废除轮询扫描 `sweepSecondary()`；
   - 在 `#secondary-inner` 上挂载仅限第一层子节点（`childList: true, subtree: false`）的微观察者；
   - 仅当 YouTube 动态插入未知推荐板块或广告容器时触发单次插槽规整，无变动时 0 开销。
2. **Extra-Content 响应式同步**：
   - 在 `ytd-watch-metadata` 下的 `#extra-content` 容器挂载局部 `childList` 监听；
   - 新增拓展内容（章节、音乐来源、卡片）时直接调用 `InfoMirrorEngine.runInfoFix()`，彻底淘汰 `RETRY_DELAYS`。

### 3.5 模块接口定义规范

```typescript
export class TabviewLifecycleCoordinator {
  private static instance: TabviewLifecycleCoordinator | null = null;
  
  public static getInstance(): TabviewLifecycleCoordinator;
  
  /**
   * 初始化详情页生命周期调度（应用 Polymer 原型补丁并监听路由事件）
   */
  public init(initialLocale: LocaleSnapshot, callbacks?: TabviewCallbacks): void;
  
  /**
   * 响应路由变更事件，执行确定性的单遍挂载与插槽重排
   */
  public handleRouteChange(): void;
  
  /**
   * 激活指定标签页并自适应修正展开器高度
   */
  public setActiveTab(tabKey: TabKey): void;
  
  /**
   * 销毁并复原所有 DOM 占位与原型补丁（0 遗留副作用）
   */
  public destroy(): void;
}
```

---

## 4. Candidate 4：DOM 适配器响应式深模块化与全局零轮询方案

### 4.1 架构设计与缓存策略

```
┌────────────────────────────────────────────────────────────────────────┐
│ Deep Module: ReactiveDOMRegistry                                       │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Node Cache Store                                                 │  │
│  │  • videoElement: WeakRef<HTMLVideoElement> | null                │  │
│  │  • playerContainer: WeakRef<HTMLElement> | null                  │  │
│  │  • videoTitleElement: WeakRef<HTMLElement> | null                │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │                                   │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │ Cache Verification & Access Gate (O(1))                          │  │
│  │  1. Check if ref.deref() is non-null & isConnected === true     │  │
│  │  2. If VALID: Return cached node instantly (0 queries)            │  │
│  │  3. If INVALID: Execute fallback querySelector & update cache   │  │
│  └─────────────────────────────────▲────────────────────────────────┘  │
│                                    │                                   │
│  ┌─────────────────────────────────┴────────────────────────────────┐  │
│  │ Reactive Readiness Gate (waitForVideoElement)                    │  │
│  │  • Fast path: Return immediately if video cached & connected     │  │
│  │  • Slow path: Scoped MutationObserver on player container       │  │
│  │  • Auto-resolve & disconnect on video arrival (No setInterval)   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 $O(1)$ 核心节点读取与 WeakRef 管理

1. **缓存字段**：
   - `video`: 匹配 `#movie_player video, video.video-stream, video`；
   - `playerContainer`: 匹配 `#movie_player, #player-container-outer .html5-video-player`；
   - `videoTitle`: 匹配 `h1.title.ytd-video-primary-info-renderer, h1.ytd-watch-metadata, #title h1`。
2. **访问流水线**：
   - 读取时首先尝试 `this.videoRef?.deref()`；
   - 若实例存在且 `node.isConnected`，直接返回该节点（耗时 < 0.01ms）；
   - 若节点不存在或已被销毁（`!node.isConnected`），执行快速选择器查询并包装存入 `WeakRef`。

### 4.3 彻底拔除 `commonUtil.waitForElementByInterval` 轮询

1. **废除轮询定时器**：
   - 彻底删除 `commonUtil.waitForElementByInterval` 中的 `setInterval(..., 50)`；
2. **提供事件驱动的 `waitForVideoElement`**：
   - 在 `ReactiveDOMRegistry` 中实现基于 Promise + 局部 `MutationObserver` 的 `waitForVideoElement(timeoutMs)`；
   - 命中后立即 `observer.disconnect()` 并 resolve；
3. **改造 `PlayerController`**：
   - 将 `PlayerController.syncVideoOnNavigate()` 重构为直接 `await ReactiveDOMRegistry.getInstance().waitForVideoElement()`；
   - 实现整个播放器初始化与路由切换过程的 **0 定时器化**。

### 4.4 模块接口定义规范

```typescript
export class ReactiveDOMRegistry {
  private static instance: ReactiveDOMRegistry | null = null;
  
  public static getInstance(): ReactiveDOMRegistry;
  
  /**
   * 获取当前播放视频节点（O(1) 缓存命中）
   */
  public getVideoElement(): HTMLVideoElement | null;
  
  /**
   * 响应式等待视频节点就绪（事件驱动，0 轮询）
   */
  public waitForVideoElement(timeoutMs?: number): Promise<HTMLVideoElement | null>;
  
  /**
   * 获取播放器主容器（O(1) 缓存命中）
   */
  public getPlayerContainer(): HTMLElement | null;
  
  /**
   * 获取当前视频标题文本（直接读取缓存节点的 textContent）
   */
  public getVideoTitle(): string;
  
  /**
   * 获取物理分辨率
   */
  public getVideoResolution(): VideoResolution;
  
  /**
   * 路由切页时重置句柄缓存
   */
  public invalidateCache(): void;
}
```

---

## 5. Candidate 5：工具栏多插槽挂载器单总线聚合方案

### 5.1 架构设计与路由感知模型

```
                     [ Registered Slots: Player / Shorts / Metadata ]
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ Deep Module: SlotMountBus                                                     │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Route Filter Gate (isApplicable)                                     │  │
│  │  • URL matches /watch  ──► Select Player & Metadata Slots only          │  │
│  │  • URL matches /shorts ──► Select Shorts Actions Slot only              │  │
│  └─────────────────────────────────┬───────────────────────────────────────┘  │
│                                    │                                          │
│  ┌─────────────────────────────────▼───────────────────────────────────────┐  │
│  │ 2. Static Fast-Path Probe (Sync Execution)                              │  │
│  │  • Test document.querySelector for all active slots                     │  │
│  │  • If ALL hit: Mount directly, Bus stays in Dormant (0 Observers)       │  │
│  └─────────────────────────────────┬───────────────────────────────────────┘  │
│                                    │                                          │
│  ┌─────────────────────────────────▼───────────────────────────────────────┐  │
│  │ 3. Single-Instance Scoped Mutation Observer (Active only if pending > 0) │  │
│  │  • Watches route container (e.g. ytd-watch-flexy / ytd-shorts)          │  │
│  │  • Single microtask batch check across pending slots                    │  │
│  │  • All mounted OR Safety Timeout (4000ms) ──► observer.disconnect()     │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 路由感知与静态直通快道（Static Fast-Path）

1. **插槽定义增加路由断言**：
   ```typescript
   export interface SlotDefinition {
     slotKey: string;
     containerSelector: string;
     targetSelector: string;
     elementId: string;
     isApplicable: (url: URL) => boolean;
     mount: (target: HTMLElement, element: HTMLElement) => void;
   }
   ```
2. **静态直通快道**：
   - 在 `yt-navigate-finish` 触发时，首先根据 `location.href` 筛选当前页面适用的插槽集合；
   - 立即执行同步静态 DOM 查询；若全部命中（SPA 切页时 90% 以上情况），直接同步完成挂载；
   - `SlotMountBus` 内部的 `MutationObserver` **完全不需要启动**。

### 5.3 局部容器聚焦与就绪停机

1. **单观察者收敛与局部挂载**：
   - 仅当静态快道存在未决插槽时，启动 **1 个** 观察器；
   - 观察目标收敛在当前页面的主容器（如 `ytd-watch-flexy` 或 `ytd-shorts`），杜绝全文档 `document.body` 宽泛监听。
2. **单遍扫描与即刻停机**：
   - 每次 MutationRecord 批次到达时，批量扫描未决插槽；
   - 匹配成功的 Slot 挂载后从 `pendingSlots` 中移除；
   - 当 `pendingSlots.size === 0` 时，立即调用 `observer.disconnect()`；
   - 内置 4000ms 安全超时器（Safety Timeout），超时后强制断开观察器，彻底杜绝僵尸 Observer。

### 5.4 模块接口定义规范

```typescript
export class SlotMountBus {
  private static instance: SlotMountBus | null = null;
  
  public static getInstance(): SlotMountBus;
  
  /**
   * 注册并请求挂载指定插槽
   */
  public mountSlot(definition: SlotDefinition, renderer: () => HTMLElement | null): void;
  
  /**
   * 卸载指定插槽并清理 DOM
   */
  public unmountSlot(slotKey: string): void;
  
  /**
   * 路由切换时重新扫描当前适用插槽（优先走静态快道）
   */
  public refreshAll(): void;
  
  /**
   * 彻底销毁总线与所有观察者
   */
  public destroy(): void;
}
```

---

## 6. 破坏面分析与实施阶段规划 (Impact Analysis & Staged Rollout)

### 6.1 破坏面分析 (Blast Radius)

- **`core/dom-adapter.ts` & `core/dom-registry.ts`**：
  - `YouTubeDOMAdapter` 升级为 `ReactiveDOMRegistry`，现有对外方法（`getVideoElement`、`getCurrentTime`、`getDuration` 等）签名保持 100% 兼容；
  - 彻底废除 `commonUtil.waitForElementByInterval`，上层模块全面迁移至 `waitForVideoElement`。
- **`features/player/controller.ts`**：
  - 将 `syncVideoOnNavigate` 中的轮询逻辑替换为 `ReactiveDOMRegistry.getInstance().waitForVideoElement()`，消除播放器核心定时器。
- **`features/tabview`**：
  - 彻底移除 `startGuardian` 定时器与重试数组；
  - 接入 `LinkedCommentSupervisor` 与 `SecondaryMutationGuard`，Tabview 体验与数据绑定更为确定。
- **`ui/toolbar`**：
  - `ReactiveMounter` 升级为 `SlotMountBus`，对外 `Toolbar.registerAction()` 与 `Toolbar.mount()` 接口保持不变。

### 6.2 实施四步走计划

1. **Phase 1: 底层 DOM 句柄缓存与响应式就绪 (`core/dom-adapter.ts` & `core/dom-registry.ts`)**
   - 实现 `ReactiveDOMRegistry`，接入 WeakRef 缓存、$O(1)$ 读取与 `waitForVideoElement()`；
   - 改造 `PlayerController.syncVideoOnNavigate` 彻底移除 `commonUtil.waitForElementByInterval`；
   - 验证：$O(1)$ 节点快速检索，切歌无死引用，播放器无 `setInterval`。
2. **Phase 2: 工具栏多插槽挂载总线路由感知聚合 (`ui/toolbar/reactive-mounter.ts`)**
   - 重构 `ReactiveMounter` 为 `SlotMountBus`，接入路由断言、静态直通快道与安全停机机制；
   - 验证：Watch 与 Shorts 切页时无 Observer 常驻，静态命中率 > 90%。
3. **Phase 3: 详情页去轮询与事件驱动改造 (`features/tabview/page/coordinator.ts` & `observer-registry.ts`)**
   - 彻底删除 `startGuardian` 1000ms 定时器与 4 重延时数组；
   - 接入 `LinkedCommentSupervisor`（One-Shot Scoped Observer）与 `SecondaryMutationGuard`；
   - 验证：Watch 页面空闲停留时 CPU 占用绝对为 0%，带 `?lc=` 链接评论 100% 正常置顶。
4. **Phase 4: 严格类型检查与端到端构建验证**
   - 运行 `pnpm run check` 确保 0 报错；
   - 运行 `pnpm run build` 生成生产产物并验证完整体验。

---

## 7. 验证方案与性能基准指标

### 7.1 自动化测试与类型检查

```powershell
# 1. 严格模式类型检查
pnpm run check

# 2. 生产打包构建
pnpm run build
```

### 7.2 性能基准指标验证 (Performance Benchmarks)

| 测试项 | 重构前基准 (Before) | 目标指标 (Target After) | 验证手段 |
|---|---|---|---|
| **全库活跃 `setInterval` 数量** | 2 处常驻/半常驻（Guardian 1000ms + waitForElement 50ms） | **0 处**（完全无任何 setInterval） | 全局代码静态扫描 + DevTools Console 定时器打桩 |
| **工具栏活跃 MutationObserver 数量** | 3 个以上并行监听 document.body | **0 个**（静态直通命中或就绪即断开） | DevTools Console Observer 实例追踪 |
| **`?lc=...` 评论置顶成功率** | 依赖 1000ms 轮询捕获 | **100% 确定性捕获**（Scoped One-Shot） | 携带真实 `?lc=` 链接自动化导航测试 |
| **高频 DOM 选择器查询耗时** | 每次调用 ~0.2 - 0.8ms (全树匹配) | **< 0.01ms** ($O(1)$ 缓存命中) | `console.time("DOMQuery")` 性能测量 |
| **切歌后主线程空闲延迟** | 需等待 1500ms 重试队列完成 | **< 50ms**（单遍挂载即刻就绪） | Performance 面板 Long Tasks 测量 |
| **页面空闲停留时 CPU 占用** | 周期性尖峰唤醒 | **绝对 0%（Zero Idle CPU）** | Windows 任务管理器 / Chrome Task Manager |
