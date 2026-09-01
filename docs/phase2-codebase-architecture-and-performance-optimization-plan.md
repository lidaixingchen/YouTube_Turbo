# YouTube Turbo 第二阶段全景性能深化与架构重构方案

本项目是专为 YouTube 桌面端量身定制的用户脚本（基于 Vite 6 + TypeScript 5 + vite-plugin-monkey）。在第一阶段消除 rAF 帧循环 DOM 查询、强制同步布局与描述镜像回流的基础上，第二阶段方案基于第一性原理与现代前端工程最佳实践，聚焦于**主线程热路径事件过滤、GPU 显存主动回收、DOM 变动最小 Diff 与批处理、观察者精准调度与构建产物精简** 5 大核心维度。

---

## 1. 架构性能瓶颈诊断与技术方案

### 1.1 快捷键分发热路径（`ShortcutDispatcher`）
- **瓶颈诊断**：在用户打字（搜索框、评论框、实时聊天室）时，每一次 `keydown` 都会触发监听。若无条件调用 `event.composedPath()`，每次事件均会创建包含 15~30 个 DOM 节点的数组并在其上遍历属性，增加主线程开销。
- **技术方案**：
  1. **按键特征前置守卫（Key Filtering Fast-Path）**：维护当前已注册按键的集合 `registeredKeysSet`。若 `event.key` 不在集合中，在 $O(1)$ 内存查找后立即短路返回（耗时 $< 0.001\text{ms}$）；
  2. **两级输入上下文检查（Two-Tier Context Guard）**：
     - **Level 1（浅层直检）**：优先检测 `event.target`（命中 `INPUT`、`TEXTAREA`、`isContentEditable`、`role="textbox"` 立即退出），覆盖 90% 以上原生输入场景；
     - **Level 2（深层兜底）**：仅在 Level 1 未命中但可能处于 Shadow DOM 复合组件内部时，才调用 `event.composedPath()` 执行完整路径回溯。

### 1.2 高清截图与图形显存主动回收（`PlayerController.captureScreenshot`）
- **瓶颈诊断**：4K 视频单帧 RGBA 解压缩位图显存占用超过 33MB（8K 超过 130MB）。若同时生成 Base64 字符串与 Blob，会导致超清位图在内存中产生多份副本；且导出后若未主动重置 Canvas 尺寸，GPU 纹理显存将滞留等待垃圾回收。
- **技术方案**：
  1. **单一二进制流处理（Zero Base64 Duplication）**：移除冗余的 `toDataURL`，全流程仅使用异步 `canvas.toBlob()` 与 `URL.createObjectURL` 执行下载；
  2. **显存安全释放时序（Safe GPU Texture Teardown）**：在 `toBlob` 的异步回调或结算阶段（无论成功或失败），显式执行 `canvas.width = 0; canvas.height = 0;`，确保在编码完成后立即释放 GPU 纹理缓冲区，杜绝异步竞态与显存滞留。

### 1.3 首页与订阅页长列表网格计算（`GridCoordinator` & `GridCalculator`）
- **瓶颈诊断**：在无限滚动 Feed 流中，纯 JS 内存计算（几百个元素的数组遍历）开销极小（$< 0.05\text{ms}$），真正的性能瓶颈在于 `insertBefore` 触发的浏览器 Style/Layout Recalculation。同时，若采用纯局部增量计算，在遇到混排货架（Shorts、推广位）或前置卡片移除时会导致全局余数级联失效。
- **技术方案**：
  1. **DOM 变动最小 Diff（Minimal DOM Mutation Diffing）**：保持全量拓扑规划以保证全局余数对齐的一致性；在 DOM 应用阶段比对目标位置与当前实际位置，**仅对实际顺序发生变更的节点调用 `insertBefore`**，避免无谓的 DOM 移动；
  2. **微任务批处理防抖（Microtask Batching）**：使用 `queueMicrotask` 合并连续触发的 `childList` 变动，确保一帧内最多只执行一次重平衡计算。

### 1.4 评论区展开器相交观察者精准调度（`ObserverRegistry` & `TabviewLifecycleCoordinator`）
- **瓶颈诊断**：当用户停留在「视频简介」或「推荐列表」Tab 时，评论区处于不可见状态，后台相交计算应尽可能降至最低；同时不能因直接调用 `disconnect()` 而丢失已注册元素的目标引用。
- **技术方案**：
  - **活跃 Tab 状态守卫（Active Tab Guard）**：在 `commentIntersectionObserver` 的回调入口增加当前活跃 Tab 状态判断。非评论 Tab 时直接短路返回，零成本消除后台帧的几何重算，同时保留全部已挂载展开器的监听链路，保证切回评论区时生命周期无缝衔接。

### 1.5 构建插件与内联子包 Tree-Shaking（`tabview-bundle.ts`）
- **瓶颈诊断**：页面端注入子包 `virtual:tabview-page-bundle` 采用 IIFE 字符串形式内联入脚本，未压缩的代码会增加油猴脚本体积及 `document-start` 阶段的语法解析耗时。
- **技术方案**：
  - **环境感知构建（Environment-Aware Bundling）**：生产模式下开启 esbuild 的 `minify: true`, `treeShaking: true`, `legalComments: 'none'`，开发模式保留 sourcemap，显著缩减最终 Userscript 体积并提升首屏注入速度。

---

## 2. 拟修改与优化文件清单

### [MODIFY] [shortcuts.ts](file:///e:/project/YouTube_Improvements/src/core/shortcuts.ts)
- 维护 `registeredKeysSet` 实现按键前置快速短路；
- 重构 `isTypingContext` 为两级检查策略（Target 浅层直检 + ComposedPath 兜底）。

### [MODIFY] [controller.ts (Player)](file:///e:/project/YouTube_Improvements/src/features/player/controller.ts)
- 优化 `captureScreenshot`，移除 `toDataURL` 内存占用；
- 在 `toBlob` 回调结算中安全执行 `canvas.width = 0; canvas.height = 0`。

### [MODIFY] [coordinator.ts (Grid)](file:///e:/project/YouTube_Improvements/src/features/grid/coordinator.ts)
- 引入微任务批处理机制（Microtask Batching）；
- 实现 DOM 操作的最小 Diff 判定，避免对已对齐的节点重复执行 `insertBefore`。

### [MODIFY] [observer-registry.ts](file:///e:/project/YouTube_Improvements/src/features/tabview/page/observer-registry.ts)
- 在相交观察者回调中接入活跃 Tab 守卫，优化非评论区 Tab 期间的相交计算开销。

### [MODIFY] [tabview-bundle.ts](file:///e:/project/YouTube_Improvements/build/plugins/tabview-bundle.ts)
- 配置生产环境 esbuild 压缩、死码消除与注释清理。

---

## 3. 验证计划

### 3.1 自动化与静态类型检查
- 执行 `pnpm run check` 确保 TypeScript 严格模式类型校验完全通过（0 错误，显式类型声明，无隐式 any）。
- 执行 `pnpm run build` 确保 Userscript 主脚本与虚拟模块编译压缩正常，验证构建产物体积缩减。

### 3.2 运行时与性能指标验证
1. **快捷键热路径验证**：在搜索框、评论框与实时聊天室中连续快速打字，验证快捷键分发器主线程耗时 $< 0.001\text{ms}$，无任何误触发；按下注册快捷键（`Alt+[` / `Shift+D` 等）精准响应；
2. **高清截图与显存验证**：在 4K 视频下连续多次执行截图，验证文件正常保存、下载后 GPU 纹理显存立即释放、无多余内存常驻；
3. **评论展开器联动验证**：在简介与推荐 Tab 之间切换，切回评论区 Tab 后滚动浏览，验证展开器计算与评论计数工作正常；
4. **长列表滚动流畅度验证**：在首页连续下滚数十屏，验证网格对齐计算无累积卡顿与 Layout 回流抖动。
