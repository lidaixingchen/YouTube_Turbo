# YouTube Turbo – 效率与视觉增强全家桶

全能型 YouTube 体验增强油猴脚本（Userscript），基于 **Vite + TypeScript + vite-plugin-monkey** 现代工程化架构构建。

## 功能特性

- 📑 **视频详情页布局优化 (Tabview)**：将相关视频、评论区与视频简介重构为标签页切换布局，大幅提升大屏与桌面端浏览效率。
- 🖼️ **网格排版优化 (4-Column Grid)**：首页与订阅页视频流自动适配 4 列响应式网格布局。
- 🌈 **播放进度条美化 (Progress Bar)**：个性化彩虹渐变播放进度条与动态滑块。
- ⚡ **视频快捷调速 (Speed Control)**：支持快捷键（`<` / `>`）与播放器面板即时调速，配备屏幕 HUD 浮层提示。
- 📸 **画格高清截图 (Screenshot)**：一键捕获当前视频高保真画格并下载保存。
- 🌓 **深浅主题切换 (Theme Toggle)**：一键快速切换 YouTube 官方深色/浅色模式。
- 🪟 **画中画与循环播放 (PiP & Loop)**：原生画中画模式与单曲循环控制。
- 🚫 **页面广告标注 (Ad Marking)**：醒目标注页面内各类广告推广位。

## 技术栈与工程架构

- **构建工具**：Vite 6 + `vite-plugin-monkey`
- **编程语言**：TypeScript 5（严格类型模式，禁止隐式 any）
- **包管理器**：pnpm
- **模块分层**：
  - `src/core/`：通用底层（存储封装、样式引擎、事件总线、DOM 适配器、TTP 策略）
  - `src/features/`：高内聚业务特性（Tabview、Grid、Player、Theme、AdBlock）
  - `src/ui/`：视图交互层（挂载工具栏、模态弹窗、SVG 图标库）
  - `src/i18n/`：国际化多语言管理（支持 30+ 种语言）
  - `src/registry/`：特性统筹注册与生命周期调度中心

## 开发与构建

```powershell
# 安装依赖
pnpm install

# 类型检查
pnpm run check

# 构建打包
pnpm run build
```

打包产物将输出至 `dist/youtube-improvements.user.js`。

## 致谢 (Acknowledgements)

本项目在现代工程化重构过程中，参考与受益于多位开源作者的杰出工作与灵感，在此特别鸣谢：

- **Thalrien.vx** & **CY Fung**：原 YouTube Improvements 脚本及其 Tabview 核心布局增强算法的创作者与贡献者。
- **Benjamin Philipp**：提供 Trusted Types (TTP) 安全策略适配方案与参考实践。
- **[vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey)**：提供优秀的现代油猴脚本 Vite 构建工具链。

## 开源协议

MIT License

