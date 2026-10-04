# YouTube Turbo 全项目缺陷修复与验证报告

日期：2026-10-04（Asia/Hong_Kong）。项目版本：`1.1.5`。变更基于 `28e32b2ce76e173417e5cf5718c2d3527f5760c5`。

## 交付结论

**B01–B19 共 19 项确认缺陷及独立复审确认的 5 项边界问题已修复。** 原缺陷为 15 项 P2、4 项 P3，复审补充项均为 P2。每项都有行为回归依据；最终类型检查、完整测试及生产构建通过。39 个测试文件、352 项测试全部通过，比审查基线新增 68 项测试。

8 个并行子 Agent 按独立模块完成审查与修复，5 个独立子 Agent 完成提交前复审；主代理负责设计、集成、边界补充、文档和全量验证。覆盖运行时与设置、Tabview 会话/原型/布局/适配器、字幕、播放器/工具栏/弹窗、网格/主题/下载/广告，以及启动/多语言/元数据/构建。结构查询优先使用 CodeGraph；回归检查实际 DOM、存储值、字幕文本、异步结算及操作次数。

功能 ID、描述符顺序、公开设置接口、沙箱与页面隔离及事件驱动边界保持一致。真实 YouTube 与 Tampermonkey/Violentmonkey 端到端验收尚未执行；下文条件性风险不计入已修复的 19 项。

## 逐项修复与回归

| 编号 | 优先级 | 当前实现 | 回归测试 |
| --- | --- | --- | --- |
| B01 | P2 | [DOM 注册表](../src/core/dom-registry.ts) 从可见路由根查询并关联缓存 URL/根；Shorts 限定活跃 reel，迷你播放器局部回退。 | [DOM 测试](../src/core/__tests__/dom-registry.test.ts)：隐藏旧页与当前页三查询、连接旧节点、Shorts 多 reel、迷你播放器及缓存。 |
| B02 | P2 | [存储](../src/core/storage.ts) 与 [注册表](../src/registry/feature-registry.ts) 按功能独立写入，独立键优先，缺失时回退旧对象；初始化不迁移写入。 | [注册表测试](../src/registry/__tests__/feature-registry.test.ts)：两个实例交错修改不同功能、旧值回退、独立值优先、初始化不写入。 |
| B03 | P3 | [注册表](../src/registry/feature-registry.ts) 保留读取失败的同步需求，在新通知、显式刷新或恢复可见时重试；初始化失败清理监听。 | [注册表测试](../src/registry/__tests__/feature-registry.test.ts)：读取失败后恢复、可见性触发及监听释放。 |
| B04 | P3 | [PolymerHelper](../src/features/tabview/page/polymer-helper.ts) 在 CustomElementRegistry 共享底层等待表，消费者独立取消，定义后释放记录。 | [等待器测试](../src/features/tabview/page/__tests__/polymer-helper.test.ts)：模块重载、部分/全部取消、迟到定义和记录释放。 |
| B05 | P2 | [About 导航](../src/features/tabview/page/minibrowser-router.ts) 新导航取消旧监听和定时器，执行与点击前核对 token。 | [导航测试](../src/features/tabview/page/__tests__/minibrowser-router.test.ts)：快速连续导航仅点击当前按钮一次。 |
| B06 | P3 | [频道适配器](../src/features/tabview/page/channel-hover-adapter.ts) 按当前溢出测量添加或移除缩放类。 | [频道测试](../src/features/tabview/page/__tests__/channel-hover-adapter.test.ts)：宽度恢复时清理状态。 |
| B07 | P2 | [资讯镜像](../src/features/tabview/page/info-mirror-engine.ts) 保存并复用源节点绑定，替换/销毁时断开观察器并释放所拥有的信号包装。 | [镜像测试](../src/features/tabview/page/__tests__/info-mirror-engine.test.ts)：重复绑定、源替换、销毁后通知和资源释放。 |
| B08 | P2 | [资讯镜像](../src/features/tabview/page/info-mirror-engine.ts) 收到有效通知时同步当前数据，不以引用相等丢弃更新。 | [镜像测试](../src/features/tabview/page/__tests__/info-mirror-engine.test.ts)：同对象就地修改经信号通知同步。 |
| B09 | P2 | [资讯镜像](../src/features/tabview/page/info-mirror-engine.ts) 独立记录两类脏工作，统一微任务冲刷；旧生命周期任务不消费新状态。 | [镜像测试](../src/features/tabview/page/__tests__/info-mirror-engine.test.ts)：两种调度顺序、销毁后迟到工作和重初始化。 |
| B10 | P2 | [字幕控制器](../src/features/caption/controller.ts) 根据 [watch/Shorts 身份](../src/features/caption/video-identity.ts) 激活匹配响应，其他响应只缓存；[拦截器](../src/features/caption/interceptor.ts) 在途请求绑定启用周期。 | [控制器](../src/features/caption/__tests__/controller.test.ts)、[响应交错](../src/features/caption/__tests__/interceptor.test.ts)、[请求生命周期](../src/features/caption/__tests__/interceptor-lifecycle.test.ts)：新旧响应、Shorts、停用/重启及读取响应体期间停用。 |
| B11 | P2 | [时间线](../src/features/caption/timeline.ts) 用前缀最大结束时间索引安全停止回查，保留仍有效的长字幕。 | [时间线测试](../src/features/caption/__tests__/timeline.test.ts)：长短 cue 重叠、seek、边界及分段缓存。 |
| B12 | P2 | [渲染器](../src/features/caption/renderer.ts) 记录实际隐藏类容器，替换、关闭字幕和销毁时恢复该容器。 | [渲染器测试](../src/features/caption/__tests__/renderer.test.ts)：断开后替换、CC 关闭和销毁。 |
| B13 | P2 | [网格](../src/features/grid/coordinator.ts) 排队任务绑定生命周期代次，停用/重启/路由变化使旧任务失效。 | [网格测试](../src/features/grid/__tests__/coordinator.test.ts)：停用、重启和导航后旧工作不修改新状态。 |
| B14 | P2 | [网格](../src/features/grid/coordinator.ts) 检查新增尾段，仅真实追加走增量，中段插入完整重排。 | [网格测试](../src/features/grid/__tests__/coordinator.test.ts)：六张视频第三项前插分区后索引为 4，普通追加保留增量路径。 |
| B15 | P2 | [下载](../src/features/download/index.ts) 使用 URL/URLSearchParams 编码完整视频地址，服务参数集中到 [常量](../src/features/download/constants.ts)。 | [下载测试](../src/features/download/__tests__/download-actions.test.ts)：包含多个查询参数的完整 URL。 |
| B16 | P2 | [下载](../src/features/download/index.ts) 在等待确认前保存目标 URL，导航不会改变目标。 | [下载测试](../src/features/download/__tests__/download-actions.test.ts)：确认期间从 A 导航到 B，仍下载 A。 |
| B17 | P2 | [PiP](../src/features/player/pip-feature.ts)、[截图](../src/features/player/screenshot-feature.ts)、[下载入口](../src/features/download/index.ts) 返回完整 Promise，由工具栏统一持锁和处理失败。 | [播放器动作](../src/features/player/__tests__/async-toolbar-actions.test.ts)、[下载](../src/features/download/__tests__/download-actions.test.ts)：待决时双击一次请求、拒绝后可重试。 |
| B18 | P2 | [TabsView](../src/features/tabview/page/tabs-view.ts) 每次渲染新面板应用已保存字号。 | [字号测试](../src/features/tabview/page/__tests__/tabs-view.test.ts)：各 Tab 重渲染后样式与状态一致。 |
| B19 | P3 | [Modal](../src/ui/modal/modal.ts) 确认、取消、关闭回调抛错时 reject；无回调结果不变，alert 关闭异常也会结算。 | [弹窗测试](../src/ui/modal/__tests__/modal-confirm.test.ts)：正常三路径及异常结算。 |

[播放器状态机测试](../src/features/player/__tests__/controller-shortcuts.test.ts) 使用 watch 根夹具，保留节点替换、自愈与播放捕获行为断言。

### 独立复审覆盖的边界

| 编号 | 当前实现 | 回归测试 |
| --- | --- | --- |
| R01 | Shorts 活跃 reel 暂无视频时返回空值；等待器观察节点挂载及 `is-active` 变化。 | [DOM 测试](../src/core/__tests__/dom-registry.test.ts)：非活跃 reel 有视频、活跃 reel 暂无视频，以及 reel 激活后的视频发现。 |
| R02 | 缓存记录实际媒体根并检查包含关系、reel 活跃状态。 | [DOM 测试](../src/core/__tests__/dom-registry.test.ts)：同 URL 切换活跃 reel、已连接节点被移出所属根。 |
| R03 | fetch/XHR 共用每视频请求序号；仅最新响应可激活及应用偏移，旧同轨响应不能覆盖较新缓存，恢复时校验轨道和序号。 | [拦截器](../src/features/caption/__tests__/interceptor.test.ts)、[XHR 生命周期](../src/features/caption/__tests__/interceptor-lifecycle.test.ts)、[控制器](../src/features/caption/__tests__/controller.test.ts)：旧响应先到、后到和同轨重复请求。 |
| R04 | Coordinator 销毁时取消 About 导航监听和定时器，使旧 token 失效。 | [导航](../src/features/tabview/page/__tests__/minibrowser-router.test.ts)、[Coordinator](../src/features/tabview/page/__tests__/coordinator.test.ts)：导航完成前后停用，以及后续生命周期导航。 |
| R05 | 弹窗关闭后依次执行动作和关闭回调，各一次；回调抛错继续执行后续回调，以首个异常拒绝 Promise。 | [弹窗测试](../src/ui/modal/__tests__/modal-confirm.test.ts)：组合异常、全部关闭渠道的顺序和重复关闭。 |

## 关键契约

### 功能持久化

独立键为 `yt/functionState_01/<featureId>`，统一通过 `StorageKeys.youtube.functionStateForFeature(id)` 生成。旧 `yt/functionState_01` 保留作缺失值来源，读取过程不写迁移数据。不同功能的并发写入隔离，同一功能以最后持久化值为准。

已存在独立键的功能始终以独立值为准，不承诺与继续写旧整对象的旧版本标签页双向同步。远端通知触发完整快照重读；读取失败按事件恢复，不使用轮询。完整契约见 [持久化 ADR](adr/0007-feature-state-storage.md)。

### 当前节点与异步所有权

WeakRef 缓存关联可见根和 URL，并随路由失效；连接状态不能单独证明当前页面归属。镜像与网格旧微任务不能消费新一轮状态，网格搬运继续使用静默锁及锚点恢复。

自定义元素底层等待器按注册表共享；字幕隐藏类绑定实际容器，在途 fetch/XHR 绑定启用周期。停用后旧请求不入库、不改写字幕响应，也不会重新激活覆盖层。

### 字幕与 UI

watch 使用视频查询参数，Shorts 使用路径身份。迟到响应只可缓存，不能接管其他视频或较新请求的轨道；缓存恢复遵循最新请求的轨道与序号。当前解析契约将每个 timedtext 响应作为完整字幕轨。全局默认偏移用于新加载的视频，临时偏移随切视频重置，RAF 闸门保持按需运行。

工具栏持有完整异步动作，下载确认使用开始时的目标。弹窗回调异常通过 Promise rejection 传递，等待者不会永久挂起。

## 最终验证

| 检查 | 实际命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `node node_modules/typescript/bin/tsc --noEmit` | 退出码 0 |
| 全量测试 | `node node_modules/vitest/vitest.mjs run` | 退出码 0；39 文件，352/352 通过 |
| 生产构建 | 类型检查后执行 `node node_modules/vite/bin/vite.js build` | 退出码 0；67 模块；552.79 kB，gzip 121.60 kB |
| 格式检查 | `git -c core.safecrlf=false diff --check` | 退出码 0 |

本机 `pnpm check` 因用户级 `config.yaml` 读取 EPERM 未进入项目脚本，最终使用已安装的仓库工具执行等价检查。未安装依赖、清理 node_modules 或改锁文件；没有临时审计测试残留。

产物为 `dist/youtube-turbo.user.js`。已检查浏览器环境：仅提供 Codex 内置浏览器，未连接可加载油猴扩展的 Chrome/Edge 会话。本轮未进行 Tampermonkey/Violentmonkey 端到端验证，也未验证第三方下载服务可用性。

## 需要现场验证的条件性风险

下列关键触发条件尚缺真实页面证据，不计入 19 项确认缺陷的修复结论。

| 项目 | 验证条件 |
| --- | --- |
| 语言初始化时序 | document-start 时 html.lang/页面 HL 尚不可读，且浏览器语言与 YouTube 不同。 |
| 评论深链晚挂载 | 评论根晚于初次同步，确认挂载钩子或后续事件是否补偿定位。 |
| 搬运锚点丢失 | YouTube 单独移除锚点但保留被搬运内容，检查退出时源节点恢复。 |
| 字幕轨道身份 | 采集同视频不同 kind/vssId、音轨及分段请求，检查 v/lang/tlang 缓存键与完整轨响应契约是否适用。 |
| JSON timedtext XHR | 确认是否使用非文本 responseType 及 responseText 的浏览器读取限制。 |
| IIFE 延迟注入 | 确认是否存在先发 teardown、后执行页面入口的管理器时序。 |
| 上游网格卡片重排 | 确认 YouTube 主动更改已搬运卡片顺序后，锚点恢复是否覆盖新顺序。 |

jsdom 的 observer 替身不模拟真实布局与全部通知顺序。现场验收至少覆盖快速 watch→watch、Shorts 切换、离开再返回、连续启停、双标签页设置、字幕切轨、隐藏旧页并存，以及下载确认期间导航。

## 相关文档

- [修复设计](project-bug-repair-plan.md)
- [DOM 句柄缓存决策](adr/0004-reactive-dom-registry-caching.md)
- [功能状态持久化决策](adr/0007-feature-state-storage.md)
- [项目说明](../README.md)
- [领域词汇](../CONTEXT.md)
