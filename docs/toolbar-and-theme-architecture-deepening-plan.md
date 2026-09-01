# YouTube Turbo – 工具栏与主题子系统深模块化重构方案

本方案基于 **Codebase Design** 哲学（深模块 Deep Modules、清晰 Seam、高杠杆 Leverage、局部性 Locality 与删除测试 Deletion Test），针对架构设计中提出的 **Candidate 4（工具栏与插槽挂载总线对齐）** 与 **Candidate 5（主题子系统全内聚深化）** 制定严谨、完备且可落地的深化重构方案。

---

## 1. 架构目标与设计原则

- **消除架构决策与物理代码脱节（Architecture-Code Sync）**：彻底对齐 [ADR 0005](adr/0005-unified-slot-mount-bus.md) 确立的架构命名（`SlotMountBus`），重命名物理文件并清除遗留别名 `ReactiveMounter`。
- **可逆动作生命周期与声明式插槽推导（Reversible Action Lifecycle & Declarative Slots）**：为 `ActionRegistry` 建立 Disposer 动作注销机制；`ToolbarController` 根据活跃动作自动推导并驱动插槽挂载与回收，消除配置中心对底层插槽的硬编码命令式拼装。
- **主题领域完整内聚（Theme Domain Cohesion）**：将分散的深浅色 Cookie 控制与彩虹进度条视觉样式统合收敛至 `ThemeController` 深模块，统一方法生命周期契约，消除 16 行浅层门面文件 `progress-bar.ts`。
- **高杠杆与删除测试（Leverage & Deletion Test）**：删除冗余的别名导出与浅层包装，使全站工具栏与主题交互的外部 Seam 极致精简且测试面收敛。

---

## 2. 领域模型与术语对齐

- **`SlotMountBus`**：多插槽聚合挂载总线，将全站所有待就绪工具栏插槽（播放器控制栏、Shorts 动作栏、视频元数据栏等）的突变侦测合并为单遍扫描观察器，全部挂载后即刻停机。
- **`ToolbarController`**：多插槽悬浮工具箱与操作栏核心深模块，统管插槽定义、UI 节点构建、弹层定位、动作声明式注册与生命周期分发。
- **`ActionRegistry`**：工具栏动作配置与状态绑定注册表，负责动作配置存储、排序、图标解析、状态订阅及 Disposer 动态注销。
- **`ThemeController`**：YouTube 主题统管深模块，封装 Cookie `PREF` 中的 `f6` 标记解析/写入、页面刷新调度以及彩虹流光进度条样式生命周期。
- **`StyleEngine`**：动态样式注入与移除引擎，统管全局 CSS 规则注入生命周期。

---

## 3. Candidate 4：工具栏与插槽挂载总线深化 (`SlotMountBus` 与 `ToolbarController`)

### 3.1 现状分析与摩擦点 (Friction)

1. **文件名与架构决策脱节（Naming Lag）**：
   - [ADR 0005](adr/0005-unified-slot-mount-bus.md) 确立了 `SlotMountBus` 架构并废除了旧有的 `ReactiveMounter`。然而物理文件仍命名为 `src/ui/toolbar/reactive-mounter.ts`，且在底部保留了兼容别名 `export { SlotMountBus as ReactiveMounter };`。
2. **插槽挂载与动作注册命令式割裂（Scattered Imperative Slot Wiring）**：
   - 在 `src/features/download/index.ts` 中，`VideoDownloadService.init()` 注册了 3 个插槽的动作（`SLOT_PLAYER_CONTROLS`、`SLOT_SHORTS_ACTIONS`、`SLOT_WATCH_METADATA`）。
   - 但是在 `src/registry/descriptors.ts` 中，特性描述符 `isOpenYoutubedownloading` 却必须手动写死具体插槽的挂载与卸载：
     ```typescript
     setup: () => {
       Toolbar.mount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
       Toolbar.mount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
     },
     teardown: () => {
       Toolbar.unmount(TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS);
       Toolbar.unmount(TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA);
     }
     ```
   - 外部调用者被强迫感知具体 DOM 插槽命名，破坏了封装性。
3. **缺少动作注销能力导致生命周期无法闭环**：
   - `ActionRegistry` 仅支持 `register`，没有单个或批量注销动作的机制。当用户在运行时关闭某特性时，无法从共享容器（如播放器悬浮窗）中动态移除对应的动作按钮。

### 3.2 重构方案与架构演进

#### 架构结构演变

```
【重构前】
descriptors.ts (手动命令式拼装具体插槽)
   │
   ├─► Toolbar.mount(SLOT_SHORTS_ACTIONS) ────┐
   ├─► Toolbar.mount(SLOT_WATCH_METADATA) ───┤
   │                                         ▼
VideoDownloadService ──► registerActions() ─► ToolbarController
(不可逆一次性注册)                                │
                                              ▼
                                   reactive-mounter.ts
                                   (Alias: ReactiveMounter)

【重构后】
descriptors.ts
   │
   ▼ [极简领域 Seam]
VideoDownloadService.enable() / disable()
   │
   ▼ [持有 Disposer 清理句柄]
Toolbar.registerActions(...) ──► ActionRegistry (支持 register / unregister)
   │
   ▼ [自动根据活跃动作推导插槽挂载/卸载]
ToolbarController (Deep Module: 自动维护活跃插槽生命周期)
   │
   ▼ [内部 Seam]
slot-mount-bus.ts (SlotMountBus: 单一聚合突变总线，就绪即停机)
```

#### 具体改动明细

1. **物理文件重命名与别名清理**：
   - 将 `src/ui/toolbar/reactive-mounter.ts` 重命名为 `src/ui/toolbar/slot-mount-bus.ts`；
   - 彻底删除 `export { SlotMountBus as ReactiveMounter };` 遗留别名；
   - 更新 `src/ui/toolbar/index.ts` 与 `src/ui/toolbar/toolbar.ts` 中的导入路径。

2. **`ActionRegistry` 引入反注册与 Disposer 机制**：
   - 扩展 `ActionRegistry`：
     ```typescript
     public static register(actionConfig: ActionConfig): () => void {
       this.actions.set(actionConfig.id, actionConfig);
       return () => this.unregister(actionConfig.id);
     }

     public static registerAll(configs: ActionConfig[]): () => void {
       configs.forEach((c) => this.actions.set(c.id, c));
       return () => {
         configs.forEach((c) => this.unregister(c.id));
       };
     }

     public static unregister(actionId: string): void {
       this.unbindActionState(actionId);
       this.actions.delete(actionId);
     }
     ```

3. **深化 `ToolbarController` 的动作与插槽自动响应联动**：
   - `ToolbarController.registerAction` 与 `registerActions` 返回对应的 `Disposer`，并在注册/注销时自动调用 `syncSlots()`：
     - 若特定插槽存在可用动作且未挂载，则自动触发 `mount(slotKey)`；
     - 若特定独立插槽（如 Shorts 动作栏、元数据栏）的所有动作均已被注销，则自动触发 `unmount(slotKey)` 并清理 DOM；
     - 若播放器悬浮窗（共享插槽）内的动作发生变化，自动触发局部重新渲染。

4. **`VideoDownloadService` 领域生命周期收敛**：
   - 封装为完整的 `enable()` 与 `disable()` 契约：
     ```typescript
     export class VideoDownloadService {
       private static unregisterFn: (() => void) | null = null;

       public static enable(): void {
         if (this.unregisterFn) return;
         this.unregisterFn = Toolbar.registerActions([
           { id: "download", slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS, ... },
           { id: "shorts_download", slot: TOOLBAR_CONSTANTS.SLOT_SHORTS_ACTIONS, ... },
           { id: "watch_download", slot: TOOLBAR_CONSTANTS.SLOT_WATCH_METADATA, ... }
         ]);
       }

       public static disable(): void {
         if (this.unregisterFn) {
           this.unregisterFn();
           this.unregisterFn = null;
         }
       }
     }
     ```

5. **`src/registry/descriptors.ts` 契约简化**：
   - 彻底移除对 `Toolbar.mount(TOOLBAR_CONSTANTS.SLOT_*)` 的硬编码调用：
     ```typescript
     {
       id: "isOpenYoutubedownloading",
       i18nKey: "function_is_youtube_downloading_open",
       titleI18nKey: "feature_youtube_downloading_title",
       descI18nKey: "feature_youtube_downloading_desc",
       defaultValue: true,
       order: 40,
       setup: () => VideoDownloadService.enable(),
       teardown: () => VideoDownloadService.disable()
     }
     ```

### 3.3 收益（Wins）

- **Domain & ADR Alignment**：源码文件命名与 [ADR 0005](adr/0005-unified-slot-mount-bus.md) 决策 100% 对齐，彻底消除历史遗留别名。
- **Locality & High Cohesion**：全站所有插槽定义、UI 元素构建、突变监听调度及生命周期管理完全集中在 `src/ui/toolbar/` 模块内部，特性模块仅管理自身动作。
- **Reversible Lifecycle**：动作支持动态注册与注销，运行时开启/关闭特性时，插槽与浮层按钮均能实现确定性的自动装载与干净回收。

---

## 4. Candidate 5：统合 Theme 模块能力（归并彩虹进度条至 `ThemeController`）

### 4.1 现状分析与摩擦点 (Friction)

1. **功能碎片化与浅包装（Fragmented Shallow Module）**：
   - `src/features/theme/` 拆分为 `theme-controller.ts` 与 `progress-bar.ts`（16 行）。
   - `ThemeProgressbar` 仅是一个转发 `StyleEngine.inject` 与 `StyleEngine.remove` 的浅层门面，并在内部硬编码了样式 ID `"theme-progressbar"`。
2. **方法命名契约不一致**：
   - `ThemeController` 采用 `init()` 与 `toggleTheme()`；
   - `ThemeProgressbar` 使用了 `start()` 与 `destroy()`；
   - `descriptors.ts` 必须为不同模块适配不同的方法名。
3. **测试面分散**：
   - 外部调用和单元测试需要分别针对两个文件建立 Mock 与测试用例。

### 4.2 重构方案与架构演进

#### 架构结构演变

```
【重构前】
descriptors.ts / main.ts
   │
   ├─► ThemeProgressbar.start() / destroy() ──► progress-bar.ts (16 LOC 浅包装)
   │                                                 │
   │                                                 ▼
   │                                            StyleEngine.inject()
   │
   └─► ThemeController.getInstance().init() ──► theme-controller.ts (Cookie/Toolbar)

【重构后】
descriptors.ts / main.ts
   │
   ▼ [唯一 Theme 域 Seam]
ThemeController.getInstance()
   │
   ├── init() / getTheme() / setTheme() / toggleTheme()  (Cookie 持久化与模式切换)
   ├── enableProgressBar() / disableProgressBar()        (彩虹进度条流光样式管理)
   │
   ▼ [内部实现]
PrefCookieCodec + StyleEngine
```

#### 具体改动明细

1. **常量集中管理**：
   - 在 `src/features/theme/constants.ts` 中补充样式 ID 常量：
     ```typescript
     export const THEME_CONSTANTS = {
       PREF_COOKIE_NAME: "PREF",
       COOKIE_DOMAIN: ".youtube.com",
       COOKIE_PATH: "/",
       COOKIE_MAX_AGE_SECONDS: 63072000,
       FLAG_KEY: "f6",
       FLAG_DARK_VALUE: "400",
       FLAG_LIGHT_VALUE: "80000",
       STYLE_ID_PROGRESS_BAR: "theme-progressbar"
     } as const;
     ```

2. **深化 `ThemeController` 接口**：
   - 在 `ThemeController` 中集成彩虹进度条生命周期控制方法：
     ```typescript
     import progressBarCss from "./progress-bar.css?raw";

     public enableProgressBar(): void {
       if (!/youtube\.com/.test(window.location.host)) return;
       StyleEngine.inject(THEME_CONSTANTS.STYLE_ID_PROGRESS_BAR, progressBarCss);
     }

     public disableProgressBar(): void {
       StyleEngine.remove(THEME_CONSTANTS.STYLE_ID_PROGRESS_BAR);
     }
     ```

3. **执行删除测试（Deletion Test）**：
   - 物理删除浅模块文件 `src/features/theme/progress-bar.ts`。

4. **更新模块导出 `src/features/theme/index.ts`**：
   - 仅导出 `ThemeController`、`THEME_CONSTANTS` 及公共类型（`ThemeMode`、`ThemeOptions`）。

5. **更新 `src/registry/descriptors.ts`**：
   - 将 `isOpenThemeProgressBar` 指向 `ThemeController`：
     ```typescript
     {
       id: "isOpenThemeProgressBar",
       i18nKey: "function_is_theme_progress_bar_open",
       titleI18nKey: "feature_theme_progress_bar_title",
       descI18nKey: "feature_theme_progress_bar_desc",
       defaultValue: true,
       order: 30,
       setup: () => ThemeController.getInstance().enableProgressBar(),
       teardown: () => ThemeController.getInstance().disableProgressBar()
     }
     ```

### 4.3 收益（Wins）

- **Locality**：YouTube 所有主题与视觉个性化（深浅色模式切换、Cookie 属性、彩虹进度条样式）全部收敛在 `ThemeController` 单一深模块内。
- **Interface Uniformity**：消除 `start` / `destroy` 歧义命名，统一为标准化声明式方法契约。
- **Deletion Test**：删除无状态浅层文件，减少模块数量与调用层级。

---

## 5. 协同依赖与执行顺序矩阵

为保证重构过程中的每一步均符合**零构建报错**与**零类型错误**（`pnpm check` + `pnpm build` 全程绿灯），按以下依赖序分步推进：

| 阶段 | 任务目标 | 依赖前置项 | 涉及文件 |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Candidate 4: 重构 `SlotMountBus` 物理命名与消除别名 | 无 | `src/ui/toolbar/reactive-mounter.ts` → `src/ui/toolbar/slot-mount-bus.ts`<br/>`src/ui/toolbar/toolbar.ts`<br/>`src/ui/toolbar/index.ts` |
| **Phase 2** | Candidate 4: 扩展 `ActionRegistry` 反注册与 `ToolbarController` 联动 | Phase 1 | `src/ui/toolbar/action-registry.ts`<br/>`src/ui/toolbar/toolbar.ts`<br/>`src/features/download/index.ts`<br/>`src/registry/descriptors.ts` |
| **Phase 3** | Candidate 5: 统合 Theme 模块能力，归并彩虹进度条 | 无 | `src/features/theme/constants.ts`<br/>`src/features/theme/progress-bar.ts` (删除)<br/>`src/features/theme/theme-controller.ts`<br/>`src/features/theme/index.ts`<br/>`src/registry/descriptors.ts` |
| **Phase 4** | 产物构建与类型全量校验 | Phase 1-3 | 全量 TypeScript 严格模式检查与打包验证 |

---

## 6. 验证计划 (Verification Plan)

### 6.1 自动化检查 (Automated Checks)
```bash
# 1. 严格模式类型检查（严禁隐式 any，零类型报错）
pnpm check

# 2. 生产环境 Userscript 产物打包验证
pnpm build
```

### 6.2 模块功能回归验证 (Functional Invariant Checks)
1. **Toolbar 与插槽挂载总线**：
   - 打开普通播放页（`/watch`），播放器右下角工具箱按钮与视频元数据栏下载按钮正常挂载且无重复注入。
   - 打开 Shorts 页面（`/shorts`），右侧竖排下载按钮正常就绪。
   - 所有插槽挂载完毕后，`SlotMountBus` 的 `MutationObserver` 立即主动 `disconnect()`，主线程开销归零。
   - 在设置面板中关闭“视频下载”特性时，播放器悬浮窗下载按钮及 Shorts/元数据栏按钮立即干净移除，对应插槽自动停机。
2. **Theme 主题与彩虹进度条**：
   - 点击工具栏主题切换按钮，Cookie `f6` 标记正确写入并刷新切换深/浅色模式。
   - 开启彩虹进度条特性时，播放器进度条与加载缓冲流光动画正常渲染；关闭特性时，样式即刻干净移除。
