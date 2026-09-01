# YouTube Turbo 设置面板原生化与排版美化重构方案

## 1. 背景与现状诊断

### 1.1 现状痛点
当前脚本的设置面板（`FeatureRegistry.openSettingsModal` / `ModalInstance`）在视觉风格、主题适配、交互无障碍与信息排版上存在以下不足：
1. **主题割裂（无深色模式自适应）**：
   - 弹窗背景与标题栏使用硬编码浅色色值，在 YouTube 深色主题（Dark Mode）下视觉突兀，未能对接 YouTube 原生 Design Tokens 体系。
2. **信息层级缺失（长句机械堆砌）**：
   - 所有功能项均采用单一长句文案，缺乏「主功能名称（Title）」与「辅助功能说明（Description）」的视觉分离，扫读与认知成本较高。
3. **控件与无障碍（A11y）断层**：
   - 开关采用 `display: none` 隐藏原生 Checkbox，破坏了键盘 Tab 聚焦与 Space 键切换能力；开关样式缺乏 Material Design 3 / YouTube 原生流线轮廓与焦点光晕（Focus Ring）。
4. **模态宽度狭窄与尺寸固定**：
   - 通用弹窗固定为 `360px`，导致两段式长文案或二级微调配置卡片排版局促。
5. **样式未模块化（内嵌 CSS 字符串）**：
   - 设置面板内嵌约 150 行 CSS 模板字符串，破坏了 TypeScript 逻辑代码的纯粹性，未纳入 `StyleEngine` 统一管理。

---

## 2. 原生化重构架构设计

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                YouTube Turbo Settings System                                │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
     ┌─────────────────────────────────────────┼────────────────────────────────────────┐
     ▼                                         ▼                                        ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐  ┌─────────────────────────────┐
│ 1. Core UI Layer            │  │ 2. Feature Registry & IA    │  │ 3. Tokens & A11y Styling    │
│ (src/ui/modal/)             │  │ (src/registry/)             │  │ (src/registry/settings.css) │
│ - Modal with Size Presets   │  │ - Title/Desc Dual Fallback  │  │ - MD3 A11y Switch Controls  │
│ - Global ESC / Backdrop     │  │ - Decoupled Lifecycle       │  │ - Full YouTube CSS Tokens   │
│ - Vector SVG Close Button   │  │ - External settings.css     │  │ - Light/Dark Multi-Fallback │
└─────────────────────────────┘  └─────────────────────────────┘  └─────────────────────────────┘
```

### 2.1 通用模态容器（`Modal`）分层与尺寸体系
- **职责解耦**：
  - `src/ui/modal/` 保持通用对话框抽象（支撑 `Modal.open`、`Modal.confirm`、`Modal.alert`）；
  - 新增尺寸预设体系：`size?: "small" | "medium" | "large"`。其中设置面板使用 `medium`（`460px`），`confirm/alert` 默认使用 `small`（`360px`）。
- **沉浸式 Header 与矢量关闭按钮**：
  - 移除旧版灰底标题栏，改为与容器背景通体一致的沉浸式顶栏；
  - 标题字号升级为 `18px / 600 Weight`；
  - 关闭按钮采用 20px 矢量 Close SVG 图标，配备圆形半透明悬停光晕（Hover Halo）；
  - 原生支持键盘 `ESC` 键关闭与点击背景遮罩平滑关闭，并在销毁时精准解绑全局键盘监听，防止 SPA 内存泄露。

### 2.2 全生态 YouTube Design Tokens 对接与深浅色双重兜底
全面接入 YouTube 原生 CSS 变量，并配置暗色模式属性兜底，确保免刷新无缝自适应：

| 语义层级 | YouTube CSS Token | 浅色兜底（Light Fallback） | 深色兜底（Dark Fallback） |
| :--- | :--- | :--- | :--- |
| **弹窗主背景** | `var(--yt-spec-base-background)` | `#ffffff` | `#0f0f0f` |
| **主文本颜色** | `var(--yt-spec-text-primary)` | `#0f0f0f` | `#f1f1f1` |
| **辅助文本颜色** | `var(--yt-spec-text-secondary)` | `#606060` | `#aaaaaa` |
| **卡片底色** | `var(--yt-spec-badge-chip-background)` | `rgba(0, 0, 0, 0.05)` | `rgba(255, 255, 255, 0.08)` |
| **边框与分割线** | `var(--yt-spec-10-percent-layer)` | `rgba(0, 0, 0, 0.1)` | `rgba(255, 255, 255, 0.1)` |
| **品牌高亮蓝** | `var(--yt-spec-call-to-action)` | `#065fd4` | `#3ea6ff` |

### 2.3 信息架构（IA）与多语言双级平滑降级（Fallback Strategy）
将功能配置项重构为**两段式信息结构**，并在 `FeatureDescriptor` 与渲染引擎中实现优雅降级：

```
┌──────────────────────────────────────────────────────────────┐
│  Tabview 分栏标签页                                    [ O ] │  <-- 14px / 600 Weight 主标题 + MD3 Switch
│  重构详情页评论区、推荐列表与简介为多标签分栏布局            │  <-- 12px / 400 Weight 辅助说明
└──────────────────────────────────────────────────────────────┘
```

- **降级机制**：
  1. 优先读取 `titleI18nKey` 与 `descI18nKey`；
  2. 若当前语言字典未提供独立标题键，自动回退至 `i18nKey` 作为单行主标题；
  3. 若未提供辅助说明键，自动收起说明区，退化为紧凑单行模式，确保全球 30+ 种语言 100% 稳定呈现。

#### 核心功能文案对照表：
| 功能模块 | 优化后功能主标题（Title） | 优化后功能说明（Description） |
| :--- | :--- | :--- |
| `isOpenCommentTable` | **Tabview 分栏标签页** | 重构详情页评论区、推荐列表与简介为多标签分栏布局 |
| `isOpenFourColumnGrid` | **响应式 4 列网格** | 首页与订阅页视频卡片自适应 4 列网格排版 |
| `isOpenThemeProgressBar` | **彩虹渐变播放进度条** | 为视频播放进度提供动态彩虹流光视觉特效 |
| `isOpenYoutubedownloading` | **视频快捷下载** | 在播放器控制栏与操作区提供一键无损下载通道 |
| `isOpenSpeedControl` | **播放器调速增强** | 快捷键：Shift+> 加速、Shift+< 减速、Shift+R 重置 1.0x，支持调速菜单 |
| `isOpenMarkOrRemoveAd` | **推广内容视觉标记** | 标注页面广告与赞助商推广元素 |
| `isOpenSubtitleOffset` | **字幕时间轴校准** | 支持键盘快捷键微调字幕偏移并支持保存默认基准 |

### 2.4 Material Design 3 / YouTube 原生无障碍开关
- **A11y 标准结构**：
  - 采用视觉隐藏（`position: absolute; opacity: 0;`）替代 `display: none`，保留原生 Checkbox 键盘可访问性；
  - 轨道（Track）：宽度 `44px`，高度 `24px`，圆角 `12px`；
  - 滑块（Thumb）：直径 `18px`，开启时平滑位移 `+20px`；
  - 键盘焦点：支持 `Tab` 键聚焦并呈现 `:focus-visible` 焦点光晕环，支持 `Space` 空格键切换。

### 2.5 统一二级配置卡片（以字幕时间轴为例）
- **卡片容器**：采用 `var(--yt-spec-badge-chip-background)` 沉浸式底色，内边距 `12px`，大圆角 `8px`；
- **Pill 胶囊按钮**：高度 `28px`、圆角 `14px`，悬停具有柔和光晕；
- **等宽快捷键徽章**：`<kbd class="yt-turbo-kbd">Alt+[</kbd>` 采用等宽代码胶囊样式，清晰易读。

---

## 3. 拟修改与新增文件清单

### 1. [MODIFY] [src/types/index.ts](file:///e:/project/YouTube_Improvements/src/types/index.ts)
- `FeatureDescriptor` 扩展 `titleI18nKey?: string` 与 `descI18nKey?: string`；
- `ModalOpenOptions` 扩展 `size?: "small" | "medium" | "large"`。

### 2. [MODIFY] [src/ui/modal/modal.ts](file:///e:/project/YouTube_Improvements/src/ui/modal/modal.ts) & [src/ui/modal/modal.css](file:///e:/project/YouTube_Improvements/src/ui/modal/modal.css)
- 增加模态弹窗尺寸变体类名（`yt-modal-size-small`、`yt-modal-size-medium`、`yt-modal-size-large`）；
- 升级关闭按钮为 SVG 矢量图标并集成悬停光晕；
- 绑定与安全解绑 `ESC` 键盘关闭事件；
- 对接全套 `--yt-spec-*` Tokens 与深浅色双重兜底。

### 3. [NEW] [src/registry/settings.css](file:///e:/project/YouTube_Improvements/src/registry/settings.css)
- 独立承载设置面板的列表项卡片、两段式排版、MD3 无障碍开关、Pill 胶囊按钮及细窄原生滚动条样式。

### 4. [MODIFY] [src/registry/descriptors.ts](file:///e:/project/YouTube_Improvements/src/registry/descriptors.ts)
- 为各功能项声明对应的 `titleI18nKey` 与 `descI18nKey`。

### 5. [MODIFY] [src/registry/feature-registry.ts](file:///e:/project/YouTube_Improvements/src/registry/feature-registry.ts)
- 剥离内嵌 CSS 字符串，引入 `settings.css`；
- 重构 `openSettingsModal` 渲染引擎：支持「主标题 + 辅助说明」两段式排版与双级向下兼容降级；
- 升级开关控件为无障碍语义结构。

### 6. [MODIFY] [src/i18n/locales.ts](file:///e:/project/YouTube_Improvements/src/i18n/locales.ts)
- 补充各功能的 `feature_*_title` 与 `feature_*_desc` 国际化词条，并保持旧键兼容。

### 7. [MODIFY] [src/features/caption/controller.ts](file:///e:/project/YouTube_Improvements/src/features/caption/controller.ts)
- 升级 `renderSettingsConfig` 为 YouTube 原生 Pill 胶囊按钮与自适应输入框。

---

## 4. 验证与回归计划

1. **类型与构建检查**：
   - 运行 `pnpm run check` 确保严格 TypeScript 类型检查 0 报错；
   - 运行 `pnpm run build` 确保 Userscript 产物顺利构建。
2. **视觉与主题自适应走查**：
   - 在 YouTube **浅色模式（Light Mode）** 下验证弹窗底色、字阶对比度与按钮手感；
   - 在 YouTube **深色模式（Dark Mode）** 下验证暗色融合度、开关对比度与卡片边框层次；
   - 走查小语种下未配置独立描述时的单行自动降级表现。
3. **无障碍与交互验证**：
   - 测试通过键盘 `Tab` 键连续聚焦各开关控件，检查 `:focus-visible` 光晕；
   - 测试通过键盘 `Space` 键即时切换开关状态；
   - 测试按下键盘 `ESC` 键以及点击背景遮罩时弹窗平滑关闭；
   - 验证需刷新生效的功能在弹窗关闭时精准触发 reload。
