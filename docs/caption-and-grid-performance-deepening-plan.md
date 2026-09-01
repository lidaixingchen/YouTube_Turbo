# YouTube Turbo – 字幕渲染管线与网格监听边界性能深化方案 (Caption & Grid Performance Deepening Plan)

本方案基于 **Codebase Design** 哲学（深模块、清晰缝隙、局部性、删除测试、单一测试面与零空闲开销），针对架构评估中识别出的 **Candidate 1（字幕引擎渲染管线性能重构）** 与 **Candidate 2（4 列网格监听边界与响应式收敛）** 制定具体的深化设计与实施规范。

---

## 1. 架构目标与设计原则

- **深模块封装与最小外部表面（Deep Module Encapsulation）**：
  将字幕渲染帧同步、Native CC 互斥判定、DOM 句柄缓存、网格突变静默拦截与纯 CSS 媒体查询响应等内部机制完全封装在深模块内部。外部调用者（如 `FeatureRegistry`）仅通过极简的 `setup()` / `teardown()` 接口进行控制（Leverage 最大化）。
- **零空闲运行时开销（Zero Idle Overhead Principle）**：
  彻底根除无条件的盲轮询循环与全局 `document.body` 广谱 MutationObserver。在非活动状态（视频暂停、无字幕、网格未挂载）下，相关子系统的 CPU 占用与微任务触发彻底收敛为 **0%**。
- **动静分离双轨制（Dual-Track Caption Architecture）**：
  - **静轨（Static Track）**：全局基准偏移（`globalDefaultOffsetMs`）100% 在网络拦截层（`TimedTextInterceptor`）注入，由 YouTube 原生字幕引擎以 0 运行时开销、原生样式与动画直接渲染。
  - **动轨（Dynamic Track）**：仅在用户于当前视频进行临时热调（`sessionOffsetMs !== 0`）时，按需激活覆盖层渲染（`CaptionOverlayRenderer`）并接管展示。
- **关注点分离与原生媒体查询驱动（Separation of Concerns & MediaQueryList Driven）**：
  将断点列数计算彻底归还给浏览器原生 CSS `@media` 规则与 Blink 排版引擎；DOM 重排调度使用 `window.matchMedia` 事件驱动，消除对 `window.resize` 的高频监听与 JS 频繁写入内联样式引发的 Layout Thrashing。
- **突变边界与自回火防御（Scoped Mutation Boundary & Silence Lock）**：
  建立靶向作用域监听（`ScopedGridObserver`），并在 DOM 重排期间引入原子静默锁，杜绝脚本自身的 DOM 操作引发突变风暴。

---

## 2. 领域模型与目录拓扑

### 2.1 核心领域模型术语

- **`CaptionController`**：字幕子系统统管深模块，统领网络拦截（`TimedTextInterceptor`）、纯计算时间轴（`SubtitleTimeline`）与覆盖层渲染（`CaptionOverlayRenderer`）全生命周期，协调静轨与动轨状态分流。
- **`CaptionOverlayRenderer`**：字幕覆盖层渲染深模块，基于按需激活渲染闸门驱动，负责原生字幕互斥隐藏与当前帧 Cue 文本精准绘制。
- **`ReactiveRenderGate`**：按需渲染闸门机制，仅在媒体播放且当前会话存在微调偏移（`sessionOffsetMs !== 0`）时启动渲染循环，暂停、复位或空闲态即刻停止。
- **`GridCoordinator`**：首页与订阅页 4 列网格自适应统管深模块，统管两阶段局部容器挂载、行布局指令重排与 `matchMedia` 断点事件自适应。
- **`ScopedGridObserver`**：仅针对 `ytd-rich-grid-renderer > #contents` 直接子容器的靶向突变观察器，在 DOM 节点重排期间具备自防护静默能力。

### 2.2 目标目录结构拓扑

```
src/
├── features/
│   ├── caption/
│   │   ├── index.ts               # 统一导出 CaptionController
│   │   ├── controller.ts          # CaptionController (深模块外观，状态机与动静双轨调度)
│   │   ├── interceptor.ts         # TimedTextInterceptor (Fetch/XHR 网络拦截与音轨感知)
│   │   ├── timeline.ts            # SubtitleTimeline (纯计算：解析、二分检索与时间偏移)
│   │   ├── renderer.ts            # CaptionOverlayRenderer (按需覆盖层渲染与 StyleEngine 接入)
│   │   ├── constants.ts           # 常量定义
│   │   └── types.ts               # 类型契约
│   └── grid/
│       ├── index.ts               # 统一导出 GridCoordinator
│       ├── coordinator.ts         # GridCoordinator (网格统管深模块，matchMedia 驱动与两阶段挂载)
│       ├── scoped-observer.ts     # ScopedGridObserver (靶向监听与静默锁)
│       ├── calculator.ts          # GridCalculator (纯计算：行重排规划算法)
│       ├── constants.ts           # 响应式断点与常量
│       └── types.ts               # 网格类型定义
```

---

## 3. Candidate 1：字幕渲染管线与动静分离双轨引擎

### 3.1 架构设计与动静双轨数据流

```
[ User Action / Configuration ]
           │
           ├─► [ Global Default Offset ] ──► TimedTextInterceptor (Fetch/XHR 静态注入)
           │                                             │
           │                                             ▼
           │                             ┌──────────────────────────────────┐
           │                             │ YouTube 原生字幕引擎 (Native CC)  │
           │                             │ • CPU 占用: 0.0%                 │
           │                             │ • 原生字体/换行/动画/多语言适配   │
           │                             └──────────────────────────────────┘
           │
           └─► [ Session Offset (Alt+[/Alt+]) ]
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Deep Module: CaptionOverlayRenderer                                    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ReactiveRenderGate (Activation Predicate)                        │  │
│  │  • isPlaying: !video.paused && !video.ended                     │  │
│  │  • isCCOn: Subtitle button active / CC enabled                   │  │
│  │  • hasSessionOffset: sessionOffsetMs !== 0                       │  │
│  │  => Condition: isPlaying && isCCOn && hasSessionOffset           │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │                                   │
│                  ┌─────────────────┴─────────────────┐                 │
│                  ▼ (True)                            ▼ (False)         │
│  ┌───────────────────────────────┐     ┌────────────────────────────┐  │
│  │ Active Dynamic Render Loop    │     │ Inactive / Sleep State     │  │
│  │  • Hide native captions       │     │  • Restore native captions │  │
│  │  • Sync video.currentTime     │     │  • Stop rAF / Clear text   │  │
│  │  • Render active cues         │     │  • CPU usage: 0%           │  │
│  └───────────────────────────────┘     └────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 静轨机制（Static Track）
- 当 `sessionOffsetMs === 0` 时，无论 `globalDefaultOffsetMs` 为何值，`TimedTextInterceptor` 已在网络协议层将偏移注入到字幕文件（JSON3 / XML）。
- YouTube 播放器内部拿到的是已调整时间轴的数据，直接由 YouTube 原生字幕引擎渲染。
- `CaptionOverlayRenderer` 保持非激活状态，不创建多余的 DOM 刷新循环，实现日常播放 0 额外 CPU 开销。

### 3.3 动轨机制（Dynamic Track）与渲染闸门（`ReactiveRenderGate`）
- 当用户在视频播放过程中按下 `Alt+[` / `Alt+]` 微调字幕时（`sessionOffsetMs !== 0`），网络数据已加载完毕无法回溯修改，此时激活覆盖层渲染器：
  1. 隐藏原生字幕 DOM（`.yt-turbo-native-captions-hidden`）；
  2. 启动按需渲染循环，通过 `SubtitleTimeline.findActiveCues(currentTime - effectiveOffsetMs)` 精准计算当前字幕；
  3. 当视频暂停（`pause`）、结束（`ended`）或用户复位（`Alt+\`）时，立即停止渲染循环并复原。

### 3.4 多语言与音轨切换感知（Track Switch & Ingestion）
- `TimedTextInterceptor` 拦截新的 `timedtext` 请求时，提取唯一标识键 `${videoId}_${lang}_${tlang}`；
- 解析成功后调用 `SubtitleTimeline.getInstance().ingest(key, rawText)`，并同步更新活跃音轨键（`currentKey`）；
- 若当前动轨处于激活状态，立即触发单帧强制刷新（`renderCurrentFrame(true)`）。

### 3.5 DOM 句柄生命周期与控制栏自适应
- DOM 句柄直接由 `PlayerController` 在就绪时注入，消除每帧 `document.querySelector` 查找。
- 覆盖层 CSS 布局适配 YouTube 全屏与控制栏自动隐藏（`ytp-autohide`），确保视觉对齐原生体验。

### 3.6 代码接口定义规范

```typescript
export interface CaptionRenderState {
  isActive: boolean;
  isPlaying: boolean;
  isSubtitlesOn: boolean;
  sessionOffsetMs: number;
  effectiveOffsetMs: number;
}

export class CaptionOverlayRenderer {
  private static instance: CaptionOverlayRenderer | null = null;
  
  public static getInstance(): CaptionOverlayRenderer;
  
  /**
   * 初始化覆盖层渲染引擎并绑定偏移提供源
   */
  public init(offsetProvider: () => { sessionOffsetMs: number; effectiveOffsetMs: number }): void;
  
  /**
   * 绑定底层播放器与视频节点句柄（由 PlayerController 驱动）
   */
  public attachVideo(video: HTMLVideoElement | null, container: HTMLElement | null): void;
  
  /**
   * 状态变化时触发渲染闸门重新评估
   */
  public updateGateState(): void;
  
  /**
   * 单帧即时刷新（例如快捷键调节偏移或 seeked 时调用）
   */
  public renderCurrentFrame(force?: boolean): void;
  
  /**
   * 销毁并释放所有 DOM 节点与样式
   */
  public destroy(): void;
}
```

---

## 4. Candidate 2：4 列响应式网格与断点事件驱动架构

### 4.1 架构设计与关注点分离

```
                   [ Browser Window Breakpoints ]
                                 │
             ┌───────────────────┴───────────────────┐
             ▼                                       ▼
  [ Pure CSS @media Layout ]           [ MediaQueryList Event Dispatcher ]
  • --ytd-rich-grid-items-per-row: 4   • Change Event (Breakpoint Cross ONLY)
  • Hardware accelerated               • 0 window.resize overhead
             │                                       │
             │                                       ▼
             │                         ┌──────────────────────────────┐
             │                         │ GridCoordinator.rebalance()  │
             │                         └──────────────┬───────────────┘
             │                                        │
             ▼                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Deep Module: GridCoordinator                                            │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Two-Phase Mount Strategy                                          │  │
│  │  • Phase 1: Temporary light observer on #primary until #contents  │  │
│  │  • Phase 2: ScopedGridObserver bound to contents (0 body listen)  │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │ (ChildList Mutations)              │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ ScopedGridObserver with Silence Lock                              │  │
│  │  • Disconnect observer -> Execute planRebalance -> Reconnect      │  │
│  │  • Prevents self-inflicted mutation storm                         │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │ (Planning)                         │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ GridCalculator.planRebalance (Pure Algorithm)                     │  │
│  │  • Computes move instructions for shelf & section gaps            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 断点事件驱动（`MediaQueryList` Driven）
- 彻底废除 `window.addEventListener("resize")` 与 100ms 防抖计时器；
- 针对 1100px、850px、550px 等响应式断点注册 `window.matchMedia(breakpointQuery)` 监听器；
- 仅在窗口宽度跨越列数断点时由浏览器派发单次微任务触发 `rebalance()`，无中间拉伸过程的无效计算。

### 4.3 两阶段稳健挂载生命周期（Two-Phase Mount Strategy）
- 解决 YouTube SPA 路由切换时网格异步渲染的竞态问题：
  - **阶段 1（发现期）**：在 `yt-navigate-finish` 时，若未直接找到 `ytd-rich-grid-renderer > #contents`，在 `#primary` 或 `ytd-browse` 容器上挂载单次轻量级 `MutationObserver`。
  - **阶段 2（稳态期）**：一旦目标 `#contents` 节点进入 DOM，立即断开临时 Observer，切换为靶向 `ScopedGridObserver` 并执行首屏平衡。

### 4.4 靶向突变观察器与原子静默隔离（Silence Lock）
- Observer 仅监听 `ytd-rich-grid-renderer > #contents` 的直接子节点（`childList: true`，`subtree: false`）；
- 在执行节点重排前调用 `disconnect()`，重排完毕后重新 `observe()`，彻底隔绝脚本自身 `insertBefore` 触发的突变回火。

```typescript
private rebalance(): void {
  if (this.isRebalancing || !this.targetContents) return;
  this.isRebalancing = true;
  
  // 1. 暂停 Observer 避免自身 insertBefore 造成突变回火
  this.scopedObserver?.disconnect();
  
  try {
    const itemsPerRow = FourColumnGrid.getItemsPerRow();
    const children = Array.from(this.targetContents.children);
    const types = children.map(getNodeType);
    const instructions = GridCalculator.planRebalance(types, itemsPerRow);
    
    for (const inst of instructions) {
      const sectionEl = children[inst.sectionIndex];
      if (!sectionEl) continue;
      for (const srcIdx of inst.sourceIndices) {
        const itemEl = children[srcIdx];
        if (itemEl && itemEl.parentNode === this.targetContents) {
          this.targetContents.insertBefore(itemEl, sectionEl);
        }
      }
    }
  } finally {
    // 2. 重排完毕后重新附加靶向监听
    if (this.targetContents && this.scopedObserver) {
      this.scopedObserver.observe(this.targetContents, { childList: true });
    }
    this.isRebalancing = false;
  }
}
```

### 4.5 声明式 CSS 媒体查询完全驱动
- 彻底移除 `document.documentElement.style.setProperty("--ytd-rich-grid-items-per-row", ...)`；
- 所有网格列宽与边距均由 `StyleEngine.inject("four-column-grid", css)` 静态管理，排版由浏览器 GPU 管线加速。

### 4.6 代码接口定义规范

```typescript
export class GridCoordinator {
  private static instance: GridCoordinator | null = null;
  
  public static getInstance(): GridCoordinator;
  
  /**
   * 初始化网格样式、matchMedia 断点监听与靶向观察器
   */
  public init(): void;
  
  /**
   * 触发一次网格插槽平衡扫描
   */
  public rebalance(): void;
  
  /**
   * 卸载观察器、断点监听与样式注入
   */
  public destroy(): void;
}
```

---

## 5. 破坏面分析与实施阶段规划 (Impact Analysis & Staged Rollout)

### 5.1 破坏面分析 (Blast Radius)

- **`features/caption`**：
  - 改动面集中在 `controller.ts` 与 `renderer.ts` 的动静状态机装配；
  - `timeline.ts` 补充音轨键同步方法（`setActiveKey`），`interceptor.ts` 保持高效网络拦截；
  - `FeatureRegistry` 对外描述符契约完全保持不变。
- **`features/grid`**：
  - 重构 `adapter.ts` 为 `coordinator.ts` 与 `scoped-observer.ts`；
  - `calculator.ts`（算法核心）与 `constants.ts` 保持不变；
  - 外部 `FourColumnGrid.run()` 别名平滑代理到 `GridCoordinator.getInstance().init()`，无破坏性改动。

### 5.2 实施三步走计划

1. **Phase 1: 动静分离字幕引擎实施 (`features/caption`)**
   - 实现 `CaptionController` 动静分流逻辑（`sessionOffsetMs === 0` 停用覆盖层）；
   - 重构 `CaptionOverlayRenderer` 渲染闸门，接入 `PlayerController` 句柄与事件；
   - 验证：常态播放（含全局基准偏移）主线程 0% CPU 占用，临时微调时丝滑覆盖。
2. **Phase 2: 断点事件驱动与靶向网格实施 (`features/grid`)**
   - 移除 `window.resize` 监听与 `style.setProperty`，接入 `matchMedia` 断点调度；
   - 实现两阶段挂载机制与原子静默锁；
   - 验证：首页/订阅页滚动与窗口缩放时无 Mutation 回火与掉帧。
3. **Phase 3: 严格类型检查与端到端构建验证**
   - 运行 `pnpm run check` 确保严格模式 0 类型报错；
   - 运行 `pnpm run build` 确保 Userscript 产物大小与编译无损。

---

## 6. 验证方案与性能基准指标 (Verification & Performance Benchmarks)

### 6.1 自动化检查
```powershell
# 1. TypeScript 严格类型检查
pnpm run check

# 2. 生产构建打包
pnpm run build
```

### 6.2 性能基准指标验证 (Performance Benchmarks)

| 测试项 | 重构前基准 (Before) | 目标指标 (Target After) | 验证手段 |
|---|---|---|---|
| **常态播放 CPU 占用 (静轨: 仅全局基准偏移)** | ~2.5% - 5% (144Hz rAF 空转) | **0.0%** (100% 复用原生渲染) | Chrome DevTools Performance 性能面板分析 |
| **动轨微调 CPU 占用 (用户热调 sessionOffset)** | ~2.5% - 5% (每帧 querySelector) | **< 0.5%** (句柄直传 + 按需 rAF) | DevTools Performance 采样分析 |
| **每秒 DOM querySelector 次数** | 576+ 次/秒 | **0 次/秒** (常态) | DevTools Console API 桩拦截计数 |
| **窗口 Resize 事件触发频次** | 每秒数十次高频触发与防抖 | **0 次** (完全由 `matchMedia` 精确派发) | 监听器断点打点测试 |
| **网格 MutationObserver 触发频率** | 全页变动均触发 (高频) | **仅信息流添加行时触发** | MutationObserver 触发计数打点 |
| **网格节点重排 Layout Thrashing** | 频繁（JS 改写 style 引发） | **0 次**（完全交给 CSS） | DevTools Rendering "Layout Shift Regions" |
