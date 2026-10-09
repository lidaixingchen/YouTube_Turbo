# 第五轮修复验收报告

日期：2026-10-09。修复基线：`v1.1.9` / `c7ae139`。对应[第五轮审查报告](project-fifth-audit-report.md)及[修复方案](project-fifth-repair-plan.md)。

## 修复结果

本轮完成 K01–K03 三项确认问题的实现与回归，保留条件性观察的证据边界。生产代码、测试与文档按模块交付，版本为 1.1.9。

| 问题 | 最终行为 | 回归范围 |
| --- | --- | --- |
| K01 | 标签和字号操作均采用原生按钮，平级组合；活动状态与受控面板关联同步；鼠标悬停或焦点处于标签组时字号操作可见 | 焦点、按钮结构、活动/面板状态、独立单次动作、字号上下限、评论计数、动态语言名称 |
| K02 | 参数保留现有 HTML 转义规则，转义后的值通过替换回调按字面值插入 | `$$`、`$&`、美元前后文替换序列、普通文本、数值、HTML 字符、重复占位符 |
| K03 | 以原生 `open()` 成功为提交点；失败重开保留旧请求；同步重入按有效 open 身份隔离正文、监听及响应头装饰 | 抛错时接收者/参数/异常透传，旧请求继续摄入及改写，成功复用，事件内 send/nested open，非字幕同步发送，销毁重装及新拦截器接管 |

## 实现说明

### Tabview 交互与语言

[TabsView](../src/features/tabview/page/tabs-view.ts)将标签按钮和字号按钮放入同一平级组，避免嵌套交互元素。保留既有 ID、类名与面板数据属性，标签使用 `aria-pressed` 和 `aria-controls` 表达状态及关联，面板同步 `aria-hidden`。原生按钮负责 Enter/Space 激活，业务仅处理一次 click，不额外合成重复点击。

[样式](../src/features/tabview/tabview.css)保持等宽分组布局，隐藏标签时同步隐藏整组；`:focus-within` 让焦点从标签进入字号按钮后持续显示控件。新增可见焦点样式。

33 种内置语言补齐评论标签、增大字号和减小字号文案，页面快照提供完整名称。动态更新标签名称时保留评论数量与当前页面内容。对应[页面测试](../src/features/tabview/page/__tests__/tabs-view.test.ts)和[字典测试](../src/i18n/__tests__/locale-dictionaries.test.ts)。

### 翻译字面插值

[Locale.t](../src/i18n/index.ts)保持现有 `&`、`<`、`>` 转义约定，仅改变替换值的传递方式。例如 `$$` 保留为 `$$`，`$&` 保留为经过 HTML 转义的 `$&amp;`，不会再次解释成匹配模板。对应[插值回归](../src/i18n/__tests__/locale-interpolation.test.ts)。

### XHR 请求所有权

[网络拦截器](../src/features/caption/interceptor.ts)为每个 XHR 在 WeakMap 中维护 open 调用序号、待提交栈及已提交目标。原生 `open()` 抛错时只退出待提交调用，保留旧请求；成功时再撤销旧请求及装饰。原生同步事件中的 send 使用当前有效目标，嵌套成功 open 的较新目标不会被外层覆盖。

监听器、正文 getter 与响应头包装同时核对 open 身份，避免旧字幕逻辑处理同步重开的非字幕请求。生命周期变化后旧 send 停止登记；旧拦截器销毁后，尚未返回的 open 不再覆盖接管者状态。同实例重装仍通过共享调用序号协调有效目标。

对应[生命周期测试](../src/features/caption/__tests__/interceptor-lifecycle.test.ts)及[正文和响应头测试](../src/features/caption/__tests__/interceptor-j05-j08.test.ts)。回归先复现失败状态，再验证修复结果；同步事件夹具在被包装的原生 open 内派发事件，覆盖实际重入位置。

## 浏览器本地验收

使用 Codex 内置浏览器加载本地夹具；夹具直接打包当前 TabsView、Locale、TimedTextInterceptor 实现并使用项目原始 CSS，不用模拟按钮激活或模拟 XMLHttpRequest。

- Tab 键进入资讯标签后，字号操作显示；继续 Tab 到增大字号按钮并按 Enter，14px 变为 15px，动作计数仅增加一次。
- Tab 到减小字号按钮并按 Space，15px 回到 14px，动作总计两次；切换标签计数仍为零。
- Tab 到评论标签并按 Enter，活动标签变为 comments，切换计数一次；评论字号操作名称为中文，焦点进入后持续可见。
- 浏览器原生 XHR 发起字幕请求后，用同一实例执行会抛 `SyntaxError` 的重开；旧请求最终返回 200，回调为 `started → SyntaxError → browser-video_en_`，没有错误失败结算；原始 100ms 起点应用 100ms 偏移后读到 200ms。

本地验收截图保存在忽略目录 `.vitest/fifth-repair-browser.png`，临时页面、服务进程和夹具脚本已关闭或逐一清理。该证据验证浏览器原生交互和 XHR 语义；真实 YouTube DOM、油猴跨上下文注入、辅助技术播报及长会话仍需独立验收。

## 自动化验证

- `pnpm check`：通过。
- 字幕网络定向测试：4 个文件、43 项通过。
- Tabview 与相关字典定向测试：7 个文件、64 项通过。
- 翻译插值定向测试：1 个文件、3 项通过。
- `pnpm test --maxWorkers=2`：最终完整回归通过，51 个测试文件、484 项测试，耗时 61.60 秒。
- `pnpm build`：通过，包含严格类型检查；72 个模块完成打包，用户脚本 776.90 kB。
- `git diff --check`：通过。

定向测试与全量测试存在重叠，不叠加为独立覆盖率。

## 验收边界

本轮没有把尚缺实际触发证据的网格复用、播放器替换、嵌套模态焦点等候选升级为修复范围，详见审查报告。K02 当前没有生产插值调用；K03 的原生异常路径已验证，仍没有 YouTube 正常调用会执行失败重开的现场证据。
