# 0004. 底层 DOM 适配器升级为响应式句柄缓存注册表 (Reactive DOM Registry & Handle Caching)

- **状态**: Accepted (已采纳)
- **日期**: 2026-09-01
- **决策者**: YouTube Turbo 核心架构组

---

## 1. 背景与问题上下文 (Context)

`src/core/dom-adapter.ts` 中的 `YouTubeDOMAdapter` 为整个脚本提供底层 DOM 操作与播放器接口。

早期实现中，`YouTubeDOMAdapter` 是一个无状态的 Helper 工具集。几乎每一个方法（如 `getVideoElement()`、`getPlayerContainer()`、`getVideoTitle()`、`getCurrentTime()`、`getDuration()`、`getVideoResolution()`）在每次被调用时，都通过 `document.querySelector` 重新对整个 DOM 树执行选择器匹配。在上游特性（如 `PlayerController`、`CaptionRenderer`、`PlaybackHUD`、`Toolbar`）高频交互时，引发了大量冗余的 DOM 选择器解析开销。

---

## 2. 决策内容 (Decision)

我们决定将 `YouTubeDOMAdapter` 深化为 **`ReactiveDOMRegistry` 响应式句柄缓存深模块**：

1. **核心节点局部缓存**：内部维护核心节点（如 `<video>`、播放器容器、元数据标题容器等）的强/弱引用缓存；
2. **$O(1)$ 常数时间访问**：若缓存节点仍然处于连接状态（`el.isConnected === true`），直接返回缓存实例，跳过 `document.querySelector`；
3. **路由生命周期自动失效（Route-Aware Invalidation）**：自动监听 `yt-navigate-finish` 事件与节点 `disconnect` 状态，在 SPA 路由切换时原子性清理旧节点缓存，确保无旧页面幽灵节点残留。

---

## 3. 权衡与影响 (Consequences)

### 正面收益 (Positive)
- **极大降低 DOM 查询压频**：高频调用的视频信息读取与播放器查询均在常数时间 $O(1)$ 内直接命中缓存。
- **集中收敛选择器变更**：当 YouTube 官方 DOM 结构发生演进时，仅需在 `ReactiveDOMRegistry` 内部维护一处候选选择器，上层所有 Caller 零修改。
- **杜绝内存泄漏**：严格绑定 `isConnected` 校验与 SPA 导航重置，防止已卸载的 DOM 节点被长期占用。

### 负面代价与约束 (Negative & Trade-offs)
- 若外部直接通过暴力 `innerHTML` 替换了底层容器且未派发标准连接事件，需要依赖 `isConnected` 的惰性检查触发重新查询。
