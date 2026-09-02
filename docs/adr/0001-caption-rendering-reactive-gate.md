# 0001. 字幕覆盖层采用按需激活渲染闸门 (Caption Rendering Reactive Gate)

- **状态**: Accepted (已采纳)
- **日期**: 2026-09-01
- **决策者**: YouTube Turbo 核心架构组

---

## 1. 背景与问题上下文 (Context)

YouTube 官方播放器在开启字幕后通过内置 WebVTT / TimedText 管线渲染字幕。本项目提供的字幕时间轴校准特性（`SubtitleOffset`）通过在内存中动态偏移时间戳，并在播放器上绘制自定义字幕覆盖层（`CaptionOverlayRenderer`）来实现毫秒级无感校准。

早期实现中，`CaptionRenderer` 采用常驻且无条件的 `requestAnimationFrame`（rAF）循环。在每个动画帧（60Hz、120Hz 甚至 144Hz）中，渲染器均会执行 4 次全局 DOM 选择器查询（`#movie_player`、`video`、`.ytp-subtitles-button` 等）以判断当前播放状态。这导致：
1. 即使视频未播放、字幕未开启或基准偏移量为 0 时，浏览器主线程依然以 144fps 高频空转，造成不必要的 CPU 消耗与电池损耗；
2. 缺乏状态驱动的渲染缝隙（Seam），与 `PlayerController` 现有的视频生命周期解耦不良。

---

## 2. 决策内容 (Decision)

我们决定将 `CaptionOverlayRenderer` 重构为基于 **按需激活渲染闸门（ReactiveRenderGate）** 的事件驱动深模块：

1. **单向状态订阅**：`CaptionOverlayRenderer` 订阅 `PlayerController` 与 `CaptionController` 的生命周期，直接获取 `HTMLVideoElement` 实例与会话增量 `sessionOffsetMs`。
2. **三元就绪断言（Activation Predicate）**：仅在同时满足以下条件时才激活 rAF 渲染循环：
   - 视频处于播放态（`!video.paused && !video.ended`）；
   - YouTube 字幕处于开启态（`isSubtitlesEnabled === true`）；
   - 会话临时偏移量非零（`sessionOffsetMs !== 0`，持久化基准偏移由网络改包层注入官方播放器原生渲染，覆盖层仅在发生动态临时增量调节时接管）。
3. **即时停机与 DOM 释放**：一旦任一条件不满足，立即调用 `cancelAnimationFrame` 停止循环并隐藏覆盖层，使 JavaScript 运行时开销归零；在 SPA 路由切歌（`yt-navigate-finish`）时重置句柄。

---

## 3. 权衡与影响 (Consequences)

### 正面收益 (Positive)
- **零闲置开销**：在未开启字幕或偏移量为 0 的常态下（覆盖 90% 以上用户场景），字幕子系统的 CPU 占用彻底归零。
- **杜绝高频 DOM 遍历**：彻底消除每秒数百次的 `querySelector` 调用，DOM 句柄生命周期与 `PlayerController` 对齐。
- **毫秒级同步平滑度**：在真正需要偏移渲染时仍使用硬件级 rAF 帧同步与二分时间轴查找，保持无闪烁的高保真字幕绘制。

### 负面代价与约束 (Negative & Trade-offs)
- 需要精确监听播放器的 `play`、`pause`、`ended`、`ratechange` 以及字幕按钮的 `aria-pressed` 状态变动，状态机逻辑相比盲轮询更为紧凑精细。
