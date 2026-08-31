# YouTube Turbo

专为 YouTube 桌面端量身定制的高性能用户脚本，提供详情页 Tabview 重构、播放器控制增强、网格自适应与字幕校准等功能。

## Language

**SubtitleOffset**:
字幕时间轴偏移量（单位毫秒），用于调整字幕渲染时间相对于视频播放时间的差值；负值表示提前（Advance），正值表示延后（Delay）。
_Avoid_: SubtitleDelay, CaptionShift, TimeSkew

**TimedTextInterceptor**:
运行在主页面上下文的网络拦截器，用于拦截 YouTube `/api/timedtext` 请求并在内存中动态重写字幕事件的时间戳（`tStartMs`）。
_Avoid_: CaptionProxy, SubtitleHook, TrackModifier

**CaptionReloader**:
通过 YouTube 播放器内部接口无感触发当前字幕轨道重新加载的调度机制，使字幕偏移调整即时生效。
_Avoid_: SubtitleRefresher, PlayerRestarter

**SessionOffset**:
当前视频播放会话期间通过快捷键临时调整的动态偏移量，切视频或刷新页面后重置为全局默认偏移。
_Avoid_: TemporaryOffset, LocalDelta

**GlobalDefaultOffset**:
在用户配置中心中持久化保存的默认字幕偏移基准值，所有新视频加载时以此为初始偏移。
_Avoid_: BaseOffset, DefaultDelay
