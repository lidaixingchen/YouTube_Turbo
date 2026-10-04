# YouTube Turbo 第二轮修复与验证报告

日期：2026-10-05（Asia/Hong_Kong）。修复基线：`351b1087d5829f797cdce565709736acfa5b42c8`，版本 `1.1.6`。

## 交付结论

[第二轮审查](project-second-audit-report.md) 确认的 N01–N12 均已修复。9 个子 Agent 按模块实施，随后对启动、多语言、字幕和 Tabview 进行交叉审查，主代理完成整合与统一验证。新增回归覆盖启动失败重试、保存为关闭的功能、请求失败恢复、DOM 还原、键盘交互和开发更新。

严格类型检查通过；全量 Vitest **48 个文件、410 项测试通过**；生产构建通过。修复按功能边界提交，随 `1.1.7` 补丁版本交付；发布验收记录见 [版本说明](release-1.1.7.md)。

## 逐项修复

| 编号 | 最终行为 | 主要实现与回归 |
| --- | --- | --- |
| N01 | 设置入口和工具栏先建立，播放器初始化由功能调度；读取失败不确认初始化，已注册监听器能够释放，同值重试可以恢复。入口捕获启动拒绝。 | [启动](../src/core/bootstrap.ts)、[播放器](../src/features/player/controller.ts)、[启动集成](../src/core/__tests__/bootstrap.integration.test.ts)、[主入口](../src/__tests__/main.test.ts) |
| N02 | 播放器基础初始化只管理基础状态；循环功能获准启用后才恢复保存值。独立功能键为关闭时，旧整合状态及保存的循环值不会开启循环。 | [循环功能](../src/features/player/loop-feature.ts)、[功能描述符](../src/registry/descriptors.ts)、[播放器功能回归](../src/features/player/__tests__/player-features-decoupling.test.ts) |
| N03 | 下载操作由下载描述符统一启停，保存为关闭的功能在刷新后保持关闭。 | [主启动](../src/core/bootstrap.ts)、[启动集成](../src/core/__tests__/bootstrap.integration.test.ts) |
| N04 | 下载校验 YouTube watch/Shorts 路由及视频身份，开始操作时保存完整地址；无可靠身份时隐藏动作并终止调用。 | [媒体身份](../src/features/download/media-identity.ts)、[下载动作](../src/features/download/__tests__/download-actions.test.ts)、[身份回归](../src/features/download/__tests__/media-identity.test.ts) |
| N05 | 每条搬运路径记录锚点、源父节点与邻接位置；替换目标前还原旧内容。锚点或源位置失效时保全内容，旧路由完全断连后释放旧所有权，使新路由可以正常挂载。 | [搬运器](../src/features/tabview/page/relocator.ts)、[搬运回归](../src/features/tabview/page/__tests__/relocator.test.ts) |
| N06 | 每视频请求所有权与成功缓存分开管理。最新请求失败后开放缓存恢复；旧失败与在途旧响应不能抢占新请求。fetch 与 XHR 的拒绝、异常及 HTTP 失败均能结算。 | [请求拦截](../src/features/caption/interceptor.ts)、[时间线](../src/features/caption/timeline.ts)、[失败回归](../src/features/caption/__tests__/interceptor-failure.test.ts)、[生命周期](../src/features/caption/__tests__/interceptor-lifecycle.test.ts) |
| N07 | 工具箱、倍速触发器和选项使用原生按钮；菜单支持方向键、Home/End、Escape、Tab 离开关闭及可见焦点。快捷键调度在捕获阶段识别菜单上下文，保持普通按钮的快捷键行为。 | [Popover](../src/ui/toolbar/popover.ts)、[快捷键](../src/core/shortcuts.ts)、[键盘回归](../src/ui/toolbar/__tests__/popover-keyboard.test.ts)、[快捷键集成](../src/core/__tests__/shortcuts.test.ts) |
| N08 | `GM_addElement` 返回真实 script 元素才确认成功；空值或异常使用原生注入。相同 bootstrap 重复执行时只创建一个页面会话，命令与 teardown 各执行一次，新 session 可以重新启动。 | [注入适配](../src/features/tabview/index.ts)、[页面会话](../src/features/tabview/page/index.ts)、[注入回归](../src/features/tabview/__tests__/setup.test.ts) |
| N09 | HUD 只复用自己持有、属于当前播放器的节点；切换播放器释放旧节点与动画，隐藏及销毁操作保持节点归属。 | [HUD](../src/core/hud.ts)、[归属回归](../src/core/__tests__/hud.test.ts) |
| N10 | 33 份运行时字典均覆盖 69 个基础键，覆盖元数据的 35 个名称语言标签；区域标签使用相应基础字典，ar/he/ug 为 RTL。 | [字典入口](../src/i18n/locales.ts)、[欧洲语言](../src/i18n/locale-europe.ts)、[全球语言](../src/i18n/locale-global.ts)、[语言契约](../src/i18n/__tests__/locale-dictionaries.test.ts) |
| N11 | 管理器菜单和页面设置按钮统一使用 `action_setting` 本地化文案。 | [启动](../src/core/bootstrap.ts)、[启动集成](../src/core/__tests__/bootstrap.integration.test.ts) |
| N12 | 统一 Windows/Unix 路径匹配，开发模式登记 esbuild 输入依赖，并将失效的虚拟模块返回 Vite 更新流程；当前导入链由 Vite 传播为页面重载。 | [构建插件](../build/plugins/tabview-bundle.ts)、[真实 Vite 更新测试](../build/plugins/__tests__/tabview-bundle.test.ts) |

## 生命周期与资源验证

- 同一 XHR 重复成功、请求替换、abort/error/timeout、HTTP 失败、send 抛错及 destroy 均释放监听器；实例 response getter 保持原生委托与请求隔离。
- Tabview 覆盖锚点丢失、源父节点移除、整个旧根断连、重复同步、卸载后挂载与销毁后重新初始化；还原及物理移动继续使用静默锁。
- 注入回归真实执行备用脚本，检查重复 bootstrap 的命令和 teardown 次数，以及新会话重试。
- 菜单覆盖禁用项跳过、焦点导航、外部关闭、销毁资源清理和异步动作锁；全局快捷键抑制通过实际 Dispatcher 事件绑定验证。

## 统一验证

模块整合阶段使用仓库已安装的 Node 工具执行对应命令；交付阶段使用 pnpm 再次通过 `check`、全量 `test` 和 `build`。运行依赖版本保持原状，包管理器固定为 `pnpm@12.4.2`，锁文件登记对应包管理器依赖。GitHub Actions 在 Windows/Linux 使用锁定依赖执行同一验证流程并保存脚本产物。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 严格类型 | `node node_modules/typescript/bin/tsc --noEmit` | 通过 |
| 全量回归 | `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --pool=threads` | 48 个文件、410 项通过 |
| 最终启动与注入核对 | `node node_modules/vitest/vitest.mjs run src/__tests__/main.test.ts src/core/__tests__/bootstrap.integration.test.ts src/features/tabview/__tests__/setup.test.ts --maxWorkers=1 --pool=threads` | 3 个文件、16 项通过 |
| 生产构建 | `node node_modules/vite/bin/vite.js build` | 71 个模块，生成 `dist/youtube-turbo.user.js`，约 729.43 kB |
| 补丁格式 | `git diff --check` | 通过 |

## 现场验收边界

本轮没有完成真实 YouTube 与 Tampermonkey/Violentmonkey 端到端验收。jsdom 验证原生按钮语义和焦点导航，实际浏览器的 Enter/Space 原生激活仍需验收。首页及订阅页迷你播放器没有已确认的视频身份来源，下载入口保持隐藏；第三方服务及 Shorts 下载能力需线上确认。

管理器 realm、Firefox 事件对象共享、Trusted Types/CSP、外部 `@require` 与极早 DOM 时序，以及真实页面语言、网格结构、主题 Cookie、截图切换窗口和合成 Response 元数据依赖，仍按审查报告中的条件采集现场证据。全局字幕默认偏移继续由请求拦截器应用，会话临时偏移负责覆盖层启停；插槽与网格保留事件驱动、局部观察器和静默锁边界。
