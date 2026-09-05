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

**PlayerSpeedFeature**:
播放器倍速特性的生命周期深模块，原子协调 `PlayerController` 快捷交互与 `PlayerSpeedButtonView` 视图适配器，封装正向装配、逆序注销及失败回滚机制。
_Avoid_: SpeedControlManager, PlayerSpeedCoordinator, FeatureComposer

**PlayerShortcuts**:
播放器快捷键（调速/重置/截图/画中画/循环）调度适配器，统管播放器键盘交互生命周期。
_Avoid_: KeyBinder, PlayerKeymap, SpeedShortcuts

**CaptionController**:
字幕偏移校准与同步深模块，统管 `/api/timedtext` 网络拦截、Cue 缓存解析与覆盖层实时渲染。
_Avoid_: SubtitleOffset, SubtitleManager, CaptionProxy

**CaptionOverlayRenderer**:
字幕覆盖层渲染深模块，基于按需激活的 `requestAnimationFrame` 与 `timeupdate` 复合驱动，负责原生字幕互斥隐藏与当前帧 Cue 文本精准绘制。
_Avoid_: SubtitleOverlay, CaptionDrawer, OverlayPoller

**ReactiveRenderGate**:
按需渲染闸门机制，仅在媒体处于播放态且自定义字幕配置有效时保持渲染循环，在暂停或空闲态将 JavaScript CPU 占用收敛为零。
_Avoid_: RenderLoop, AnimationTicker, FramePoller

**GridCoordinator**:
首页与订阅页 4 列网格自适应统管深模块，统管局部容器 DOM 突变监听、行布局指令重排与原生 CSS 媒体查询自适应。
_Avoid_: FourColumnGrid, GridManager, GridDOMAdapter

**ScopedGridObserver**:
仅针对 `ytd-rich-grid-renderer > #contents` 直接子容器的靶向突变观察器，在 DOM 节点重排期间具备自防护静默能力，杜绝全局 DOM 突变风暴。
_Avoid_: BodyObserver, GlobalGridWatcher, GridPoller

**ToolbarController**:
多插槽悬浮工具箱与操作栏核心深模块，统管播放器控制栏、Shorts 侧边栏与视频元数据栏的插槽注入、弹层定位与动作派发。
_Avoid_: ToolBox, ToolbarManager, ActionHost

**TabviewLifecycleCoordinator**:
详情页纯事件驱动生命周期统管深模块，依托 Polymer 原型拦截钩子（`attached`/`dataChanged`）与局部观察总线调度 Tabview 容器挂载、Slot 重排与徽标同步，彻底根除轮询守护定时器。
_Avoid_: GuardianTimer, TabPoller, TabviewManager

**TabviewSession**:
一次 Tabview 功能启用周期内，关联油猴沙箱与页面上下文的有界通信会话，保证不同会话相互隔离、消息按协议有序交付，并在功能停用时确定性终止。
_Avoid_: RuntimeBridgeSession, BridgeConnection, CommunicationKey

**RuntimeChannel**:
为不同运行上下文提供有界、可终止的数据传输通道，保证消息接收与资源生命周期由同一会话拥有。
_Avoid_: RuntimeBridge, BridgeInstance, GlobalEventBus

**TabviewPanelState**:
将直播聊天、播放列表、评论与互动面板的可见和展开状态投影为 Tabview 布局状态的领域深模块。
_Avoid_: ObserverRegistry, PanelObserverManager, LayoutState

**ReactiveDOMRegistry**:
DOM 核心句柄缓存深模块，持有高频核心元素（播放器容器、视频节点、元数据标题等）的高速引用，与 `yt-navigate-finish` 路由生命周期对齐自动失效。
_Avoid_: DOMHelper, DOMProxy, DOMWrapper

**SlotMountBus**:
多插槽聚合挂载总线，将全站所有待就绪工具栏插槽（播放器、Shorts、视频信息栏等）的突变侦测合并为单遍扫描观察器，全部挂载后即刻停机。
_Avoid_: MultiObserver, SlotWatcher, SlotPoller
