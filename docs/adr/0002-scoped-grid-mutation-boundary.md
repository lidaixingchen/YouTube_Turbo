# 0002. 网格突变监听作用域收敛与 CSS 原生响应 (Scoped Grid Mutation Boundary & CSS-Driven Layout)

- **状态**: Accepted (已采纳)
- **日期**: 2026-09-01
- **决策者**: YouTube Turbo 核心架构组

---

## 1. 背景与问题上下文 (Context)

YouTube 首页与订阅页的信息流默认由 `ytd-rich-grid-renderer` 渲染。本项目提供 4 列自适应响应式网格特性，对信息流中的推荐视频行（`ytd-rich-grid-row`）与混排板块（`ytd-rich-section-renderer`，如 Shorts 货架、精选专辑）进行行内展开与插槽重排。

早期实现存在两项显著的性能缺陷与架构泄漏：
1. **全局 Observer 泄漏**：在页面初始化或切页期间，若 `ytd-rich-grid-renderer` 尚未挂载，`GridDOMAdapter` 会自动降级为观察 `document.body` 或 `document.documentElement` 的 `subtree: true`。YouTube 页面上频繁发生的气泡提示、头像加载、统计打点等无害 DOM 变动均会唤醒网格 Observer 回调；
2. **重排自回火与内联样式重排**：`rebalance()` 中调用的 `insertBefore` 会向同个 Observer 发送额外的 `childList` 突变记录；同时，JS 监听 `window.resize` 并强行向 `html` 写入内联样式 `--ytd-rich-grid-items-per-row`，破坏了声明式 CSS 媒体查询的硬件加速优化并引发 Layout Thrashing。

---

## 2. 决策内容 (Decision)

我们决定将网格子系统重构为 **`GridCoordinator` 深模块** 与 **`ScopedGridObserver` 靶向突变隔离机制**：

1. **严格限制 Observer 作用域（No Global Body Observer）**：
   - 移除任何指向 `document.body` 或 `documentElement` 的 `subtree: true` 监听；
   - 仅对已挂载的 `ytd-rich-grid-renderer > #contents` 直接子级建立轻量级 `childList` 监听；
   - 若网格未就绪，仅依托 SPA 导航生命周期事件（`yt-navigate-finish`）执行单次就绪重试，绝不引入全局回退。
2. **重排执行期静默隔离（Silence Lock）**：
   - 在执行 `GridCalculator.planRebalance` 产出的 DOM 节点物理重排（`insertBefore`）期间，通过 `observer.disconnect()` 或内部原子布尔锁隔离突变捕获，杜绝自身操作产生的突变风暴。
3. **完全由 CSS 媒体查询驱动列数计算**：
   - 彻底废除 JS 对 `document.documentElement.style.setProperty` 的内联样式覆盖；
   - 响应式列数完全由注入的 `@media` 规则声明式处理，充分利用浏览器 Blink 引擎的合成器线程与硬件加速。

---

## 3. 权衡与影响 (Consequences)

### 正面收益 (Positive)
- **隔离全局 DOM 突变**：完全消除了非信息流区域 DOM 变动对网格模块的无效唤醒。
- **消灭微掉帧与重排回火**：杜绝了自触发 Mutation 回调以及 JS 频繁写入全局内联样式引发的页面重排。
- **清晰的关注点分离**：CSS 负责响应式样式度量，JS 仅负责极简的混排 Section 占位重排（Separation of Concerns）。

### 负面代价与约束 (Negative & Trade-offs)
- 若 YouTube 官方在某些极端网络延迟下晚于 `yt-navigate-finish` 2 秒以上才渲染出第一批网格节点，需要依赖初次节点注入时的微任务就绪检查，不能再依赖盲目的全树漫游监听。
