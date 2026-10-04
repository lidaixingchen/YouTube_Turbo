# 0004. 底层 DOM 适配器升级为响应式句柄缓存注册表 (Reactive DOM Registry & Handle Caching)

- **状态**: Accepted (已采纳)
- **日期**: 2026-09-01
- **决策者**: YouTube Turbo 核心架构组

---

## 1. 背景与问题上下文 (Context)

`src/core/dom-registry.ts` 为播放器、字幕、HUD 和工具栏提供核心 DOM 句柄。高频读取需要复用句柄，同时准确区分当前页面、隐藏保留页及活跃 Shorts reel。每次整页查询会重复解析选择器，而只检查连接状态又可能接受仍连接的旧页面节点。

---

## 2. 决策内容 (Decision)

核心节点通过 **`ReactiveDOMRegistry` 响应式句柄缓存深模块** 访问：

1. **当前页面归属**：解析当前 watch 或 Shorts 路由的可见根，排除隐藏保留页；Shorts 视频、播放器和标题限定在活跃 reel，reel 或媒体节点尚未挂载时等待就绪，路由根缺失时采用可见迷你播放器局部回退。
2. **核心节点局部缓存**：使用 WeakRef 缓存 `<video>`、播放器容器、元数据标题及其所属根，同时记录当前 URL。
3. **局部缓存命中**：缓存节点和根仍连接、URL 一致、根符合当前路由可见状态，且实际媒体根仍包含节点时，直接返回实例，跳过整页选择器查询。Shorts 的媒体根还必须保持活跃 reel 状态。`isConnected` 只表示连接状态，不能单独证明节点属于当前页。
4. **路由生命周期自动失效（Route-Aware Invalidation）**：自动监听 `yt-navigate-finish`、`yt-page-type-changed` 与节点断开状态，在 SPA 路由切换时原子性清理旧节点缓存。

---

## 3. 权衡与影响 (Consequences)

### 正面收益 (Positive)
- **降低 DOM 查询次数**：高频调用的视频信息读取与播放器查询通过 WeakRef 和局部归属检查命中缓存，无需遍历整页。
- **集中收敛选择器变更**：当 YouTube 官方 DOM 结构发生演进时，仅需在 `ReactiveDOMRegistry` 内部维护一处候选选择器，上层所有 Caller 零修改。
- **弱引用寿命**：WeakRef 缓存不会单独延长已卸载节点的寿命；连接状态与路由根校验使失效节点重新进入局部发现流程。

### 负面代价与约束 (Negative & Trade-offs)
- 若外部直接通过暴力 `innerHTML` 替换了底层容器且未派发标准连接事件，需要依赖 `isConnected` 的惰性检查触发重新查询。
