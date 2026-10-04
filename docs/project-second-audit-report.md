# YouTube Turbo 第二轮全面审查报告

日期：2026-10-04（Asia/Hong_Kong）。审查版本：`1.1.6`。基线提交：`351b1087d5829f797cdce565709736acfa5b42c8`。

## 审查结论

本轮由 9 个并行子 Agent 完成模块审查，主代理负责跨模块契约核对、补充复现和最终归类。基线确认 **12 项新问题：8 项 P2、4 项 P3**，未发现有证据支持的 P0/P1 问题。N01–N12 已完成修复，最终实现与验证见 [第二轮修复与验证报告](project-second-repair-report.md)。下文记录基线的触发机制，位置与用例数量均对应审查时的代码。

优先处理的是启动流程与功能注册表之间的所有权冲突：入口提前启用服务，随后注册表把已保存为关闭的功能判定为尚未应用，导致设置显示关闭而实际功能仍生效。其次是搬运内容恢复、字幕请求失败结算、下载目标身份和页面注入结果。这些问题已有源码调用链或最小执行复现支持。

本轮重点覆盖上一轮较少关注的启动异常、主入口集成、键盘交互、HUD 归属、多语言覆盖、开发热更新及原生请求契约。上一轮 B01–B19、R01–R05 的修复不重复计数，背景见 [第一轮修复与验证报告](project-bug-audit-report.md)。

## 覆盖范围与验证方式

| 方向 | 主要范围 | 验证依据 |
| --- | --- | --- |
| 启动与底层配置 | main、config-hacks、Trusted Types、StyleEngine | 初始化调用链；存储异常后的重试探针 |
| 跨上下文通信 | RuntimeBridge、Tabview session/protocol、沙箱及页面入口 | 14 项定向用例；会话建立前异常的故障注入 |
| 输入与媒体控制 | ShortcutDispatcher、HUD、PlayerController、循环、PiP、截图 | 17 项既有定向用例；2 项媒体与 HUD 探针 |
| 界面与设置 | 工具栏渲染、Popover、插槽总线、倍速视图、设置视图、图标 | CodeGraph 调用链、DOM 语义、既有测试及 ADR |
| 多语言与主题 | Locale、字典、主题 Cookie、样式启停、文案调用 | 字典 AST 统计；1 项早期语言检测探针 |
| Tabview 布局边界 | Relocator、ExpanderFixer、LinkedCommentAdapter、PanelState、Coordinator | 2 项内容恢复探针；挂载与 replay 补偿路径 |
| 字幕协议 | 拦截器、时间线、控制器、渲染闸门 | 3 项请求/响应边界探针；原生 API 契约 |
| 网格、广告与下载 | Calculator、ScopedGridObserver、Coordinator、广告 CSS、下载入口 | 5 个文件共 71 项定向用例，包括审计探针 |
| 构建与交付契约 | 页面 bundle 插件、元数据、类型、功能描述符、生产入口 | 36 项定向用例；类型检查；独立临时生产构建；Windows 路径验证 |
| 主代理整合 | 控制器/服务提前初始化与真实功能描述符的组合 | 2 项启动集成探针，均复现设置与实际行为不一致 |

各方向的测试存在重叠，以上数量不相加作为独立覆盖总数。本轮没有重新执行完整 352 项套件，定向测试通过也不代表缺陷不存在；审计探针断言的是报告所述错误行为。临时测试和临时构建文件均已逐一清理，正式构建产物未被临时构建覆盖。

## 确认问题

### N01 · P2 · 播放器初始化异常会阻断主启动并阻止重试

- **位置**：[入口](../src/main.ts#L15)、[播放器初始化](../src/features/player/controller.ts#L195)、[存储读取](../src/core/storage.ts#L31)。
- **触发**：初始化读取保存的播放速度或其他播放器设置时，`GM_getValue` 抛错。
- **机制与影响**：控制器在读取前已设置 `isInitialized=true`，读取异常后再次调用 `init()` 直接返回。入口的异常处理仅包围后面的注册表初始化，早期同步异常使整个启动 Promise 拒绝，工具栏及特性注册步骤没有执行。
- **证据**：最小探针让首次读取抛错，再恢复存储并重试；第二次初始化没有重新读取。入口调用链确认异常发生在局部 `try` 之前。
- **修复方向**：成功完成初始化后才确认状态，失败时释放本轮资源并允许重试；主入口的错误处理应覆盖早期启动步骤，并提供恢复路径。

### N02 · P2 · 已保存为关闭的循环功能在新页面仍可能循环

- **位置**：[入口提前初始化](../src/main.ts#L15)、[旧键读取](../src/features/player/controller.ts#L201)、[独立键读取](../src/registry/feature-registry.ts#L498)、[初始关闭分支](../src/registry/feature-registry.ts#L389)。
- **触发**：独立键 `yt/functionState_01/isOpenLoopPlayback=false`，旧整对象未记录关闭，且 `videoLoop=true`。
- **机制与影响**：控制器只从旧整对象判断功能开关，先恢复循环。注册表随后读到独立键为关闭，将功能标记为 `disabled/applied=false`，不执行 teardown；实际视频仍 `loop=true`。
- **证据**：主代理用真实控制器、真实循环描述符和注册表运行启动顺序；注册表显示关闭，同时控制器循环状态和视频 `loop` 均为真。
- **修复方向**：统一循环功能的权威状态与生命周期所有者，由功能描述符决定启用；控制器不能在注册表决定之前从另一份状态恢复该功能。

### N03 · P2 · 已保存为关闭的下载功能仍在启动时注册动作

- **位置**：[入口](../src/main.ts#L17)、[下载初始化](../src/features/download/index.ts#L96)、[动作注册](../src/features/download/index.ts#L54)、[下载描述符](../src/registry/descriptors.ts#L49)。
- **触发**：保存 `isOpenYoutubedownloading=false` 后刷新页面。
- **机制与影响**：入口无条件调用 `VideoDownloadService.init()`，先注册三个下载动作；注册表的初始关闭分支跳过 setup，也不会清理它认为尚未应用的功能。设置显示关闭，动作仍然保留。
- **证据**：主代理按真实启动顺序执行服务与下载描述符；注册表显示关闭，三个动作已注册且没有调用 `disable()`。
- **修复方向**：由下载描述符独占服务的启停，入口只初始化共享基础设施。

### N04 · P2 · 迷你播放器下载使用了浏览页地址

- **位置**：[下载目标](../src/features/download/index.ts#L23)、[迷你播放器发现](../src/core/scoped-discovery.ts#L24)、[播放器插槽](../src/ui/toolbar/slot-mount-bus.ts#L331)。
- **触发**：在首页或订阅页通过迷你播放器继续播放视频，再点击播放器工具箱中的下载动作。
- **机制与影响**：插槽支持迷你播放器，但下载目标直接取 `window.location.href`，因此发送的是首页或 `/feed/subscriptions`，不是正在播放的视频地址。
- **证据**：订阅页加迷你播放器夹具中点击真实下载动作，解析服务的 `url` 参数为订阅页地址。未推测第三方服务如何处理这个地址。
- **修复方向**：按当前媒体身份获取视频 URL；没有可靠视频身份时，下载动作应呈现相应的可用状态。

### N05 · P2 · Tabview 的 secondary sweep 搬运内容没有恢复位置

- **位置**：[sweep 搬运](../src/features/tabview/page/relocator.ts#L256)、[恢复](../src/features/tabview/page/relocator.ts#L280)、[卸载](../src/features/tabview/page/relocator.ts#L298)。
- **触发**：secondary 观察器触发 `sweepSecondary()`，把直接子内容移入视频 Tab，之后退出 watch 路由或禁用功能。
- **机制与影响**：该分支记录 `element`，却没有创建恢复锚点。`restoreSlot()` 只在锚点连接时恢复内容；随后卸载删除 Tabs 容器，搬入的内容一起断开。已有锚点被上游移除时也会进入同一恢复失败机制。
- **证据**：两个 DOM 探针分别覆盖 sweep 搬运和移除锚点后卸载，内容均变成未连接。sweep 是现有生产调用路径；上游主动移除锚点的实际频率仍需现场采样。
- **修复方向**：所有搬运路径都保存原位置；除锚点外保留足够的源父节点/邻接信息，在源位置仍有效时恢复内容，卸载时不要直接移除仍承载内容的容器。

### N06 · P2 · 最新字幕请求失败后仍占有缓存恢复权

- **位置**：[请求发起登记](../src/features/caption/interceptor.ts#L203)、[时间线请求记录](../src/features/caption/timeline.ts#L155)、[恢复校验](../src/features/caption/timeline.ts#L199)、[导航清空当前轨](../src/features/caption/controller.ts#L219)。
- **触发**：某视频的轨道请求序号 1 成功缓存，当前 cue 被导航处理清空；同轨请求序号 2 发起后失败或中止。
- **机制与影响**：发起时已登记最新序号，但 fetch 拒绝没有失败结算，XHR 也没有相应的 abort/error/timeout 回退。恢复要求缓存序号等于最新请求序号，旧的有效缓存因此一直无法使用，后续字幕临时偏移操作可能得到空覆盖层。
- **证据**：真实拦截器与时间线探针中，序号 2 的 fetch 拒绝后，恢复查询返回空字符串。
- **修复方向**：为失败请求提供带序号的结算；仅当失败请求仍为当前所有者时恢复最近成功的轨道，旧失败不能覆盖后来成功的新请求。

### N07 · P2 · 工具箱和倍速菜单无法完成键盘操作

- **位置**：[工具箱触发器](../src/ui/toolbar/renderers.ts#L116)、[Popover 事件](../src/ui/toolbar/popover.ts#L125)、[倍速预设](../src/features/player/speed-button-view.ts#L135)、[倍速触发器](../src/features/player/speed-button-view.ts#L173)。
- **触发**：使用 Tab、Enter、Space 和 Escape 操作播放器扩展菜单。
- **机制与影响**：工具箱触发器是不可顺序聚焦的普通 `div`；倍速触发器虽然有 `tabIndex` 和按钮角色，但没有键盘激活处理。预设项是只响应点击的 `div`。普通 `div` 不会因为声明按钮角色而获得原生按钮的 Enter/Space 行为，键盘用户无法完成菜单打开和预设选择。
- **证据**：渲染节点类型与全部绑定事件的源码调用链确认；未新增执行测试。
- **修复方向**：使用原生按钮，补齐菜单的焦点移动、激活、Escape 关闭和焦点返回，避免快捷键分发器与菜单输入互相干扰。

### N08 · P2 · GM_addElement 返回 null 时被误判为注入成功

- **位置**：[页面注入适配器](../src/features/tabview/index.ts#L32)。
- **触发**：Tampermonkey 的 `GM_addElement` 返回 `null`，没有抛异常。
- **机制与影响**：代码忽略返回值并设置 `injected=true`，跳过原生 script fallback。页面 bundle 没有执行，沙箱只能等待 READY 超时，随后还会等待 teardown 确认。
- **证据**：源码分支确定；[Tampermonkey 官方 API 文档](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_addElement) 明确约定出错返回 `null`。当前 setup 测试只模拟成功注入，不覆盖该返回值。
- **修复方向**：用返回的元素确认注入结果，再进入备用注入或明确的失败结算；增加 `null` 返回的协议集成测试。

### N09 · P3 · HUD 复用其他播放器中的节点

- **位置**：[HUD 元素发现](../src/core/hud.ts#L59)。
- **触发**：旧播放器或迷你播放器中已有同 ID 的 HUD，当前路由播放器已改变。
- **机制与影响**：先在整个 document 中按 ID 查找，命中就不再查询当前播放器；当前视频的调速、循环或截图提示更新到旧播放器中。
- **证据**：旧容器已有 HUD、注册表指向新容器的探针复现提示仍进入旧节点。
- **修复方向**：先确定当前播放器，在该容器内复用或创建 HUD，并校验归属。

### N10 · P3 · 运行时字典覆盖与设置文案不完整

- **位置**：[字典](../src/i18n/locales.ts#L6)、[语言回退](../src/i18n/index.ts#L20)、[消息回退](../src/i18n/index.ts#L48)、[设置文案](../src/registry/settings-view.ts#L62)。
- **触发**：选择现有韩语等字典，或使用元数据提供名称翻译但运行时未提供字典的语言。
- **机制与影响**：运行时只有 13 个字典；元数据含 35 个名称语言标签，其中 20 个非英语标签没有相应运行时覆盖。相对英语的 69 个键，日语缺 15 个，另外 9 种字典各缺 29 个，合计缺 276 个语言—键组合。缺项包含功能标题、描述、状态和重试文案，设置面板会混入英文。
- **证据**：字典 AST 统计与设置视图的消息调用路径；英语回退仍保证功能可用，因此按 P3 归类。
- **修复方向**：补齐声明支持语言的运行时字典和键；元数据名称翻译与功能界面语言覆盖应分别准确说明，并增加字典完整性验证。

### N11 · P3 · 油猴设置菜单入口固定显示英文

- **位置**：[菜单注册](../src/main.ts#L32)、[现有中文键](../src/i18n/locales.ts#L120)。
- **触发**：在中文等界面语言下打开管理器脚本菜单。
- **机制与影响**：注册标签直接使用 `"Setting"`，没有调用已存在的 `action_setting` 翻译键。
- **证据**：菜单注册源码及字典键。
- **修复方向**：菜单入口与页面工具栏使用同一个本地化键。

### N12 · P3 · Windows 页面 bundle 开发热更新无法正确传播

- **位置**：[热更新 hook](../build/plugins/tabview-bundle.ts#L37)。
- **触发**：在 Windows 运行 `pnpm dev`，修改 `src/features/tabview/page/` 文件。
- **机制与影响**：`path.join()` 生成反斜杠片段，Vite watcher 使用规范化的正斜杠路径，条件不匹配；即使匹配，hook 只失效虚拟模块，没有把该模块交回更新流程。页面端源码由 esbuild 在 Vite 模块图外读取，常规 HMR 无法补偿。
- **证据**：本机 Vite 6.4.3 的 `normalizePath` 与 Node `path.join` 比较结果为不匹配；插件源码确认虚拟模块失效后未返回更新模块。生产构建通过，该问题影响开发更新。
- **修复方向**：统一路径规范，登记页面 bundle 的依赖，并将虚拟模块更新传入 HMR 流程。

## 待现场验证的边界

以下项目不能仅靠 jsdom 或故障注入证明 YouTube 当前会触发，不计入上述 12 项。优先采集与实际管理器、页面版本和请求形态关联的证据。

| 边界 | 本地机制与决定性验证条件 |
| --- | --- |
| 页面语言早期检测 | Locale 模块只检测一次。浏览器语言为西班牙语、导入后才出现法语页面语言的探针保持西班牙语；需确认真实注入时 `html.lang`/`ytcfg.HL` 的可用时序。 |
| 默认 Trusted Types 策略 | 页面没有默认策略且创建获准时，当前初始化创建字符串直通的默认策略；需确认页面 realm、CSP 策略 allowlist 和实际创建结果，再评估页面级影响。[Trusted Types 文档](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) |
| 跨 realm 的事件对象 | bridge 直接将 envelope 对象放进 `CustomEvent.detail`；需在管理器隔离 realm、Firefox 与 Chromium 配置下验证对象可读性。同 realm 测试无法代替此验证。[Mozilla 对象共享文档](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts) |
| 非文本 timedtext XHR | 修复后的拦截器按 responseType 委托原生 response getter，并结算轨道恢复状态，已补本地测试；YouTube 是否使用该类型仍需真实请求样本确认。[XHR 标准](https://xhr.spec.whatwg.org/) |
| 合成 fetch Response | 读取响应体后重建 Response 会改变 `url/redirected/type`，修改正文后复制的表示头也需核对；探针证明元数据改变，尚无实际调用方依赖这些字段的证据。[Fetch 标准](https://fetch.spec.whatwg.org/) |
| 当前视频切换与截图 | 控制器可能保留仍连接的旧视频，而截图尺寸另从注册表取新视频；探针复现两者分离，需验证导航或新视频 play 事件前是否存在可操作时间窗。 |
| 网格上游重排 | 旧锚点恢复会覆盖已搬运节点的新顺序；需确认 YouTube 是否在保留这些锚点时主动原地重排。 |
| 网格行包装器 | 直接子项若为 `ytd-rich-grid-row`，类型识别按 `other` 处理；需真实页面结构判断是否遗漏区块计数。 |
| 自动主题 | Cookie 逻辑只将 `f6=400` 认定为深色；需在“使用设备主题”且系统深色时采集 PREF 与实际显示状态，确认首次切换结果。[YouTube 主题帮助](https://support.google.com/youtube/answer/7385323?co=GENIE.Platform%3DDesktop&hl=en-uk) |
| 页面会话建立前异常 | 故障注入可使前置配置步骤抛错且不发送失败 ack；需实际启动异常样本判断是否应扩大错误结算范围。 |
| 极早 DOM 与外部依赖时序 | 样式挂载点缺失及构建生成的外部 SystemJS `@require` 下载时序需按管理器验证；不能据此断言正常启动失败。[Tampermonkey run-at 文档](https://www.tampermonkey.net/documentation.php?locale=en&q=run_at) |

广告 CSS 的启停路径已验证；仓库仍缺真实广告 DOM 样本，本轮不对线上广告覆盖率作结论。第三方下载服务及 Shorts 地址解析能力未进行线上验证。

## 已核对的契约与恢复路径

- 全局字幕默认偏移由请求拦截器应用到新加载的原生字幕；会话临时偏移决定覆盖层启停。覆盖层从原始 cue 按两者总偏移查询。会话偏移为零时停机符合这套分工。
- 单个已挂载插槽在无恢复事件时不会立即自愈，是 [ADR-0005](adr/0005-unified-slot-mount-bus.md) 的事件驱动取舍；全量插槽就绪后断开 observer。
- 设置切换在 starting/stopping 时仍可操作，由目标版本协调后续请求；已有错误与初始化重试入口。远端读取失败依赖后续事件重试，契约见 [ADR-0007](adr/0007-feature-state-storage.md)。
- 评论深链晚挂载有原型 attached 回调、replay 和评论子树观察补偿路径，未确认新的定位遗漏。
- 正常 Tabview 会话先建监听再注入，页面初始化成功才发 READY；初始化失败后的清理和 ack 路径有定向覆盖。
- Cookie 更新保留其他参数，彩虹进度条停用移除对应样式，阿拉伯语设置界面传递 RTL 方向。

## 修复顺序建议

1. 先统一启动与功能开关的所有权，处理 N01–N03；增加真实主入口组合测试，而不是只测试单个功能的 enable/disable。
2. 处理 N04–N06 与 N08：媒体身份、内容恢复、请求失败结算和注入结果，分别补正常/失败/重启路径。
3. 补齐 N07 的键盘交互；随后处理 HUD、翻译与开发热更新问题。
4. 对平台及页面时序风险采集决定性样本，确认后再扩展实现范围。

生产修复应继续保留页面/沙箱隔离、事件驱动、局部观察器及静默锁边界。后续验收需同时覆盖已保存的关闭状态刷新页面、迷你播放器下载、功能停用恢复、失败字幕请求后的临时校准、全键盘操作，以及真实 Tampermonkey/Violentmonkey 注入。
