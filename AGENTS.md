# YouTube Turbo – 开发者与 Agent 指南

本项目是一个专为 YouTube 桌面端量身定制的用户脚本（Userscript），基于 **Vite 6 + TypeScript 5 + vite-plugin-monkey** 工程化体系构建。本文档旨在为协同开发的 Agent 及开发者提供高密度、权威的代码库架构索引与协作规范。

---

## 1. 项目概览

- **核心产物**：`dist/youtube-turbo.user.js`
- **运行环境**：Tampermonkey / Violentmonkey 等主流油猴脚本管理器（在 `*://*.youtube.com/**` 上 `document-start` 阶段注入运行）
- **核心能力**：
  - 视频详情页 Tabview 标签页布局重构（评论区、推荐列表、简介分栏）
  - 首页与订阅页 4 列响应式网格布局自适应
  - 播放器增强：快捷调速（键盘快捷键与面板控制）、屏幕 HUD、无损截图、原生画中画、循环播放
  - 彩虹渐变播放进度条
  - YouTube 深浅色主题 Cookie 级无缝切换
  - 页面广告与推广位视觉标注
  - 多插槽悬浮工具箱与视频快捷下载

---

## 2. 架构分层与目录拓扑

代码库严格遵循职责分离与高内聚分层架构，主要目录结构如下：

```
YouTube_Improvements/
├── build/                       # 构建与打包辅助配置
│   ├── metadata.ts              # 油猴 Userscript 头部多语言元数据与 GM_* 权限声明
│   └── plugins/                 # 专用 Vite/Rollup 构建插件
│       └── tabview-bundle.ts    # 页面端 TS 虚拟打包注入插件 (esbuild Sub-bundle)
├── src/
│   ├── main.ts                  # 脚本统一主入口
│   ├── types/                   # 全局与通用 TypeScript 类型定义
│   │   ├── index.ts             # 核心数据接口（特性描述符、通信包体、弹窗选项等）
│   │   ├── monkey.d.ts          # 油猴 API 与全局环境补丁类型
│   │   └── virtual.d.ts         # 虚拟模块类型声明
│   ├── core/                    # 底层基础设施与核心引擎
│   │   ├── bridge.ts            # 沙箱（Sandbox）与主页面（Page）跨上下文事件桥梁
│   │   ├── constants.ts         # 全局通用常量（事件名、策略名、轮询阈值、时间/分辨率换算等）
│   │   ├── dom-adapter.ts       # DOM 操作与 YouTube 原生播放器/页面适配器
│   │   ├── hud.ts               # 屏幕平视提示浮层（HUD）动画与生命周期
│   │   ├── shortcuts.ts         # 全局快捷键调度器（支持输入上下文防冲突过滤与精确修饰键匹配）
│   │   ├── storage.ts           # GM 存储封装与 StorageKey 统一命名空间
│   │   ├── style-engine.ts      # 动态样式注入与安全卸载引擎（单例管理）
│   │   └── trusted-types.ts     # YouTube Trusted Types (TTP) 隔离策略
│   ├── features/                # 业务特性模块（高内聚、支持独立生命周期）
│   │   ├── adblock/             # 广告/推广元素视觉标记
│   │   ├── grid/                # 首页与订阅页响应式 4 列网格自适应
│   │   ├── player/              # 播放器控制、调速面板与高保真截图
│   │   ├── tabview/             # 详情页多 Tab 结构重构（Sub-bundle 注入主页面）
│   │   │   ├── index.ts         # 沙箱端挂载入口与 Bridge 调度
│   │   │   ├── constants.ts     # 模块常量与通信事件标识
│   │   │   ├── types.ts         # 业务模型与强类型契约
│   │   │   ├── tabview.css      # Tabview 布局样式
│   │   │   └── page/            # 页面执行上下文（编译为 IIFE 虚拟模块）
│   │   │       ├── index.ts             # 页面端自执行入口
│   │   │       ├── constants.ts         # 页面端专用选择器与 DOM 标记
│   │   │       ├── types.ts             # 页面端内部类型契约
│   │   │       ├── coordinator.ts       # NavigationCoordinator (SPA 路由与生命周期调度)
│   │   │       ├── observer-registry.ts # ObserverRegistry (统管 Mutation/Resize/Intersection 观察者总线)
│   │   │       ├── polymer-patcher.ts   # PolymerPatcher (Custom Elements 原型拦截沙盒与位置保护)
│   │   │       ├── polymer-helper.ts    # PolymerHelper (元素反射与安全查询)
│   │   │       ├── relocator.ts         # DOMRelocator (Slot 声明式迁移、占位复原与 Linked Comment 重排)
│   │   │       ├── tabs-view.ts         # TabsView (Tab 头部渲染、字号缩放与徽标)
│   │   │       ├── expander-fixer.ts    # ExpanderFixer (展开器原型计算与评论计数同步)
│   │   │       └── bridge-adapter.ts    # PageBridgeAdapter (页面端跨上下文事件对接)
│   │   └── theme/               # 深浅色主题切换与彩虹进度条
│   ├── registry/                # 特性生命周期注册与配置中心
│   │   ├── descriptors.ts       # 默认特性元数据定义与依赖声明
│   │   ├── feature-registry.ts  # 特性注册表单例（初始化、动态开关与设置面板）
│   │   └── index.ts             # 注册中心统一导出
│   ├── ui/                      # 视图表现与交互组件
│   │   ├── icons/               # 矢量 SVG 图标注册中心
│   │   ├── modal/               # 通用模态弹窗（Alert / Confirm / Custom Modal）
│   │   └── toolbar/             # 多插槽工具栏、工具箱与 Popover 浮层
│   └── i18n/                    # 国际化多语言体系
│       ├── index.ts             # 语言智能探测、切换与多参数插值翻译器
│       └── locales.ts           # 30+ 种语言字典定义与文本方向（LTR/RTL）
├── package.json                 # 依赖声明与脚本命令
├── tsconfig.json                # 严格模式 TypeScript 编译配置
├── vite.config.ts               # Vite + vite-plugin-monkey 构建配置
└── tampermonkey.original.user.js # 原始单文件脚本（作为历史对照与特性对齐的基准源码）
```

---

## 3. 核心机制与关键路径

### 3.1 跨上下文通信与 Polymer 原型拦截机制 (`src/features/tabview/page/polymer-patcher.ts`)
- **跨上下文隔离**：部分业务（如 `src/features/tabview`）需深度介入主页面 Polymer / Custom Elements 内部状态，通过注入 `<script>` 进入主页面上下文执行。主页面与油猴沙箱通过 `CustomEvent`（`RuntimeBridge`）进行类型安全的消息传递。
- **Custom Elements 原型拦截**：`PolymerPatcher` 统一在 `customElements.whenDefined` 阶段拦截 10 个核心组件（`ytd-watch-flexy`、`ytd-expander`、`ytd-watch-next-secondary-results-renderer`、`ytd-comments`、`ytd-comments-header-renderer`、`ytd-live-chat-frame`、`ytd-engagement-panel-section-list-renderer`、`ytd-watch-metadata`、`ytd-playlist-panel-renderer`、`ytd-expandable-video-description-body-renderer`）。
- **位置保护上下文 (`runInProtectedContext`)**：在 `ytd-watch-flexy` 执行位置同步方法（`updateChatLocation`、`updatePlayerLocation`、`updateCinematicsLocation`、`updatePanelsLocation`、`swatcherooUpdatePanelsLocation` 等）时，临时切换 `#secondary-inner` ID 映射，保证在剧院模式、全屏模式或侧边栏重排时官方 Polymer 计算不塌陷。

### 3.2 观察者总线与响应式联动 (`src/features/tabview/page/observer-registry.ts`)
- `ObserverRegistry` 单例统管 6 大专用观察者：
  - `aoChat`：监听聊天室 `collapsed` 属性变动，动态设置/移除 flexy 上的 `tyt-chat-collapsed` 和 `tyt-chat` 标识；
  - `aoPlayList`：监听播放列表 `hidden` / `collapsed` 状态，自适应同步高度与折叠表现；
  - `aoEgmPanels`：监听互动面板（Engagement Panels）的展开/收起适配与 `visibility`；
  - `aoComment` & `ioComment`：监听评论区显示状态及视口交错计算；
  - `roRightTabs`：监听 Tab 容器宽度变化，自适应触发字号与排版重绘。

### 3.3 展开器与数据驱动计算 (`src/features/tabview/page/expander-fixer.ts`)
- 基于 Polymer 原型拦截 `calculateCanCollapse`（`funcCanCollapse`），在渲染管线中动态计算 `content.offsetHeight < content.scrollHeight`。
- 保留原生 DOM 结构、数据绑定与事件通道，确保展开/收起按钮、时间戳跳转与富文本链接原生可用。

### 3.4 播放器控制与 SPA 导航生命周期 (`src/features/player/controller.ts`)
- **局部容器监听**：`MutationObserver` 仅在播放器局部容器挂载监听，避免全树扫描造成的性能开销。
- **SPA 异步轮询与防竞态**：在 `yt-navigate-finish` 与初始化阶段通过异步轮询等待 `<video>` 节点就绪，结合 `navigationToken` 防竞态保护，确保页面路由切换后目标播放速率（Target Speed）与单曲循环状态精准还原。
- **高保真截图**：锁定 `video.videoWidth` 与 `video.videoHeight` 真实物理分辨率，时间戳自动支持 `HH-MM-SS` 与 `MM-SS` 格式化。

### 3.5 快捷键调度系统 (`src/core/shortcuts.ts`)
- 所有全局键盘监听统一由 `ShortcutDispatcher` 调度。
- 严格进行修饰键（`shiftKey`、`ctrlKey`、`altKey`、`metaKey`）布尔精确匹配，防止单键与组合键冲突。
- 内置 `isTypingContext` 防御机制，在用户聚焦在输入区域（`input`、`textarea`、`contenteditable`、`tp-yt-paper-*`、`ytd-searchbox`）时自动抑制快捷键。

### 3.6 样式注入规范 (`src/core/style-engine.ts`)
- 严禁直接使用原生 `document.head.appendChild` 散落创建 `<style>`。
- 必须使用 `StyleEngine.inject(id, cssText)` 和 `StyleEngine.remove(id)` 进行管理，确保特性禁用（teardown）时能精准清理样式，避免样式污染。

---

## 4. 开发与构建工作流

### 4.1 常用指令
本项目使用 **pnpm** 作为包管理器：

```powershell
# 1. 依赖安装
pnpm install

# 2. TypeScript 类型检查（严格模式）
pnpm run check

# 3. 生产打包构建
pnpm run build

# 4. 本地开发预览
pnpm run dev
```

### 4.2 构建产物验证
构建完成后，确认 `dist/youtube-turbo.user.js` 生成正常。在浏览器油猴插件中加载该文件，检查在 YouTube 页面上的各功能表现。

---

## 5. 编码与协作规范

1. **TypeScript 严格规范**：
   - 必须显式声明所有变量、函数入参及返回值类型，禁止使用隐式 `any`。
   - 接口与公共契约定义放置于 `src/types/` 或对应模块的类型文件中。
2. **禁止魔法数字与硬编码**：
   - 尺寸、超时时间、存储键名、选择器常量统一收敛至对应模块的 `constants.ts`（如 `src/core/constants.ts`、`src/ui/toolbar/constants.ts`、`src/features/tabview/page/constants.ts`、`src/features/grid/constants.ts`）。
3. **国际化与多语言**：
   - 凡涉及用户界面展示的文案，均需在 `src/i18n/locales.ts` 中补充词条，并通过 `Locale.t()` 读取。
4. **终态无痕原则**：
   - 提交的代码与注释仅保留当前业务逻辑与关键边界说明，禁止在代码内部记录历史版本演进、修复记录或讨论过程。
5. **Git 提交信息**：
   - 严格遵循约定式提交（Conventional Commits）规范，如 `feat: ...`、`fix: ...`、`refactor: ...`、`docs: ...`。
