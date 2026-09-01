# 0003. 详情页全面转向纯事件驱动生命周期并废除守护轮询 (Event-Driven Tabview Lifecycle & Elimination of Guardian Poller)

- **状态**: Accepted (已采纳)
- **日期**: 2026-09-01
- **决策者**: YouTube Turbo 核心架构组

---

## 1. 背景与问题上下文 (Context)

在 YouTube 详情页重构中，Tabview 子系统负责将视频推荐列表、评论区、播放列表以及视频元数据分栏迁移至右侧多标签容器。

早期实现中，`NavigationCoordinator` 运行了一个 1000ms 间隔的常驻定时器 `startGuardian`。该定时器在页面停留在 `/watch` 路由期间持续无条件执行：
1. `sweepSecondary()`：遍历扫描 `#secondary-inner` 与 `.secondary-inner-wrapper` 的全部子元素；
2. `updatePlaylistTabVisibility()`：正则匹配 URL 并执行 `document.querySelector` 检查播放列表面板状态；
3. `updateCommentsCounter()`：解析评论区 Polymer 内部对象数据与正则提取；
4. `checkAndHandleLinkedComment()`：查询高亮链接评论。
此外，路由切换时还通过 4 重级联延时（`[100, 300, 800, 1500ms]`）盲目重复执行 `syncMainDescriptionData()`。这造成了在视频播放闲置期间持续产生微小主线程唤醒开销与 DOM 遍历。

---

## 2. 决策内容 (Decision)

我们决定将 `NavigationCoordinator` 升级为 **纯事件驱动生命周期调度器（`TabviewLifecycleCoordinator`）**，彻底移除定时器：

1. **废除 `guardianTimer` 轮询**：彻底删除 `setInterval(..., 1000)` 守护定时器与级联延时数组；
2. **生命周期对齐 Polymer 原型钩子**：
   - 视频插槽迁移由 `ytd-watch-next-secondary-results-renderer` 的 `attached` 钩子精准驱动；
   - 评论区插槽迁移与状态同步由 `ytd-comments` 的 `attached` 钩子驱动；
   - 评论计数由 `ytd-comments-header-renderer` 的 `dataChanged` 原型拦截精准驱动；
   - 播放列表标签可见性由 `ObserverRegistry` 中的 `aoPlayList` 属性变动监听驱动；
   - 描述镜像由 `ytd-watch-metadata` 挂载事件与单次微任务同步驱动；
3. **单遍路由初始化（Single-Pass Navigation Sync）**：在 `yt-navigate-finish` 与 `DOMContentLoaded` 发生时执行确定性的单遍对齐，不再进行无意义的定时重复扫描。

---

## 3. 权衡与影响 (Consequences)

### 正面收益 (Positive)
- **真正的零闲置开销**：在停留在 Watch 播放页期间，Tabview 逻辑在无用户交互/无 DOM 突变时 CPU 占用绝对为 0。
- **消灭竞态条件**：依赖 Polymer 官方组件的真实生命周期，消除了固定延时（如 800ms）在弱网或极端高刷场景下的偶发时序错位。
- **减少垃圾回收压力**：消除定时执行正则提取与数组切片生成的瞬态垃圾对象。

### 负面代价与约束 (Negative & Trade-offs)
- 对 Polymer 组件原型拦截（`PolymerPatcher`）的稳定性要求极高，所有插槽的迁移与更新必须保证覆盖到对应的 Custom Elements 注册与实例化通道。
