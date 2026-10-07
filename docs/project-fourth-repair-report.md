# 第四轮缺陷修复验收报告

日期：2026-10-07。修复基于 `v1.1.8`，覆盖[第四轮审查报告](project-fourth-audit-report.md)的 J01–J08，实现契约见[修复方案](project-fourth-repair-plan.md)。

## 交付结果

8 项确认缺陷均已完成代码或文档修复，并补充必要的正常行为回归。4 个实现子代理分别负责字幕显示、字幕请求改写、工具栏与模态、Tabview 协议与导航；3 个独立审查子代理复核最终实现。主代理负责整合、安装入口与全项目验证。

| 项目 | 当前行为 | 实现与验证位置 |
| --- | --- | --- |
| J01 字幕轨道所有权 | 时间轴记录完整活动轨道身份；当前视频切换不同 key 时立即撤销旧显示并重绘；同轨刷新保留有效内容，其他视频预取不清空显示；最新失败可恢复缓存 | [时间轴](../src/features/caption/timeline.ts)、[控制器](../src/features/caption/controller.ts)、[控制器测试](../src/features/caption/__tests__/controller.test.ts)、[时间轴测试](../src/features/caption/__tests__/timeline.test.ts)、[渲染测试](../src/features/caption/__tests__/renderer.test.ts) |
| J02 异步动作互斥 | 执行锁随 Promise 结算释放；确认等待不会因计时到期而放行；注销、销毁和重新初始化保留执行代际隔离 | [工具栏](../src/ui/toolbar/toolbar.ts)、[动作测试](../src/ui/toolbar/__tests__/toolbar-actions.test.ts)、[真实下载集成测试](../src/ui/toolbar/__tests__/toolbar-actions.integration.test.ts) |
| J03 模态焦点 | dialog 语义、名称、初始焦点、Tab 顺序、内部键盘事件、顶层弹窗、关闭恢复均协调；弹窗活动时背景快捷键暂停；工具箱关闭保留弹窗焦点；关闭标签覆盖 33 种语言 | [模态组件](../src/ui/modal/modal.ts)、[常量](../src/ui/modal/constants.ts)、[快捷键](../src/core/shortcuts.ts)、[工具箱焦点协调](../src/ui/toolbar/popover.ts)、[模态测试](../src/ui/modal/__tests__/modal-confirm.test.ts) |
| J04 安装入口 | 版本文案、附件地址及发布说明同步本次交付的 1.1.9 | [README](../README.md)、[发布说明](release-1.1.9.md) |
| J05 片段跨零时间 | 事件起点裁剪到零时同步裁剪片段相对偏移，平移后的绝对时间一致；缺省片段偏移保留 | [字幕拦截器](../src/features/caption/interceptor.ts)、[时间与响应测试](../src/features/caption/__tests__/interceptor-j05-j08.test.ts) |
| J06 字号协议 | 页面字号范围派生自共享协议的 10–24px，按钮通知使用实际限幅后的值 | [页面常量](../src/features/tabview/page/constants.ts)、[字号控件](../src/features/tabview/page/tabs-view.ts)、[字号测试](../src/features/tabview/page/__tests__/tabs-view.test.ts)、[配对会话测试](../src/features/tabview/__tests__/session.test.ts) |
| J07 国际化频道路径 | URL 路径逐段解码，支持编码后的中文、日文、阿拉伯文 handle 和合法分隔符；query/hash 不影响 About 识别，原生导航照常委托 | [迷你浏览器路由](../src/features/tabview/page/minibrowser-router.ts)、[路由测试](../src/features/tabview/page/__tests__/minibrowser-router.test.ts) |
| J08 字幕响应一致性 | 改写结果保持真实 Response，实例元数据随 clone 的实际接收者传递；移除失效表示头；XHR 在 DONE 首次读取头部时先完成正文改写判断，复用与销毁恢复原生头方法 | [字幕拦截器](../src/features/caption/interceptor.ts)、[时间与响应测试](../src/features/caption/__tests__/interceptor-j05-j08.test.ts)、[失败回退测试](../src/features/caption/__tests__/interceptor-failure.test.ts) |

## 核心验收证据

字幕测试通过控制器实际请求回调验证：切换语言后等待期为空，新请求失败后恢复有效缓存，其他视频预取不改变当前显示，同轨刷新保留字幕。覆盖层重绘可即时清空旧内容；有效空成功、旧请求隔离和完整 videoId 缓存契约继续保留。

工具栏测试使用真实下载确认链，等待 6 秒后再次触发仍只有一个确认框；取消后可重试，确认只打开一次下载页。异常结算、注销并重新注册、destroy/reinit 后旧结果不释放新锁均有回归。

模态测试覆盖内部 ArrowUp/Enter 按键可达、后代可消费 Escape/Tab、背景快捷键抑制、负 tabindex、禁用 fieldset、CSS 隐藏祖先、空候选容器回退、正 tabindex 顺序、嵌套 Escape 仅关闭最上层，以及关闭后原触发控件已脱离的情况。实际工具箱关闭与模态恢复焦点通过下载集成测试。

字幕网络测试覆盖跨零数学、原生 Response brand、独立与多层 clone、合法借用 clone、正文消费后 clone 抛错、保留正文读取以及失效表示头。XHR 的页面回调在 `send()` 前登记，并在 DONE 先读 Content-Length、再读正文，验证首次头部读取已与改写结果一致。复用、停用、失败回退、零偏移和 204/205 的既有契约继续通过测试。

字号按钮在上下限连续操作时通知实际值，配对会话正常接收合法事件。频道路径测试通过实际导航包装器覆盖多语言编码路径、频道 ID、`c`、`user`、query/hash 和无效编码的原生委托。

独立复核最终未发现阻断问题。定向测试与完整回归的结果按各自范围记录，不将重复执行的测试数量累加。

## 全项目验证

主代理完成以下全项目验证：

- `pnpm check`：严格类型检查通过。
- `pnpm test --maxWorkers=2`：50 个测试文件、471 项测试全部通过；相较审查基线净增加 1 个测试文件、28 项测试。
- `pnpm build`：TypeScript 检查及 Vite 生产构建通过，72 个模块转换成功，生成 `dist/youtube-turbo.user.js`（763.51 kB）。
- `git diff --check`：通过；三份第四轮文档的相对链接检查通过。
- 独立审查临时探针已逐一删除；工作区保留正式实现、回归测试和交付文档。

## 适用边界

真实 YouTube/Tampermonkey/Violentmonkey 端到端验收尚未完成；自动化测试不能证明上游所有 DOM 替换、视频活动标记或扩展 realm 行为。[审查报告](project-fourth-audit-report.md)中列出的条件性边界仍需要真实上游样本，未扩大为额外架构修改。

J08 的元数据协调作用于响应实例及其 clone 方法；直接调用 `Response.prototype.clone.call(response)` 使用底层原生元数据。改写响应的 headers 具有构造响应的可变语义，正文、头部读取值和 clone 路径已验证；未将这一接口包装描述为完全复刻网络响应的内部 guard。

本轮交付版本为 1.1.9，包版本、油猴元数据、README 安装入口及发布说明一致。实现、测试和文档按模块分批提交；发布使用最终版本提交在 Windows/Linux CI 全部通过后生成的 Ubuntu 用户脚本产物。
