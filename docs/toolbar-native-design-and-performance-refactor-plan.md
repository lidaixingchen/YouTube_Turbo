# YouTube Turbo 工具箱控件原生化与架构性能重构方案

## 1. 背景与现状诊断

### 1.1 现状痛点
当前播放器工具箱（`ToolbarController` / `PopoverEngine`）在视觉风格、主题适配与渲染架构上存在以下明显问题：
1. **视觉割裂（突兀的白底方块）**：
   - 悬浮面板使用半透明黑底叠加 4 列白色圆角方块（`#F4F4F4`，25px×25px），与 YouTube 播放器暗黑毛玻璃（Dark Frosted Glass）设计语言完全割裂，整体质感缺乏原生感。
2. **缺乏原生级交互反馈与 Tooltip**：
   - 仅依赖系统原生的 HTML `title` 属性，存在显示延迟且字号极小；
   - 缺少开关型功能（如「循环播放」、「深色主题」）的即时激活高亮态指示。
3. **强制同步布局与重排开销**：
   - `PopoverEngine.reposition()` 先后调用多次 `getBoundingClientRect()` 并直接写入 `style.left` 和 `style.top`，缺乏 GPU 合成层优化，在大尺寸播放器或高帧率视频下存在重排（Layout）与重绘（Paint）开销。
4. **多插槽视觉规范不统一与主题兼容性缺失**：
   - Shorts 页面悬浮按钮与视频详情页 Metadata 胶囊按钮的光影与圆角未完全对齐 YouTube 官方 Pill/Capsule 规范；
   - Metadata 插槽若使用固定半透明白底，在浅色主题详情页的白色背景下对比度不足。

---

## 2. 原生化重构架构设计

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              YouTube Turbo Native Toolbar                              │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
    ┌───────────────────────────────────────┼───────────────────────────────────────┐
    ▼                                       ▼                                       ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌───────────────────────────────┐
│ 1. Player Quick Actions Grid  │ │ 2. Native Tooltip & State Bus │ │ 3. Unified Pill Multi-Slots   │
│ - Dark Frosted Glass (12px)   │ │ - YouTube Floating Bubble     │ │ - Shorts Circle Pill (48px)   │
│ - 3×2 Symmetrical Matrix      │ │ - Closed/Hover/Pinned States  │ │ - Metadata Theme Tokens Pill  │
│ - GPU Transform (translate3d) │ │ - Active State Red/White Glow │ │ - High-Fidelity Icon SVGs     │
└───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────────┘
```

### 2.1 播放器工具箱面板（Player Controls Slot）
- **视觉设计系统**：
  - 容器采用 YouTube 官方同款暗黑毛玻璃：`background: rgba(28, 28, 28, 0.92)` + `backdrop-filter: blur(16px)` + `box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5)` + `border: 1px solid rgba(255, 255, 255, 0.1)` + `border-radius: 12px`；
  - 按钮采用 **3 列 × 2 行** 对称矩阵排版，每个按钮尺寸为 `38px × 38px`，圆角 `8px`，背景为 `rgba(255, 255, 255, 0.08)`，悬停高亮为 `rgba(255, 255, 255, 0.18)`；
  - 激活态（Active State）：高亮为品牌红或纯白光晕，图标状态实时动态同步；
- **原生悬浮 Tooltip 状态提示区**：
  - 在工具箱面板顶部中央动态呈现 YouTube 原生文字气泡（如 `截取画面`、`循环播放 (已开启)`、`画中画`），无系统延迟，平滑淡入淡出。

### 2.2 GPU 加速定位与三态状态机（PopoverEngine & ToolbarController）
- **显式三态状态机（`CLOSED` | `HOVER_OPEN` | `PINNED_OPEN`）**：
  - **临时预览（`HOVER_OPEN`）**：鼠标移入底栏工具箱图标延迟 150ms 呼出；移出延迟 180ms 收起；移入面板自动清除隐藏定时器；
  - **常驻固定（`PINNED_OPEN`）**：点击工具箱图标进入常驻固定态；点击触发按钮再次收起；
  - **按需外部点击监听**：仅在进入 `PINNED_OPEN` 状态时向 `document` 挂载 `pointerdown` 捕获监听，收起时立即卸载监听，避免常驻监听开销与内存泄漏；
  - **声明式动作响应契约**：
    - 即时触发型动作（`dismissOnExecute: true`，如截图、设置）：执行后自动收起面板；
    - 状态开关型动作（`dismissOnExecute: false`，如循环播放、主题切换）：执行后保持面板展开并即时刷新激活状态。
- **纯 GPU 合成层定位（Composite-Only Positioning）**：
  - 挂载至 `#movie_player` 根节点，突破底栏 `overflow: hidden` 裁剪；
  - 垂直方向固定于底栏上方（`bottom: calc(var(--ytp-chrome-bottom-height, 48px) + 12px)`）；
  - 水平方向采用 GPU 变换 `transform: translate3d(var(--toolbox-offset-x), 0, 0)`，仅读取一次水平偏移量，彻底避免重排（Layout）与重绘（Paint）。

### 2.3 多插槽官方规范与主题自适应（Shorts & Watch Metadata Slots）
- **Shorts 插槽**：YouTube 官方最新半透明圆形按钮（`width: 48px; height: 48px; border-radius: 50%; background: rgba(255, 255, 255, 0.1)`），悬停高亮；
- **Metadata 插槽**：YouTube 官方标准圆角胶囊药丸（`height: 36px; border-radius: 18px;`），全面接入 YouTube 原生 CSS 变量：
  - 背景：`var(--yt-spec-badge-chip-background, rgba(0, 0, 0, 0.05))`；
  - 文本与图标：`var(--yt-spec-text-primary, inherit)`；
  - 悬停：`var(--yt-spec-button-chip-background-hover, rgba(0, 0, 0, 0.1))`；
  - 在浅色与深色主题下均与原生「赞/踩/分享/下载」按钮浑然一体。

---

## 3. 拟修改文件清单与改造细节

### [MODIFY] [constants.ts (Toolbar)](file:///e:/project/YouTube_Improvements/src/ui/toolbar/constants.ts)
- 更新工具箱面板尺寸、网格列数（3 列 × 2 行）、按钮宽高（38px）、圆角（12px / 8px）、间距与毛玻璃透明度常量；
- 收敛 Hover 呼出延迟（150ms）与关闭延迟（180ms）等时间阈值；
- 定义原生 Tooltip 样式规则与主题 CSS 变量常量。

### [MODIFY] [types.ts (Toolbar)](file:///e:/project/YouTube_Improvements/src/ui/toolbar/types.ts)
- 在 `ActionConfig` 中新增 `dismissOnExecute?: boolean` 可选契约属性（默认 `true`）；
- 定义 `PopoverState`（`"closed" | "hover" | "pinned"`）与相关回调契约。

### [MODIFY] [popover.ts](file:///e:/project/YouTube_Improvements/src/ui/toolbar/popover.ts)
- 实现显式三态状态机（`CLOSED`、`HOVER_OPEN`、`PINNED_OPEN`）；
- 改造定位算法为纯 GPU 合成层变换（`transform: translate3d(...)`），结合读写分离消除 Layout Thrashing；
- 实现动态按需注册/注销 `pointerdown` 外部点击监听（Outside Click Dismissal）。

### [MODIFY] [toolbar.ts](file:///e:/project/YouTube_Improvements/src/ui/toolbar/toolbar.ts)
- 重构 `createPlayerControlsSlotElement`，构建原生暗黑毛玻璃 3×2 网格与单例 Tooltip 提示容器；
- 支持 Action 点击根据 `dismissOnExecute` 声明式调度面板收起或状态刷新；
- 升级 Shorts 圆形按钮与 Watch Metadata 胶囊按钮（适配 YouTube CSS Tokens）。

### [MODIFY] [controller.ts (Player)](file:///e:/project/YouTube_Improvements/src/features/player/controller.ts)
- 更新 Action 注册项：`screenshot` / `pip` 声明 `dismissOnExecute: true`，`loop` 声明 `dismissOnExecute: false`。

### [MODIFY] [theme-controller.ts](file:///e:/project/YouTube_Improvements/src/features/theme/theme-controller.ts)
- 更新 Action 注册项：`theme` 声明 `dismissOnExecute: false`，切换后保持面板展开以便连续操作。

---

## 4. 验证与回归计划

1. **类型与构建检查**：
   - 运行 `pnpm run check` 确保 0 类型报错，严格模式无 `any`；
   - 运行 `pnpm run build` 确保 Userscript 产物打包成功。
2. **视觉与主题测试**：
   - 验证工具箱在浅色与深色主题下毛玻璃效果与光影质感；
   - 验证视频详情页 Metadata 胶囊按钮在深色与浅色背景下的对比度表现；
   - 验证 Shorts 页面下载圆形按钮的视觉对齐。
3. **交互与状态机测试**：
   - 验证 Hover 150ms 展开、移出 180ms 收起；
   - 验证点击工具箱常驻展开、点击空白区域自动收起；
   - 验证执行「循环播放」与「主题切换」后面板保持展开且状态高亮实时切换；
   - 验证执行「截图」与「设置」后面板自动收起。
4. **性能与渲染验证**：
   - 验证全屏、剧院模式与尺寸缩放时面板通过 GPU Transform 平滑定位，无布局抖动。
