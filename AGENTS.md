# AGENTS.md — YouTube Turbo

专为 YouTube 桌面端量身定制的高性能全能增强用户脚本（Userscript）。

## 技术栈

TypeScript 5 (Strict) · Vite 6 · vite-plugin-monkey (油猴 Userscript) · esbuild (页面端 Sub-bundle IIFE) · pnpm · Tampermonkey / Violentmonkey API · Polymer / Custom Elements 原型拦截

## 目录结构（要点）

- `src/core/`：运行时基础设施（弱引用 DOM 句柄缓存 `ReactiveDOMRegistry`、实验 Flag 拦截 `setupConfigHacks`、快捷键调度 `ShortcutDispatcher`、动态样式引擎 `StyleEngine`、HUD 浮层 `PlaybackHUD`、跨上下文通信桥 `RuntimeBridge`）
- `src/features/tabview/`：详情页多 Tab 分栏（沙箱入口 + `page/` 页面端 IIFE 注入，拦截 10 个 Polymer 原型，支持简介/元数据实时镜像 `InfoMirrorEngine`、展开器计算 `ExpanderFixer`、频道预览 `ChannelHoverAdapter`、迷你播放器路由隔离 `MinibrowserRouter`）
- `src/features/grid/`：首页与订阅页 4 列响应式网格（`ScopedGridObserver` 靶向突变隔离 + 静默锁 `Silence Lock`，纯 CSS 媒体查询）
- `src/features/caption/`：字幕时间轴毫秒级偏移校准（`TimedTextInterceptor` 请求拦截 + `ReactiveRenderGate` 按需激活渲染闸门）
- `src/features/player/`：播放器快捷调速、无损物理分辨率截图、循环播放与 SPA 路由防竞态
- `src/features/theme/`：深浅色 Cookie 级无缝切换与彩虹流光进度条
- `src/features/download/`：多端点快捷解析下载
- `src/features/adblock/`：广告与推广位视觉标注与清理
- `src/ui/`：多插槽统一聚合挂载总线 `SlotMountBus`（挂载即停机）、原生风格模态弹窗 `ModalComponent`、SVG 图标注册中心
- `src/registry/`：特性注册表单例 `FeatureRegistry` 与 7 大特性描述符 `defaultFeatureDescriptors`、设置面板
- `src/i18n/`：30+ 语言智能探测与翻译器 `Locale.t()`（字典在 `locales.ts`）
- `build/`：油猴元数据 `metadata.ts` 与页面端打包插件 `plugins/tabview-bundle.ts`
- `docs/`：架构决策记录 `adr/`、专项方案 `*-plan.md`、审计报告 `*-report.md`

## 命令

```bash
pnpm dev      # 本地开发预览
pnpm check    # TypeScript 类型检查（严格模式 tsc --noEmit）
pnpm build    # 生产打包构建（产物输出至 dist/youtube-turbo.user.js）
```

### 开发自检约定

- **包管理器限定**：开发阶段仅允许使用 `pnpm`，严禁 `npm` / `yarn`（保证 lockfile 一致性）。
- **校验最小化**：每次逻辑或类型修改后，运行 `pnpm check` 确保零类型报错；涉及构建产物或页面注入逻辑时运行 `pnpm build` 验证打包通过。
- **产物验证**：构建完成后将 `dist/youtube-turbo.user.js` 载入 Tampermonkey / Violentmonkey 中在 `https://www.youtube.com/` 进行端到端行为验证。

## 导入与模块调用规范

- **模块引用**：一律使用相对路径（如 `../core/dom-registry`、`../../types`），禁止硬编码任何绝对路径。
- **DOM 与播放器句柄**：统一通过 `ReactiveDOMRegistry.getInstance()` 访问（`getVideoElement()`、`getPlayerContainer()`、`waitForVideoElement()` 等），严禁在业务中散落直接调用 `document.querySelector('video')`。
- **样式管理**：统一使用 `StyleEngine.inject(id, cssText)` 和 `StyleEngine.remove(id)`，严禁直接使用原生 `document.head.appendChild` 插入 `<style>`。
- **快捷键注册**：统一使用 `ShortcutDispatcher.register({ key, ctrlKey, altKey, handler, description })`，内部已集成输入区域（input / textarea / contenteditable / ytd-searchbox）防冲突抑制，严禁裸绑定全局 `keydown`。
- **屏幕浮层（HUD）**：统一使用 `PlaybackHUD.show(message)`。
- **多语言文案**：统一使用 `Locale.t("key")`，所有展示文案必须在 `src/i18n/locales.ts` 注册，严禁在 UI 代码中硬编码中英文。
- **图标引用**：统一使用 `src/ui/icons/` 导出的 `IconMap` 与图标渲染器。
- **跨上下文通信**：沙箱端与页面端（Page）通过 `RuntimeBridge` 与 `PageBridgeAdapter` 经由类型安全的 `CustomEvent` 传递。

## 代码风格与架构红线

### 通用约定

- 不写注释，除非被要求；注释仅解释复杂的业务逻辑或边界条件，严禁在代码中记录修改历史、diff 说明或版本演进；禁止魔法数字和硬编码值（必须收敛至对应模块 `constants.ts`）。
- TypeScript 严格模式：显式声明所有变量、函数入参及返回值类型，严禁隐式 `any`。
- 终态无痕原则：交付的代码、注释及文档必须基于干净的最终状态，严禁体现沟通试错痕迹或废弃草案。

### 核心架构红线

- **跨上下文物理隔离**：`src/features/tabview/page/` 运行在主页面上下文（注入的 IIFE），严禁在页面端直接调用油猴沙箱 `GM_*` API；沙箱侧严禁直接同步读取主页面 `window.yt` / Polymer 内部属性。
- **零轮询与按需停机**：
  - 严禁引入常驻守护轮询定时器（`setInterval`）。生命周期严格对齐 SPA 路由事件（`yt-navigate-finish`）与 Polymer 原型挂载钩子（`attached`）；
  - 字幕覆盖层渲染循环（`ReactiveRenderGate`）仅在“视频播放中 + 原生字幕开启 + 偏移量非零”三元满足时激活，任一条件不满足立即 `cancelAnimationFrame`；
  - 工具栏插槽挂载（`SlotMountBus`）在全量插槽就绪或离开路由后立即 `observer.disconnect()`，闲置期主线程开销绝对归零。
- **作用域隔离与静默锁**：
  - 严禁向 `document.body` 或 `document.documentElement` 建立全局无边界的 MutationObserver；
  - 网格监听必须收敛至局部容器 `ytd-rich-grid-renderer > #contents`（`ScopedGridObserver`）；
  - 执行节点物理重排（`insertBefore`）期间必须启用静默锁（`Silence Lock`），彻底杜绝自触发突变风暴。
- **DOM 常数时间访问与路由失效**：
  - 核心节点句柄通过 `WeakRef` 缓存，在 `isConnected === true` 时实现 $O(1)$ 常数时间访问；
  - 监听 `yt-navigate-finish` 与 `yt-page-type-changed` 事件，路由切换时原子性失效缓存，防止跨页面幽灵节点。

## 详细文档与落位约定

- **架构决策** → `docs/adr/`：命名为 `NNNN-kebab-case.md`，记录上下文、决策与影响（核心演进与推导收敛于此）
- **专项重构方案** → `docs/`：命名为 `<feature>-plan.md`
- **审计与对齐报告** → `docs/`：命名为 `<feature>-report.md`
- **文档链接一律使用相对路径**，严禁使用 `file:///` 本机绝对路径

## AGENTS.md 维护约定

- 编写或修改本文件时，对项目约定、架构边界、命令用途或功能特性不确定时，先询问用户，不要自行主观臆测。
- 只记录已确认的事实和约定；不要把一次性调试经验写成本项目长期规则。
