# YouTube Turbo 核心架构性能深化与深模块重构方案

本项目是专为 YouTube 桌面端量身定制的用户脚本（基于 Vite 6 + TypeScript 5 + vite-plugin-monkey）。本文档基于第一性原理与深模块（Deep Modules）架构规范，系统性剖析并解决整个代码库中存在的性能瓶颈、高频主线程开销、强制同步布局（Layout Thrashing）与垃圾回收压力。

---

## 1. 架构性能瓶颈诊断与第一性原理分析

### 1.1 字幕渲染管线（CaptionOverlayRenderer & SubtitleTimeline）
- **高频 DOM 查询瓶颈**：`CaptionOverlayRenderer` 在 144Hz/120Hz/60Hz 的 `requestAnimationFrame` 帧循环中，每一帧都无条件调用 `isSubtitlesEnabled()`，其内部执行全局 `document.querySelector(".ytp-subtitles-button")` 与 `getAttribute("aria-pressed")`。在开启自定义字幕偏移时，造成高频的主线程 DOM 查询与强制重排开销。
- **时间局部性与 GC 内存压力**：
  1. 在播放过程中，98% 以上的动画帧处于同一条字幕 Cue 的时间区间 `[startMs, endMs]` 内，但当前实现每帧都在执行完整的 $O(\log N)$ 二分查找。
  2. `findActiveCues()` 每次调用均动态创建临时数组与字符串拼接，高刷屏下每秒产生上千个临时对象，引发 V8 频繁垃圾回收（Minor GC）卡顿。
- **状态感知单一性**：YouTube 用户频繁使用键盘快捷键 `c` 切换字幕，或在全屏/小型播放器下隐藏控制栏，单纯依赖 DOM 属性轮询易引发状态滞后或空指针异常。

### 1.2 详情页 Tabview 镜像与重排管线（InfoMirrorEngine & DOMRelocator）
- **祖先链嵌套查询开销**：`InfoMirrorEngine.queryExtraContentSources()` 对每个元素向上进行 `while (cur)` 遍历并在每个层级执行 `querySelectorAll`，在大页面下存在多层嵌套循环扫描。
- **DOM 连续替换回流与无序突变**：数据变动时通过 `replaceWith(dummyNode)` 连续插拔两次，引发局部回流；同时缺乏微任务批处理（Microtask Batching），连续属性变动时会产生多次重复同步。
- **Slot 重定位缺乏常数时间直通**：`DOMRelocator.tryRelocateSlot()` 在目标元素已稳定就位时仍反复执行全局选择器扫描。
- **SPA 路由切页竞态**：异步同步或微任务未绑定路由生命周期令牌（Navigation Token），可能在跨视频快速切换时引发脏数据镜像。

### 1.3 播放器视图与交互（PlayerSpeedButtonView）
- **强制同步布局（Forced Synchronous Layout）**：`PlayerSpeedButtonView` 在每次鼠标悬停（mouseenter）时调用 3 次 `getBoundingClientRect()` 并通过 JS 计算绝对坐标写入 `style.left` / `style.top`，打断了浏览器的样式计算管线。
- **冗余事件与定时器**：维护冗余的 `isHovering` 状态与 `setTimeout` 定时器，无法利用浏览器原生的 GPU 合成与 CSS 状态机。

---

## 2. 核心架构重构设计 (Deep Modules & Seams)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                YouTube Turbo Architecture                              │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
    ┌───────────────────────────────────────┼───────────────────────────────────────┐
    ▼                                       ▼                                       ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌───────────────────────────────┐
│ 1. Reactive Caption Engine    │ │ 2. InfoMirror & Relocator     │ │ 3. Pure CSS Player Engine     │
│ - Multi-Channel State Signal  │ │ - Flat Source Scanner         │ │ - Relative Child Anchor       │
│ - O(1) Two-Level Step Cache   │ │ - Tokenized Microtask Batcher │ │ - Pseudo-class Hover State    │
│ - Zero-Allocation Cue Return  │ │ - Fast-Path Slot Short-Circuit│ │ - Zero Forced Synchronous     │
│ - 0 Query in rAF Frame Loop   │ │ - Non-Destructive Model Sync  │ │   Layout (0 JS Calculation)   │
└───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────────┘
```

### 决策一：字幕子系统全响应式状态机、双级步进时间缓存与零分配复用
1. **多通道状态驱动机制**：
   - 监听 `.ytp-subtitles-button` 的 `MutationObserver` 属性变化，同时订阅播放器原生事件与 `c` 快捷键，在 `CaptionOverlayRenderer` 内部维护响应式布尔标志 `isCCActive`。
   - `renderCurrentFrame()` 内部直接读取内存状态，彻底消除帧循环中的任何 `querySelector` 与 `getAttribute`。
2. **$O(1)$ 双级步进时间缓存（Two-Level Stepping Cache）**：
   - **Level 1**：时间落在当前 Cue `[startMs, endMs]` 内，直接复用当前引用返回（耗时仅 2 次数值比较，覆盖 98% 帧）；
   - **Level 2**：时间单调递增步进至下一个 Cue（`currentIndex + 1`），更新指针直接返回（覆盖 1.5% 帧）；
   - **Level 3（Fallback）**：仅在用户主动 Seek、跳跃或重播时，触发 $O(\log N)$ 二分查找并更新指针。
3. **零垃圾回收分配（Zero-Allocation Strategy）**：
   - 维护可复用的内部 Cue 数组与预分配容器，避免每帧创建临时 Array 和 String 碎片，彻底消除 GC 停顿。

### 决策二：详情页镜像引擎（InfoMirrorEngine）扁平化扫描与带令牌微任务聚合
1. **扁平化单遍扫描（Flat Single-Pass Scanner）**：
   - 直接通过 Polymer 实例特征及层级选择器定位源节点，废除嵌套 `while (cur)` 逐层 `querySelectorAll`，将扫描复杂度由 $O(M \times N)$ 降至 $O(K)$。
2. **带路由令牌的微任务批处理调度（Tokenized Batched Scheduler）**：
   - 使用 `queueMicrotask` 聚合高频属性突变，单帧内仅执行一次拓扑与数据比对。
   - 绑定 `NavigationCoordinator` 当前路由令牌（Navigation Token），若在调度期间发生 SPA 切页，自动丢弃废弃微任务，彻底免疫路由竞态。
3. **非破坏性就地数据同步（Non-Destructive In-Place Sync）**：
   - 废除 `replaceWith(dummyNode)` 连续两次 DOM 插拔，通过 Polymer 原生属性通道与 DocumentFragment 批量挂载，消除闪烁与局部回流。

### 决策三：DOMRelocator 引入常数时间快速直通检查（Fast-Path Short-Circuit）
1. 在 `tryRelocateSlot` 开头优先检查缓存的 `slotState.element` 是否仍处于 `targetContainer` 中且处于连接状态（`isConnected === true`），若是则在 $O(1)$ 常数时间直接返回，避免反复全树扫描。
2. 将 `sweepSecondary` 改为靶向增量扫描，减少全量 DOM 遍历。

### 决策四：倍速下拉菜单改用纯 CSS 相对锚定与伪类驱动
1. 将 `#yt-turbo-speed-options` 挂载为 `.yt-turbo-speed-btn` 的直接子节点，采用 `position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);` 样式规则。
2. 依靠 CSS `:hover` / `:focus-within` 控制渐变显隐，彻底废除 `mouseenter` / `mouseleave` 事件监听、`getBoundingClientRect()` 坐标计算与 `setTimeout` 定时器，实现 100% 声明式渲染与 0 强制同步布局。

---

## 3. 拟修改与优化文件清单

### [MODIFY] [renderer.ts](file:///e:/project/YouTube_Improvements/src/features/caption/renderer.ts)
- 引入响应式 `isCCActive` 状态缓存与多通道事件同步（快捷键、按钮属性、播放器事件）；
- 消除 `renderCurrentFrame()` 内部高频执行的 `document.querySelector` 与 `isSubtitlesEnabled` DOM 查询；
- 优化与 `<video>` 事件的绑定与生命周期注销。

### [MODIFY] [timeline.ts](file:///e:/project/YouTube_Improvements/src/features/caption/timeline.ts)
- 实现 $O(1)$ 双级步进时间缓存（Two-Level Stepping Cache）；
- 实现零内存分配（Zero-Allocation）返回机制，彻底消除动画帧循环中的 GC 压力；
- 完善切歌与 Seek 时的指针重置逻辑。

### [MODIFY] [info-mirror-engine.ts](file:///e:/project/YouTube_Improvements/src/features/tabview/page/info-mirror-engine.ts)
- 改造 `queryExtraContentSources()` 为扁平化单遍扫描，消除嵌套祖先 `querySelectorAll`；
- 引入带路由生命周期令牌的微任务防抖聚合（Tokenized Microtask Batching），消除高频属性突变引发的重复镜像与 SPA 竞态；
- 废除 `dummyNode` 双重插拔，采用非破坏性数据模型同步。

### [MODIFY] [relocator.ts](file:///e:/project/YouTube_Improvements/src/features/tabview/page/relocator.ts)
- 在 `tryRelocateSlot` 中增加 Slot 稳定态常数时间直通短路（Fast-Path Short-Circuit）；
- 优化 `sweepSecondary` 避免对非变动子节点的重复全量扫描。

### [MODIFY] [speed-button-view.ts](file:///e:/project/YouTube_Improvements/src/features/player/speed-button-view.ts)
- 将菜单节点作为子元素挂载，废除 `mouseenter` 中的 `getBoundingClientRect()` 坐标计算与内联样式写入；
- 移除 `isHovering` 定时器与鼠标进出监听，全面切换为声明式 CSS 伪类与动画。

### [MODIFY] [constants.ts (Player)](file:///e:/project/YouTube_Improvements/src/features/player/constants.ts)
- 更新倍速菜单样式规范，支持基于父级按钮的相对定位居中与平滑过渡。

---

## 4. 验证计划

### 自动化与静态类型检查
- 执行 `pnpm run check` 确保严格模式 TypeScript 类型完全校验通过（0 错误，显式类型，禁止隐式 any）。
- 执行 `pnpm run build` 确保 Userscript 主脚本与 `virtual:tabview-page-bundle` 编译产物打包正常且无构建警告。

### 性能与运行时验证
1. **字幕渲染高频开销验证**：
   - 验证在开启字幕偏移（`Alt+[` / `Alt+]`）及正常播放时，rAF 循环内 0 `querySelector` 发生；
   - 验证持续播放时内存占用平稳，无高频 GC 锯齿抖动；
   - 验证快捷键 `c` 切换字幕及全屏模式下字幕显示/隐藏响应精准。
2. **详情页 Tabview 性能验证**：
   - 验证详情页多 Tab 切换、评论区展开、视频描述镜像在 SPA 快速切页后无掉帧、无闪烁、无跨视频脏数据覆盖；
   - 验证微任务批处理正常捕获所有 extra-content 容器数据变更。
3. **播放器倍速按钮验证**：
   - 验证悬停倍速按钮时菜单弹出平滑居中，在全屏、剧院模式、小窗模式下位置始终精确，Performance 面板中 0 Forced Synchronous Layout。
