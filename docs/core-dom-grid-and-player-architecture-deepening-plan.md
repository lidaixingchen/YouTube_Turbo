# YouTube Turbo – DOM 注册表、网格与播放器核心子系统深模块化重构方案

本方案基于 **Codebase Design** 哲学（深模块、清晰 Seam、高杠杆 Leverage、局部性 Locality 与 Deletion Test），针对架构审查报告中提出的前三大核心候选项（Candidate 1、Candidate 2、Candidate 3）制定详尽、严谨且可落地的深化重构方案。

---

## 1. 架构目标与设计原则

- **深模块（Deep Module）**：提供极小、高杠杆（Leverage）的公开 Interface，将 DOM 句柄弱引用生命周期、媒体查询与局部网格静默重排、播放器调速/截图/画中画/快捷键统一封装在内部。
- **删除测试（Deletion Test）**：删除中间浅层门面（Shallow Facade / Passthrough Wrappers）后，不仅不丢失任何功能，反而在单一真正实现处收敛复杂度（Concentrate Complexity）。
- **职责纯化与正交性（Orthogonality & Single Responsibility）**：DOM 注册表专精于节点缓存与响应式等待，媒体控制逻辑彻底归位至播放器控制器，消除抽象泄漏与双向依赖。
- **测试面即接口（The Interface is the Test Surface）**：Callers 与自动化测试穿过同一个清晰的 Seam 交互，杜绝测试穿透至已封装的私有内部零件。
- **终态无痕原则（Clean Final State）**：交付的代码、注释及接口定义基于干净的最终状态，代码内无试错痕迹与防御性历史记录。

---

## 2. 领域模型与术语对齐 (`CONTEXT.md`)

- **`ReactiveDOMRegistry`**：DOM 核心句柄缓存与响应式等待深模块，持有高频核心元素（播放器容器、视频节点、元数据标题等）的 WeakRef 缓存，与 `yt-navigate-finish` 路由生命周期对齐自动失效。专精于 DOM 探测与句柄提供，不承载播放控制业务。
- **`GridCoordinator`**：首页与订阅页 4 列网格自适应统管深模块，统管局部容器 DOM 突变监听、行布局指令重排与原生 CSS 媒体查询自适应。规避 `FourColumnGrid`、`GridManager` 与 `GridDOMAdapter` 等浅层别名。
- **`PlayerController`**：播放器核心底座深模块，统管播放速率、单曲循环、原生画中画、物理分辨率截图及播放器快捷键全生命周期，直接驱动底层 `<video>` 元素与浏览器媒体 API。
- **`PlayerSpeedButtonView`**：播放器控制栏右下角倍速展示按钮与悬浮倍速菜单的轻量视图适配层（作为 `PlayerController` 的内部 View Adapter）。
- **`StyleEngine`**：动态样式注入与移除引擎，统管全局 CSS 注入生命周期。

---

## 3. Candidate 1：消除 `dom-adapter.ts` 浅层表象，纯化 `ReactiveDOMRegistry`

### 3.1 现状分析与摩擦点 (Friction)

1. **100% 盲转发的浅门面（Shallow Facade）**：
   - `src/core/dom-adapter.ts` 导出的 `YouTubeDOMAdapter` 包含 13 个静态方法，无一例外只是对 `ReactiveDOMRegistry.getInstance()` 的简单直转（Pass-through）。
   - 其 Interface 的表面积与 Implementation 完全等大，增加无谓间接层。
2. **多余杂项包装与违规隐患**：
   - `commonUtil` 杂糅了 `addStyle`（存在回退至 `document.head.appendChild` 的违规逻辑）、过时的 `waitForElementByInterval`、仅在 adblock 中使用的 `onPageLoad` 以及仅在 download 中使用的 `openInTab`。
3. **`ReactiveDOMRegistry` 职责越界（Abstraction Leak）**：
   - `ReactiveDOMRegistry` 内部混合了媒体控制逻辑（`setPlaybackRate`、`setLoop`、`requestPictureInPicture` 等），导致 DOM 注册表与播放器控制器职责不清。

### 3.2 重构方案与架构演进

#### 架构结构演变

```
【重构前】
Callers (PlayerController / CaptionRenderer / PlaybackHUD / Download / Adblock)
   │
   ├─► YouTubeDOMAdapter (100% 浅层转发) ──► ReactiveDOMRegistry.getInstance()
   │                                           └─► 混杂媒体控制操作 (setLoop, PiP 等)
   └─► commonUtil (杂项工具集合) ──────────► StyleEngine / GM_openInTab / onPageLoad

【重构后】
Callers (PlayerController / CaptionRenderer / PlaybackHUD / Download / Adblock)
   │
   ├─► [Seam 1] ReactiveDOMRegistry.getInstance()  (纯粹的常数时间句柄缓存、路由失效、响应式等待)
   ├─► [Seam 2] StyleEngine.inject() / remove()    (严格声明式样式注入)
   ├─► [Seam 3] PlayerController 媒体核心操作       (原生 video 属性与 PiP API 直接驱动)
   ├─► [Seam 4] Download 模块内部私有 openInTab     (局部性收敛，不污染全局 core)
   └─► [Seam 5] Adblock 模块同步 StyleEngine.inject (消除无谓 onPageLoad 等待，规避样式闪烁)
```

#### 具体改动明细

1. **纯化 `ReactiveDOMRegistry`**：
   - 移除非 DOM 职责的媒体操作方法（`setPlaybackRate`、`getPlaybackRate`、`setLoop`、`isLoop`、`requestPictureInPicture`、`exitPictureInPicture`、`isPictureInPictureActive`）。
   - 仅保留核心 DOM 查询与等待能力：`getVideoElement`、`getPlayerContainer`、`getVideoTitleElement`、`getVideoTitle`、`getVideoResolution`、`getCurrentTime`、`getDuration`、`waitForVideoElement`、`waitForElement`、`invalidateCache`。
2. **废除并物理删除**：`src/core/dom-adapter.ts`。
3. **迁移与收敛所有调用方**：
   - `src/core/hud.ts`：将 `YouTubeDOMAdapter.getPlayerContainer()` 替换为 `ReactiveDOMRegistry.getInstance().getPlayerContainer()`。
   - `src/features/player/controller.ts`：将所有 `YouTubeDOMAdapter` 调用直接替换为 `ReactiveDOMRegistry.getInstance()` 节点获取，媒体控制直接操作 `HTMLVideoElement` 与原生 `document.pictureInPicture*` API。
   - `src/features/player/speed-button-view.ts`：直接使用 `ReactiveDOMRegistry.getInstance()`。
   - `src/features/caption/renderer.ts`：直接调用 `ReactiveDOMRegistry.getInstance().getVideoElement()` 与 `getPlayerContainer()`。
   - `src/features/adblock/index.ts`：移除 `commonUtil.onPageLoad` 包装，在 `run()` 中直接同步调用 `this.markADHTMLElement()` 执行 `StyleEngine.inject`。
   - `src/features/download/index.ts`：将跨环境标签页打开逻辑作为模块内部私有辅助函数 `openInTab(url)` 收敛在 `src/features/download/index.ts` 中，遵从 Locality 原则。

### 3.3 收益（Wins）

- **Locality**：DOM 句柄缓存全生命周期、弱引用维护及路由失效完全收敛于 `ReactiveDOMRegistry`；专用工具函数收敛于对应 feature 内部。
- **Orthogonality**：DOM 注册表与播放器控制器职责完全解耦。
- **Deletion Test**：删除 122 行无实际凝聚力的胶水代码，代码库表面积显著减少。

---

## 4. Candidate 2：折叠 Grid 子系统双重浅层包装，统一聚合至 `GridCoordinator`

### 4.1 现状分析与摩擦点 (Friction)

1. **双重命名空间冗余（Double Namespace Wrappers）**：
   - `src/features/grid/adapter.ts` 定义了 14 行的 `GridDOMAdapter`，仅转发 `GridCoordinator.getInstance()` 的 3 个方法，且未被任何核心代码使用（死代码）。
   - `src/features/grid/index.ts` 定义了 35 行的 `FourColumnGrid` 对象字面量，同样全量转发给 `GridCoordinator.getInstance()`。
2. **违背领域模型规范**：
   - `CONTEXT.md` 明确声明应使用 `GridCoordinator` 并规避 `FourColumnGrid` 与 `GridDOMAdapter`，但 `src/registry/descriptors.ts` 仍通过 `FourColumnGrid.run()` / `destroy()` 进行间接调用。

### 4.2 重构方案与架构演进

#### 架构结构演变

```
【重构前】
descriptors.ts
   │
   ▼
FourColumnGrid (index.ts 浅层转发)
   │
   ▼
GridCoordinator.getInstance() ◄── [死代码] GridDOMAdapter (adapter.ts)
   │
   ├── GridCalculator (纯计算)
   ├── ScopedGridObserver (局部突变监听)
   └── StyleEngine (CSS 媒体查询)

【重构后】
descriptors.ts
   │
   ▼ [唯一 Seam]
GridCoordinator.getInstance().init() / destroy() / rebalance()
   │
   ├── GridCalculator (内部纯计算)
   ├── ScopedGridObserver (内部局部突变监听与静默锁)
   └── StyleEngine (内部样式引擎注入)
```

#### 具体改动明细

1. **物理删除**：`src/features/grid/adapter.ts`。
2. **重构 `src/features/grid/index.ts`**：
   - 移除 `FourColumnGrid` 浅对象导出。
   - 统一导出 `GridCoordinator`、`GRID_CONSTANTS` 及必要类型定义。
3. **更新 `src/registry/descriptors.ts`**：
   - 将 `isOpenFourColumnGrid` 特性描述符的 `setup` 与 `teardown` 直接绑定至：
     ```typescript
     setup: () => GridCoordinator.getInstance().init(),
     teardown: () => GridCoordinator.getInstance().destroy()
     ```

### 4.3 收益（Wins）

- **Domain Alignment**：代码实现与 `CONTEXT.md` 领域词汇保持 100% 严格一致。
- **Locality**：4 列响应式 CSS 注入、媒体断点监听、DOM 节点重排计划与执行静默锁完全内聚在 `GridCoordinator`。
- **Test Surface**：单元测试与集成测试仅需针对 `GridCoordinator` 单一入口进行断言。

---

## 5. Candidate 3：深化 `PlayerController`，收敛播放器交互碎片与快捷键绑定

### 5.1 现状分析与摩擦点 (Friction)

1. **功能割裂（Scattered Surface）**：
   - 播放器增强特性在 `src/registry/descriptors.ts` 中被拆分为 2 个分散模块手动调度：
     ```typescript
     setup: () => {
       PlayerSpeedButtonView.mount();
       PlayerShortcuts.enable();
     }
     ```
   - 外部调用者（Feature Registry）承担了将键盘快捷键（`PlayerShortcuts`）与控制栏 UI（`PlayerSpeedButtonView`）拼接到底座（`PlayerController`）的胶水工作。
2. **`PlayerShortcuts` 浅层粘合**：
   - `PlayerShortcuts`（97 行）自身不包含任何业务状态，仅将 6 个按键事件转发给 `PlayerController.getInstance()` 的具体方法。
3. **生命周期脆弱性**：
   - 快捷键与控制栏倍速按钮的挂载/卸载缺乏统一的状态机守卫，容易在复杂 SPA 切页时产生时序微差。

### 5.2 重构方案与架构演进

#### 架构结构演变

```
【重构前】
FeatureRegistry (descriptors.ts)
   │
   ├─► PlayerShortcuts.enable() ──────────┐
   │                                      ▼
   └─► PlayerSpeedButtonView.mount() ──► PlayerController.getInstance()

【重构后】
FeatureRegistry (descriptors.ts)
   │
   ▼ [唯一高杠杆 Seam]
PlayerController.getInstance().enableSpeedControl() / disableSpeedControl()
   │
   ├── [Internal Mechanism] Shortcut Dispatcher Bindings (按键监听集中注册/注销)
   ├── [Internal View Adapter] SpeedButtonView (倍速按钮与悬浮菜单按需挂载/卸载)
   └── [Core Engine] 媒体播放速率 / PiP / 物理分辨率截图 / 单曲循环
```

#### 具体改动明细

1. **深化 `PlayerController` 接口**：
   - 在 `PlayerController` 中提供高内聚生命周期管理方法：
     - `enableSpeedControl()`：原子化激活倍速 UI 挂载与播放器快捷键注册。
     - `disableSpeedControl()`：原子化卸载倍速 UI 并注销所有播放器快捷键。
2. **彻底内联并物理删除 `src/features/player/shortcuts.ts`**：
   - 将 6 个快捷键（`>`、`<`、`Shift+R`、`Shift+S`、`Shift+P`、`Shift+L`）的注册与注销作为 `PlayerController` 的私有方法（`setupShortcuts()` / `teardownShortcuts()`），向外部隐匿实现细节。
3. **收敛 `PlayerSpeedButtonView` 协作**：
   - `PlayerSpeedButtonView` 保持作为专注于 DOM 渲染的 View Adapter，由 `PlayerController` 内部在 `enableSpeedControl()` / `disableSpeedControl()` 时直接调度其 `mount()` 与 `unmount()`。
4. **更新 `src/registry/descriptors.ts`**：
   - `isOpenSpeedControl` 特性描述符精简为直接调度 `PlayerController`：
     ```typescript
     setup: () => PlayerController.getInstance().enableSpeedControl(),
     teardown: () => PlayerController.getInstance().disableSpeedControl()
     ```
5. **更新 `src/features/player/index.ts`**：
   - 精简导出表面，仅向外部暴露 `PlayerController`、`PLAYER_CONSTANTS` 及公共类型（`PlayerState`、`ScreenshotOptions`、`ScreenshotResult`）。

### 5.3 收益（Wins）

- **Leverage**：调用方调用单一 `enableSpeedControl()` 接口，即可同时激活 UI 视图、键盘调度与状态同步，杠杆率显著提升。
- **Locality**：播放器相关的核心状态机、快捷键事件、视图更新与底层 `<video>` 监听完全集中于 `PlayerController`。
- **Testability**：测试只需通过 `PlayerController` 统一驱动与验证，无需在测试中单独 Mock 和调度 `PlayerShortcuts`。
- **Deletion Test**：物理删除 `shortcuts.ts`（97 行），消除浅层转发。

---

## 6. 协同依赖与执行顺序矩阵

为保证每次提交均符合**零构建报错**与**零类型错误**（`pnpm check` + `pnpm build` 全程绿灯），重构按以下依赖序分步推进：

| 阶段 | 任务目标 | 依赖前置项 | 涉及文件 |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Candidate 1: 消除 `dom-adapter.ts` 浅层转发表象，纯化 `ReactiveDOMRegistry` | 无 | `src/core/dom-adapter.ts`<br/>`src/core/dom-registry.ts`<br/>`src/core/hud.ts`<br/>`src/features/player/controller.ts`<br/>`src/features/caption/renderer.ts`<br/>`src/features/adblock/index.ts`<br/>`src/features/download/index.ts` |
| **Phase 2** | Candidate 2: 折叠 Grid 子系统浅层包装至 `GridCoordinator` | Phase 1 | `src/features/grid/adapter.ts`<br/>`src/features/grid/index.ts`<br/>`src/registry/descriptors.ts` |
| **Phase 3** | Candidate 3: 深化 `PlayerController` 并内聚快捷键与倍速视图 | Phase 1 | `src/features/player/shortcuts.ts`<br/>`src/features/player/controller.ts`<br/>`src/features/player/index.ts`<br/>`src/registry/descriptors.ts` |
| **Phase 4** | 产物构建与全量类型校验 | Phase 1-3 | 全量 TypeScript 严格模式检查与打包验证 |

---

## 7. 验证计划 (Verification Plan)

### 7.1 自动化检查 (Automated Checks)
```bash
# 1. 严格模式类型检查（严禁隐式 any，零类型报错）
pnpm check

# 2. 生产环境 Userscript 产物打包验证
pnpm build
```

### 7.2 模块功能回归验证 (Functional Invariant Checks)
1. **DOM 注册表**：
   - 视频播放、暂停、调速时，HUD 浮层提示正常渲染且无 DOM 查询异常。
   - 字幕覆盖层在不同视频间切换时句柄自动失效并重新对齐。
2. **Grid 自适应网格**：
   - YouTube 首页与订阅页在 4 列/3 列/2 列媒体查询断点切换时，行布局自动重排且无自触发突变死循环。
3. **Player 播放控制与快捷键**：
   - 快捷键 `>`、`<`、`Shift+R`、`Shift+S`、`Shift+P`、`Shift+L` 响应灵敏且在输入框（评论区、搜索框）中正常被抑制。
   - 控制栏倍速展示与右键浮层菜单功能完好。
