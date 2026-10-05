# 第三轮缺陷修复报告

日期：2026-10-05。对应[第三轮审查报告](project-third-audit-report.md)与[修复方案](project-third-repair-plan.md)。

## 交付结果

H01–H12 共 12 项确认缺陷全部完成代码修复与回归覆盖。修复由五个子代理按模块实现，主代理整合后由四个独立子代理复审；字幕身份与缓存边界另外完成定向复核，未发现剩余确认缺陷。

| 编号 | 最终行为 | 主要源码与验证 |
| --- | --- | --- |
| H01 | 已挂载工具栏在同目标下同步新增、移除与替换动作；点击查询当前登记配置，同 ID 按钮复用并保留焦点 | [动作控制器](../src/ui/toolbar/toolbar.ts)、[渲染器](../src/ui/toolbar/renderers.ts)、[挂载总线](../src/ui/toolbar/slot-mount-bus.ts)、[真实下载服务集成测试](../src/ui/toolbar/__tests__/toolbar-actions.integration.test.ts) |
| H02 | Shorts 下载入口使用带可访问名称的原生 button，可聚焦并遵循浏览器标准键盘激活行为 | [渲染器](../src/ui/toolbar/renderers.ts)、[按钮语义与焦点测试](../src/ui/toolbar/__tests__/toolbar-actions.integration.test.ts) |
| H03 | 有效空轨道替换旧显示并保留空缓存；解析失败结算失败，按请求序号恢复此前有效轨道 | [时间轴](../src/features/caption/timeline.ts)、[JSON/XML 与序号恢复测试](../src/features/caption/__tests__/timeline.test.ts) |
| H04 | 默认字幕偏移先持久化，再提交内存状态；写入失败保持有效偏移，并在设置面板显示本地化错误与重试入口 | [字幕控制器](../src/features/caption/controller.ts)、[设置面板](../src/registry/settings-view.ts)、[状态一致性测试](../src/features/caption/__tests__/controller.test.ts)、[界面重试测试](../src/registry/__tests__/settings-view.test.ts) |
| H05 | 多个未完成分区及不满足等价条件的新分区追加走完整重算；安全尾部追加保留增量路径 | [计算器](../src/features/grid/calculator.ts)、[协调器](../src/features/grid/coordinator.ts)、[原生观察器批次等价测试](../src/features/grid/__tests__/coordinator.test.ts) |
| H06 | 迷你浏览器实例持有 loadstart 监听，销毁时移除；重新启动只安装一份当前监听 | [路由器](../src/features/tabview/page/minibrowser-router.ts)、[销毁与重新启动测试](../src/features/tabview/page/__tests__/minibrowser-router.test.ts) |
| H07 | 读取响应副本；停用、零偏移和异常回退返回可读取的原响应；204/205 保留 null 正文和成功结果 | [拦截器](../src/features/caption/interceptor.ts)、[无正文与销毁竞态测试](../src/features/caption/__tests__/interceptor-lifecycle.test.ts) |
| H08 | 字幕启用完成后同步已保存的设置数值；正常编辑与待重试输入在状态刷新时得到保留 | [设置面板](../src/registry/settings-view.ts)、[启用同步与编辑测试](../src/registry/__tests__/settings-view.test.ts) |
| H09 | 路由重置立即撤销排队任务、旧网格观察器和临时挂载观察器；重新进入后监听当前目标 | [协调器](../src/features/grid/coordinator.ts)、[离开与重新进入测试](../src/features/grid/__tests__/coordinator.test.ts) |
| H10 | 当前语言注册翻译后立即同步查询、方向和快照；其他语言注册保持当前语言 | [语言模块](../src/i18n/index.ts)、[注册翻译测试](../src/i18n/__tests__/locale-registration.test.ts) |
| H11 | update-locale 原地更新已有标签和可访问名称，保留评论数、活动 Tab、字号、节点、用户输入和回调 | [视图](../src/features/tabview/page/tabs-view.ts)、[协调器](../src/features/tabview/page/coordinator.ts)、[协议集成测试](../src/features/tabview/__tests__/setup.test.ts) |
| H12 | 省略 videoId 时通过已登记请求、缓存或已知路由身份识别完整视频 ID；缓存恢复与清理按明确视频身份匹配 | [时间轴](../src/features/caption/timeline.ts)、[视频及语言参数下划线测试](../src/features/caption/__tests__/timeline.test.ts) |

## 关键契约

字幕轨道只有在解析结果有效时才结算成功。有效空轨道是一份可恢复的成功结果；损坏 JSON/XML 是失败。较新的同轨道请求失败时，可以恢复此前的空轨道，不能错误恢复更早的其他语言内容。

请求拦截读取 clone，不消费页面需要读取的原响应。生命周期失效与处理异常可以安全返回原对象；无正文成功响应不通过字符串重建。仍需实际偏移时才返回修改后的响应。

轨道 key 保持现有形式，身份来自已知完整视频 ID，避免根据下划线数量拆解视频、语言和翻译语言。没有请求记录、缓存身份或对应路由信息的离线调用应传入既有的显式 videoId 参数。

工具栏渲染按动作 ID 复用按钮，事件通过当前登记记录执行；登记 owner、执行互斥和异步生命周期隔离继续生效。同目标路由事件也刷新动作可见性，隐藏后重新进入可以正常挂载。

网格在不能保证增量与完整结果一致时恢复源锚点并完整计算。导航时先撤销旧代任务与观察资源，再恢复布局及挂载当前目标；未引入轮询或全局无边界观察器。

## 验证结果

- `pnpm check`：通过。
- `pnpm test --maxWorkers=2`：49 个测试文件、443 项测试全部通过。
- `pnpm build`：通过，包含严格类型检查和页面端注入打包，生成 `dist/youtube-turbo.user.js`。
- `git diff --check`：通过。
- 独立子代理复审：字幕与设置、工具栏、网格、页面生命周期与语言四个方向，已收齐结论；字幕身份补充修改完成定向复核。

完整测试覆盖共享工作树中的 Tabview 原生面板改动，包含章节面板原生初始化、面板关闭命令与布局协调；这些改动同样纳入分批提交，未计入 H01–H12 的新增修复。修复随 1.1.8 交付，发布说明见 [1.1.8 版本发布说明](release-1.1.8.md)。

当前可用的浏览器自动化入口只有内置浏览器，没有已连接的 Tampermonkey/Violentmonkey 浏览器。因此未完成真实 YouTube/油猴端到端验收。原生按钮的实际页面焦点外观，以及审查报告中需要真实上游样本的其他边界，仍需在该环境验证；本地测试和构建不等同于该项验收。
