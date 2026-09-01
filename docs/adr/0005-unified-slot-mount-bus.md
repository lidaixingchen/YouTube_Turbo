# 0005. 工具栏多插槽挂载器合并为单一聚合观察总线 (Unified Slot Mount Bus)

- **状态**: Accepted (已采纳)
- **日期**: 2026-09-01
- **决策者**: YouTube Turbo 核心架构组

---

## 1. 背景与问题上下文 (Context)

`src/ui/toolbar/` 子系统支持将快捷操作按钮挂载至 YouTube 的多个核心区域（包括播放器控制栏 `SLOT_PLAYER_CONTROLS`、Shorts 动作栏 `SLOT_SHORTS_ACTIONS` 与视频元数据栏 `SLOT_WATCH_METADATA`）。

早期实现中，`ReactiveMounter` 为每一个未决插槽独立创建并持有一个 `MutationObserver`，且均回退监听 `document.body` 的 `subtree: true`。当页面加载或初次路由导航时，存在 3 个以上的全局 Observer 同时在整个 `document.body` 树上进行并行的 `childList` 匹配与解析，造成多观察者的分发冗余。

---

## 2. 决策内容 (Decision)

我们决定将 `ReactiveMounter` 重构为 **`SlotMountBus` 单一聚合挂载总线**：

1. **单实例突变总线（Single-Instance Mutation Bus）**：全局仅维护最多 1 个处于活跃状态的 `MutationObserver`；
2. **单遍批处理匹配（Single-Pass Match）**：当捕获到目标容器突变时，在单次微任务回调中同时扫描所有处于 `pending` 状态的插槽目标；
3. **就绪即停机（Auto-Disconnect When Idle）**：一旦所有已注册插槽均已成功挂载（或离开适用路由），立即主动调用 `observer.disconnect()`，不留任何常驻监听；
4. **路由驱动唤醒**：在 `yt-navigate-finish` 路由到达新页面时重新激活总线，执行初次静态匹配，未命中时再挂载单实例 Observer。

---

## 3. 权衡与影响 (Consequences)

### 正面收益 (Positive)
- **消灭多 Observer 重叠分发**：将 N 个全局 `document.body` 观察者收敛为 1 个聚合总线。
- **更短的挂载生命周期**：挂载完成后立即断开观察器，播放器就绪后主线程开销完全归零。
- **统一的插槽调试与可观测性**：所有插槽挂载状态在 `SlotMountBus` 内部拥有统一的状态机追踪。

### 负面代价与约束 (Negative & Trade-offs)
- 需要集中管理多个插槽的生命周期状态集合（`Pending` / `Mounted` / `Disabled`），调度状态机稍微复杂于各个插槽各自独立的单点监听。
