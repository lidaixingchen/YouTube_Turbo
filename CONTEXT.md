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

**ThemeController**:
YouTube 深浅色主题统管深模块，封装 Cookie `PREF` 中的 `f6` 标记解析、写入与页面刷新调度。
_Avoid_: ThemeEngine, ThemeCookieAdapter, ThemeManager

**PlayerController**:
播放器核心深模块，统管播放速率、单曲循环、原生画中画、物理分辨率截图及播放器快捷键全生命周期。
_Avoid_: VideoManager, PlaybackService, SpeedControl

**PlayerSpeedButtonView**:
播放器控制栏右下角倍速展示按钮与悬浮倍速菜单的轻量视图适配层。
_Avoid_: SpeedControl, SpeedToolbar, PlayerSpeedModule

**PlayerShortcuts**:
播放器快捷键（调速/重置/截图/画中画/循环）调度适配器，统管播放器键盘交互生命周期。
_Avoid_: KeyBinder, PlayerKeymap, SpeedShortcuts

**CaptionController**:
字幕偏移校准与同步深模块，统管 `/api/timedtext` 网络拦截、Cue 缓存解析与覆盖层实时渲染。
_Avoid_: SubtitleOffset, SubtitleManager, CaptionProxy

**ToolbarController**:
多插槽悬浮工具箱与操作栏核心深模块，统管播放器控制栏、Shorts 侧边栏与视频元数据栏的插槽注入、弹层定位与动作派发。
_Avoid_: ToolBox, ToolbarManager, ActionHost

