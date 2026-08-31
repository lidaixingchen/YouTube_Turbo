# YouTube Improvements – 开发者与 Agent 指南

本项目是一个专为 YouTube 桌面端量身定制的用户脚本（Userscript），基于 **Vite 6 + TypeScript 5 + vite-plugin-monkey** 工程化体系构建。本文档旨在为协同开发的 Agent 及开发者提供高密度、权威的代码库架构索引与协作规范。

---

## 1. 项目概览

- **核心产物**：`dist/youtube-improvements.user.js`
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
│   └── metadata.ts              # 油猴 Userscript 头部多语言元数据与 GM_* 权限声明
├── src/
│   ├── main.ts                  # 脚本统一主入口
│   ├── types/                   # 全局与通用 TypeScript 类型定义
│   │   ├── index.ts             # 核心数据接口（特性描述符、通信包体、弹窗选项等）
│   │   └── monkey.d.ts          # 油猴 API 与全局环境补丁类型
│   ├── core/                    # 底层基础设施与核心引擎
│   │   ├── bridge.ts            # 沙箱（Sandbox）与主页面（Page）跨上下文事件桥梁
│   │   ├── constants.ts         # 全局通用常量（事件名、策略名、轮询阈值等）
│   │   ├── dom-adapter.ts       # DOM 操作与 YouTube 原生播放器/页面适配器
│   │   ├── hud.ts               # 屏幕平视提示浮层（HUD）动画与生命周期
│   │   ├── shortcuts.ts         # 全局快捷键调度器（支持输入上下文防冲突过滤）
│   │   ├── storage.ts           # GM 存储封装与 StorageKey 统一命名空间
│   │   ├── style-engine.ts      # 动态样式注入与安全卸载引擎（单例管理）
│   │   └── trusted-types.ts     # YouTube 严苛 Trusted Types (TTP) 兼容策略
│   ├── features/                # 业务特性模块（高内聚、支持独立生命周期）
│   │   ├── adblock/             # 广告/推广元素视觉标记
│   │   ├── grid/                # 首页与订阅页响应式 4 列网格重排
│   │   ├── player/              # 播放器控制、调速面板与无损截图
│   │   ├── tabview/             # 详情页多 Tab 结构重构（注入主页面执行）
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
└── vite.config.ts               # Vite + vite-plugin-monkey 构建配置
```

---

## 3. 核心机制与关键路径

### 3.1 跨上下文通信机制 (`src/core/bridge.ts`)
部分业务（如 `src/features/tabview`）需要深度介入主页面 Polymer/Custom Elements 内部状态，代码通过注入 `<script>` 进入主页面上下文执行。主页面与油猴沙箱上下文通过 `CustomEvent`（`RuntimeBridge`）进行强类型消息传递，保证权限隔离与数据安全。

### 3.2 特性注册与生命周期管理 (`src/registry/`)
所有业务特性统一通过 `FeatureDescriptor` 描述符规范实现标准化接入：
- **`setup()` / `teardown()`**：必须成对支持启动与销毁逻辑，确保用户在设置面板（Settings Modal）中切换开关时可即时热生效，或通过 `requiresReload` 标记强制触发刷新。
- **配置持久化**：特性启用状态统一保存在 `StorageKeys.youtube.functionState` 中，由 `FeatureRegistry` 统一调度。

### 3.3 YouTube SPA 页面导航与 DOM 适配
YouTube 属于重度 Single Page Application (SPA)，页面跳转基于 `yt-navigate-finish` 自定义事件。
- 涉及播放器或工具栏挂载的代码需在主入口或模块内部同时监听 `yt-navigate-finish` 与 `commonUtil.onPageLoad`。
- 视频元素获取与监听使用 `PlayerController` 内置的 `MutationObserver` 机制，自动处理播放器节点重建与无缝重绑定。

### 3.4 样式注入规范 (`src/core/style-engine.ts`)
- 严禁直接使用原生 `document.head.appendChild` 散落创建 `<style>`。
- 必须使用 `StyleEngine.inject(id, cssText)` 和 `StyleEngine.remove(id)` 进行管理，确保特性禁用（teardown）时能精准清理样式，避免样式污染。

### 3.5 快捷键处理 (`src/core/shortcuts.ts`)
- 所有全局键盘监听统一由 `ShortcutDispatcher` 调度。
- 调度器内置 `isTypingContext` 防御机制，在用户聚焦在 `input`、`textarea`、`contenteditable`、`tp-yt-paper-*`、`ytd-searchbox` 等输入区域时自动抑制快捷键触发。

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
构建完成后，确认 `dist/youtube-improvements.user.js` 生成正常。在浏览器油猴插件中加载该文件，检查在 YouTube 页面上的各功能表现。

---

## 5. 编码与协作规范

1. **TypeScript 严格规范**：
   - 必须显式声明所有变量、函数入参及返回值类型，禁止使用隐式 `any`。
   - 接口与公共契约定义放置于 `src/types/` 或对应模块的类型文件中。
2. **禁止魔法数字与硬编码**：
   - 尺寸、超时时间、存储键名、选择器常量统一收敛至对应模块的 `constants.ts`（如 `src/core/constants.ts`、`src/ui/toolbar/constants.ts`、`src/features/grid/constants.ts`）。
3. **国际化与多语言**：
   - 凡涉及用户界面展示的文案，均需在 `src/i18n/locales.ts` 中补充词条，并通过 `Locale.t()` 或 `LangueUtil.getLanguage()` 读取。
4. **终态无痕原则**：
   - 提交的代码与注释仅保留当前业务逻辑与关键边界说明，禁止在代码内部记录历史版本演进、修复记录或讨论过程。
5. **Git 提交信息**：
   - 严格遵循约定式提交（Conventional Commits）规范，如 `feat: ...`、`fix: ...`、`refactor: ...`、`docs: ...`。
