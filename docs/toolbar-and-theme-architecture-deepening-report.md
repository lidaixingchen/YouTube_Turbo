# YouTube Turbo – 工具栏与主题子系统深模块化重构完成报告

已顺利完成 **Candidate 4（工具栏与插槽挂载总线对齐）** 与 **Candidate 5（主题子系统全内聚深化）** 的全量代码重构与类型/构建验证。

---

## 一、 完成的改动摘要

### 1. Candidate 4：工具栏与插槽挂载总线深化 (`SlotMountBus` & `ToolbarController`)
- **物理文件重命名与消除别名**：
  - 将 `src/ui/toolbar/reactive-mounter.ts` 重命名为 `src/ui/toolbar/slot-mount-bus.ts`；
  - 彻底删除 `export { SlotMountBus as ReactiveMounter };` 遗留别名；
  - 更新全站所有导入路径（对齐 [ADR 0005](adr/0005-unified-slot-mount-bus.md)）。
- **`ActionRegistry` 动作注销与 Disposer 闭环**：
  - `ActionRegistry.register()` 与 `registerAll()` 支持返回清理函数 `Disposer`；
  - 新增 `ActionRegistry.unregister(actionId)`，实现动作级别的动态反注册。
- **`ToolbarController` 自动驱动插槽生命周期与浮层响应**：
  - `Toolbar.registerAction()` / `registerActions()` 返回 Disposer，注册/注销时自动调用 `syncSlots()`；
  - 独立插槽（Shorts 动作栏、元数据栏）在动作归零时自动卸载并移除 DOM；
  - 共享插槽（播放器悬浮窗）内部工具箱支持局部刷新（`renderToolboxGrid` / `refreshPopoverTools`），保证按钮实时响应。
- **`VideoDownloadService` 领域生命周期内聚**：
  - 提供 `enable()` 与 `disable()` 标准契约，内部维护动作 Disposer 句柄；
  - 彻底消除 `src/registry/descriptors.ts` 对具体插槽常量（`SLOT_SHORTS_ACTIONS` / `SLOT_WATCH_METADATA`）的硬编码拼装。

### 2. Candidate 5：主题子系统全内聚深化 (`ThemeController`)
- **浅模块消除（Deletion Test）**：
  - 物理删除 16 行的浅层包装文件 `src/features/theme/progress-bar.ts`。
- **深模块整合**：
  - 在 `src/features/theme/constants.ts` 补充 `STYLE_ID_PROGRESS_BAR: "theme-progressbar"` 常量；
  - 在 `ThemeController` 中直接实现 `enableProgressBar()` 与 `disableProgressBar()`；
  - `src/features/theme/index.ts` 仅暴露领域控制器与常量/类型。
- **配置描述符统一**：
  - `src/registry/descriptors.ts` 中的 `isOpenThemeProgressBar` 统一对接 `ThemeController.getInstance().enableProgressBar()` 与 `disableProgressBar()`。

---

## 二、 自动化校验结果

```bash
# 1. 严格模式类型检查（零类型报错，零隐式 any）
pnpm check -> 0 errors (tsc --noEmit)

# 2. 生产打包构建
pnpm build -> dist/youtube-turbo.user.js (347.97 kB, built in 798ms)
```
