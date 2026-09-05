# 播放器快捷键按能力解耦架构深化方案

## 1. 方案目标

本方案依据 [`player-speed-feature-lifecycle-architecture-deepening-plan.md`](player-speed-feature-lifecycle-architecture-deepening-plan.md) 确立的架构边界，对播放器内散落及捆绑的快捷键与辅助交互能力进行彻底的领域解耦：

1. **破除历史捆绑**：将原先寄宿在 `isOpenSpeedControl`（倍速特性）中的非倍速快捷键（`Shift+S`、`Shift+P`、`Shift+L`）与倍速能力彻底剥离；
2. **能力生命周期一体化**：将视频截图、原生画中画、单曲循环播放与倍速控制对等重构为 4 个独立的一等特性（First-class Features），统管各自的快捷键与控制栏 Toolbar Action；
3. **退守领域核心底座**：[`PlayerController`](../src/features/player/controller.ts) 彻底剥离快捷键与 UI 挂载副作用，成为专注于 HTML5 媒体元素状态机、Canvas 物理分辨率截帧、原生画中画调度与循环播放的纯粹领域模型；
4. **统一深模块门面**：为每个能力建立极简的生命周期门面（`enable()` / `disable()` / `isActive()`），实现按需激活、逆序注销与异常隔离；
5. **平滑向后兼容**：新特性全量采用 `defaultValue: true`，升级后无缝延续原有快捷键与控制栏交互体验。

---

## 2. 能力矩阵与范围边界

解耦后，播放器子系统划分为 4 个职责单一、互不干扰的独立能力：

| 能力标识 | 一等特性配置项 | 涵盖快捷键 | 控制栏 UI (Toolbar / Slot) | 对应生命周期深模块 | 排序 (Order) |
| --- | --- | --- | --- | --- | --- |
| **倍速控制** (Speed) | `isOpenSpeedControl` | `>`（加速）、`<`（减速）、`Shift+R`（重置 1.0x） | `PlayerSpeedButtonView` (控制栏右侧插槽) | `PlayerSpeedFeature` | 50 |
| **视频截图** (Screenshot) | `isOpenScreenshot` | `Shift+S` | 相机图标 Action (`order: 30`) | `PlayerScreenshotFeature` | 52 |
| **画中画** (PiP) | `isOpenPictureInPicture` | `Shift+P` | 画中画图标 Action (`order: 40`) | `PlayerPiPFeature` | 54 |
| **单曲循环** (Loop) | `isOpenLoopPlayback` | `Shift+L` | 循环状态图标 Action (`order: 50`) | `PlayerLoopFeature` | 56 |

### 架构边界约束

- **一体化启闭契约**：特性的启用与停用同时作用于其快捷键与控制栏图标。当用户在设置中禁用某一能力时，对应的快捷键立即解绑，且控制栏上的按钮同步销毁，不留孤儿监听与无效按钮；
- **底层底座共享**：4 个特性深模块作为交互协调层，底层均依托单例 `PlayerController` 提供的媒体核心 API；关闭任意辅助特性均不重置播放器底座的核心状态（如当前播放速率与视频句柄缓存）。

---

## 3. 目标架构设计

```text
FeatureRegistry (特性注册总线)
    |
    |-- setup() / teardown()
    |
    +---> PlayerSpeedFeature
    |       |-- 快捷键: > / < / Shift+R
    |       +-- 视图: PlayerSpeedButtonView (SlotMountBus)
    |
    +---> PlayerScreenshotFeature
    |       |-- 快捷键: Shift+S
    |       +-- 控制栏按钮: Toolbar Action (screenshot)
    |
    +---> PlayerPiPFeature
    |       |-- 快捷键: Shift+P
    |       +-- 控制栏按钮: Toolbar Action (pip)
    |
    +---> PlayerLoopFeature
            |-- 快捷键: Shift+L
            +-- 控制栏按钮: Toolbar Action (loop)
                    |
                    v (原子业务调度)
          PlayerController (纯领域底座单例)
            |-- 视频元素生命周期 & WeakRef 监听
            |-- 播放速率控制 (targetSpeed)
            |-- 高清画布截帧 (Canvas Blob 导出)
            |-- 原生画中画 API 封装
            +-- 单曲循环状态同步 (<video loop> & ended 事件)
```

### 分层职责划分

1. **配置与注册层 (`FeatureRegistry` & `descriptors.ts`)**：
   - 统一通过无参的 `enable()` 与 `disable()` 调度特性；
   - 不感知任何具体的按键字符串、DOM 节点或 Toolbar Action 实例。
2. **生命周期深模块门面 (`Player*Feature`)**：
   - 拥有该能力的交互生命周期；
   - 统管快捷键（`ShortcutDispatcher.register`）与工具栏动作（`Toolbar.registerActions`）的原子注册与逆序释放；
   - 维护内部私有布尔状态 `isEnabled`，提供常数时间幂等返回。
3. **领域核心模型 (`PlayerController`)**：
   - 剥离所有按键监听与 Toolbar 绑定逻辑；
   - 专注管理视频底层生命周期、状态机派发与浏览器底层 API 交互。

---

## 4. 领域词汇

实施时在 `CONTEXT.md` 登记与更新以下术语：

```markdown
**PlayerSpeedFeature**:
播放器倍速特性的生命周期深模块，原子协调调速快捷键（>、<、Shift+R）与 `PlayerSpeedButtonView` 视图适配器，封装装配、注销及失败回滚机制。
_Avoid_: SpeedControlManager, PlayerSpeedCoordinator, FeatureComposer

**PlayerScreenshotFeature**:
视频截图特性的生命周期深模块，原子协调快捷键（Shift+S）与控制栏截图 Action 的挂载与注销，调度 `PlayerController` 执行画布截帧。
_Avoid_: ScreenshotManager, CaptureCoordinator, ScreenshotService

**PlayerPiPFeature**:
原生画中画特性的生命周期深模块，原子协调快捷键（Shift+P）与控制栏画中画 Action 的挂载与注销，调度 `PlayerController` 切换画中画状态。
_Avoid_: PiPCoordinator, PictureInPictureManager

**PlayerLoopFeature**:
单曲循环播放特性的生命周期深模块，原子协调快捷键（Shift+L）与控制栏循环 Action 的挂载与注销，响应循环状态双向联动。
_Avoid_: LoopManager, RepeatCoordinator
```

> **注**：历史术语 `PlayerShortcuts`（集中式快捷键调度适配器）正式废弃，快捷键生命周期由各能力深模块去中心化独立拥有。

---

## 5. 最小公共接口与实现规范

### 5.1 截图能力深模块 (`src/features/player/screenshot-feature.ts`)

```typescript
import { ShortcutDispatcher } from "../../core/shortcuts";
import { Toolbar, TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PlayerController } from "./controller";

let isEnabled: boolean = false;
let shortcutCleanup: (() => void) | null = null;
let toolbarCleanup: (() => void) | null = null;

function teardownSafely(): void {
  if (shortcutCleanup) {
    try {
      shortcutCleanup();
    } catch (err: unknown) {
      console.error("[PlayerScreenshotFeature] Shortcut unbind error:", err);
    }
    shortcutCleanup = null;
  }

  if (toolbarCleanup) {
    try {
      toolbarCleanup();
    } catch (err: unknown) {
      console.error("[PlayerScreenshotFeature] Toolbar unbind error:", err);
    }
    toolbarCleanup = null;
  }
}

export const PlayerScreenshotFeature: Readonly<{
  readonly enable: () => void;
  readonly disable: () => void;
  readonly isActive: () => boolean;
}> = Object.freeze({
  enable(): void {
    if (isEnabled) {
      return;
    }

    try {
      shortcutCleanup = ShortcutDispatcher.register({
        key: "s",
        shiftKey: true,
        description: "Capture screenshot",
        handler: () => {
          PlayerController.getInstance().captureScreenshot().catch((err: unknown) => {
            console.error("[PlayerScreenshotFeature] Screenshot error:", err);
          });
        }
      });

      toolbarCleanup = Toolbar.registerActions([
        {
          id: "screenshot",
          slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
          titleKey: "action_screenshot",
          defaultTitle: "Screenshot",
          icon: "screenshot",
          order: 30,
          dismissOnExecute: true,
          onClick: () => {
            PlayerController.getInstance().captureScreenshot().catch((err: unknown) => {
              console.error("[PlayerScreenshotFeature] Toolbar screenshot error:", err);
            });
          }
        }
      ]);

      isEnabled = true;
    } catch (error: unknown) {
      isEnabled = false;
      teardownSafely();
      throw error;
    }
  },

  disable(): void {
    if (!isEnabled) {
      return;
    }

    isEnabled = false;
    teardownSafely();
  },

  isActive(): boolean {
    return isEnabled;
  }
});
```

### 5.2 画中画能力深模块 (`src/features/player/pip-feature.ts`)

```typescript
import { ShortcutDispatcher } from "../../core/shortcuts";
import { Toolbar, TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PlayerController } from "./controller";

let isEnabled: boolean = false;
let shortcutCleanup: (() => void) | null = null;
let toolbarCleanup: (() => void) | null = null;

function teardownSafely(): void {
  if (shortcutCleanup) {
    try {
      shortcutCleanup();
    } catch (err: unknown) {
      console.error("[PlayerPiPFeature] Shortcut unbind error:", err);
    }
    shortcutCleanup = null;
  }

  if (toolbarCleanup) {
    try {
      toolbarCleanup();
    } catch (err: unknown) {
      console.error("[PlayerPiPFeature] Toolbar unbind error:", err);
    }
    toolbarCleanup = null;
  }
}

export const PlayerPiPFeature: Readonly<{
  readonly enable: () => void;
  readonly disable: () => void;
  readonly isActive: () => boolean;
}> = Object.freeze({
  enable(): void {
    if (isEnabled) {
      return;
    }

    try {
      shortcutCleanup = ShortcutDispatcher.register({
        key: "p",
        shiftKey: true,
        description: "Toggle Picture-in-Picture",
        handler: () => {
          PlayerController.getInstance().togglePictureInPicture().catch((err: unknown) => {
            console.error("[PlayerPiPFeature] PiP error:", err);
          });
        }
      });

      toolbarCleanup = Toolbar.registerActions([
        {
          id: "pip",
          slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
          titleKey: "action_pip",
          defaultTitle: "Picture in Picture",
          icon: "pip",
          order: 40,
          dismissOnExecute: true,
          onClick: () => {
            PlayerController.getInstance().togglePictureInPicture().catch((err: unknown) => {
              console.error("[PlayerPiPFeature] Toolbar PiP error:", err);
            });
          }
        }
      ]);

      isEnabled = true;
    } catch (error: unknown) {
      isEnabled = false;
      teardownSafely();
      throw error;
    }
  },

  disable(): void {
    if (!isEnabled) {
      return;
    }

    isEnabled = false;
    teardownSafely();
  },

  isActive(): boolean {
    return isEnabled;
  }
});
```

### 5.3 单曲循环能力深模块 (`src/features/player/loop-feature.ts`)

```typescript
import { ShortcutDispatcher } from "../../core/shortcuts";
import { Toolbar, TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PlayerController } from "./controller";

let isEnabled: boolean = false;
let shortcutCleanup: (() => void) | null = null;
let toolbarCleanup: (() => void) | null = null;

function teardownSafely(): void {
  if (shortcutCleanup) {
    try {
      shortcutCleanup();
    } catch (err: unknown) {
      console.error("[PlayerLoopFeature] Shortcut unbind error:", err);
    }
    shortcutCleanup = null;
  }

  if (toolbarCleanup) {
    try {
      toolbarCleanup();
    } catch (err: unknown) {
      console.error("[PlayerLoopFeature] Toolbar unbind error:", err);
    }
    toolbarCleanup = null;
  }
}

export const PlayerLoopFeature: Readonly<{
  readonly enable: () => void;
  readonly disable: () => void;
  readonly isActive: () => boolean;
}> = Object.freeze({
  enable(): void {
    if (isEnabled) {
      return;
    }

    try {
      shortcutCleanup = ShortcutDispatcher.register({
        key: "l",
        shiftKey: true,
        description: "Toggle Loop playback",
        handler: () => {
          PlayerController.getInstance().toggleLoop();
        }
      });

      toolbarCleanup = Toolbar.registerActions([
        {
          id: "loop",
          slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
          titleKey: "action_loop",
          defaultTitle: "Loop",
          icon: { normal: "loopOff", active: "loopOn" },
          order: 50,
          dismissOnExecute: false,
          isActive: () => PlayerController.getInstance().isLoopEnabled(),
          onClick: (_e, ctx) => {
            PlayerController.getInstance().toggleLoop();
            ctx.refresh();
          },
          onStateBind: (refresh) => {
            return PlayerController.getInstance().onStateChange(refresh);
          }
        }
      ]);

      isEnabled = true;
    } catch (error: unknown) {
      isEnabled = false;
      teardownSafely();
      throw error;
    }
  },

  disable(): void {
    if (!isEnabled) {
      return;
    }

    isEnabled = false;
    teardownSafely();
  },

  isActive(): boolean {
    return isEnabled;
  }
});
```

### 5.4 倍速能力深模块纯净化 (`src/features/player/speed-feature.ts`)

`PlayerSpeedFeature` 自行管理其 3 项专属调速快捷键事务，彻底移除非倍速按键：

```typescript
import { ShortcutDispatcher } from "../../core/shortcuts";
import { PlayerController } from "./controller";
import { PlayerSpeedButtonView } from "./speed-button-view";

let isEnabled: boolean = false;
let shortcutCleanups: Array<() => void> = [];

function teardownSafely(): void {
  try {
    PlayerSpeedButtonView.unmount();
  } catch (error: unknown) {
    console.error("[PlayerSpeedFeature] Failed to unmount speed view:", error);
  }

  shortcutCleanups.forEach((cleanup: () => void) => {
    try {
      cleanup();
    } catch (err: unknown) {
      console.error("[PlayerSpeedFeature] Shortcut cleanup error:", err);
    }
  });
  shortcutCleanups = [];
}

export const PlayerSpeedFeature: Readonly<{
  readonly enable: () => void;
  readonly disable: () => void;
  readonly isActive: () => boolean;
}> = Object.freeze({
  enable(): void {
    if (isEnabled) {
      return;
    }

    const acquiredCleanups: Array<() => void> = [];

    try {
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: ">",
          shiftKey: true,
          description: "Increase playback speed",
          handler: () => PlayerController.getInstance().increaseSpeed()
        })
      );
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: "<",
          shiftKey: true,
          description: "Decrease playback speed",
          handler: () => PlayerController.getInstance().decreaseSpeed()
        })
      );
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: "r",
          shiftKey: true,
          description: "Reset playback speed to 1.0x",
          handler: () => PlayerController.getInstance().resetSpeed()
        })
      );

      shortcutCleanups = acquiredCleanups;
      PlayerSpeedButtonView.mount();
      isEnabled = true;
    } catch (error: unknown) {
      while (acquiredCleanups.length > 0) {
        const cleanup = acquiredCleanups.pop();
        try {
          cleanup?.();
        } catch (e: unknown) {
          console.error("[PlayerSpeedFeature] Rollback error:", e);
        }
      }
      isEnabled = false;
      teardownSafely();
      throw error;
    }
  },

  disable(): void {
    if (!isEnabled) {
      return;
    }

    isEnabled = false;
    teardownSafely();
  },

  isActive(): boolean {
    return isEnabled;
  }
});
```

### 5.5 `PlayerController` 纯净化

从 `PlayerController` 中移除以下历史成员：
- 移除 `isSpeedControlEnabled` 属性及 `enableSpeedControl()`、`disableSpeedControl()`、`isSpeedControlActive()` 方法；
- 移除 `setupShortcuts()`、`teardownShortcuts()` 及 `shortcutCleanups` 字段；
- 移除 `init()` 中硬编码的 `Toolbar.registerActions([screenshot, pip, loop])` 调用；
- 保留 `init()` 核心底座逻辑：读取初始存储配置（倍速与循环标记）、视频元素绑定与 `yt-navigate-finish` 路由监听。

---

## 6. 特性描述符配置接入

在 `src/registry/descriptors.ts` 中连续编排播放器能力簇：

```typescript
import {
  PlayerSpeedFeature,
  PlayerScreenshotFeature,
  PlayerPiPFeature,
  PlayerLoopFeature
} from "../features/player";

export const defaultFeatureDescriptors: FeatureDescriptor[] = [
  // ... 前序特性 (10: Tabview, 20: Grid, 30: Theme, 40: Download)
  {
    id: "isOpenSpeedControl",
    i18nKey: "function_is_speed_control_open",
    titleI18nKey: "feature_speed_control_title",
    descI18nKey: "feature_speed_control_desc",
    defaultValue: true,
    order: 50,
    setup: (): void => PlayerSpeedFeature.enable(),
    teardown: (): void => PlayerSpeedFeature.disable()
  },
  {
    id: "isOpenScreenshot",
    i18nKey: "function_is_screenshot_open",
    titleI18nKey: "feature_screenshot_title",
    descI18nKey: "feature_screenshot_desc",
    defaultValue: true,
    order: 52,
    setup: (): void => PlayerScreenshotFeature.enable(),
    teardown: (): void => PlayerScreenshotFeature.disable()
  },
  {
    id: "isOpenPictureInPicture",
    i18nKey: "function_is_pip_open",
    titleI18nKey: "feature_pip_title",
    descI18nKey: "feature_pip_desc",
    defaultValue: true,
    order: 54,
    setup: (): void => PlayerPiPFeature.enable(),
    teardown: (): void => PlayerPiPFeature.disable()
  },
  {
    id: "isOpenLoopPlayback",
    i18nKey: "function_is_loop_open",
    titleI18nKey: "feature_loop_title",
    descI18nKey: "feature_loop_desc",
    defaultValue: true,
    order: 56,
    setup: (): void => PlayerLoopFeature.enable(),
    teardown: (): void => PlayerLoopFeature.disable()
  },
  // ... 后续特性 (60: Adblock, 70: Caption)
];
```

---

## 7. 国际化文案字典扩展

在 `src/i18n/locales.ts` 中为各语言增补新特性文案（以中英日为例）：

```typescript
// zh-CN 示例
{
  function_is_screenshot_open: "开启视频截图",
  feature_screenshot_title: "视频物理分辨率截图",
  feature_screenshot_desc: "快捷键：Shift+S，支持控制栏快捷按钮与无损画布截帧",

  function_is_pip_open: "开启原生画中画",
  feature_pip_title: "原生画中画模式",
  feature_pip_desc: "快捷键：Shift+P，支持控制栏一键切换画中画浮窗",

  function_is_loop_open: "开启单曲循环播放",
  feature_loop_title: "单曲循环播放",
  feature_loop_desc: "快捷键：Shift+L，支持控制栏状态高亮与自动循环重播"
}
```

---

## 8. 文件落位

| 变更类型 | 文件路径 | 职责说明 |
| --- | --- | --- |
| **修改** | `src/features/player/controller.ts` | 彻底剥离快捷键与 Toolbar 注册，纯化为媒体领域核心底座 |
| **修改** | `src/features/player/speed-feature.ts` | 聚焦调速能力生命周期，统管 3 项调速按键事务与 SpeedButtonView |
| **新增** | `src/features/player/screenshot-feature.ts` | 实现 `PlayerScreenshotFeature` 门面，统管 Shift+S 与截图 Action |
| **新增** | `src/features/player/pip-feature.ts` | 实现 `PlayerPiPFeature` 门面，统管 Shift+P 与画中画 Action |
| **新增** | `src/features/player/loop-feature.ts` | 实现 `PlayerLoopFeature` 门面，统管 Shift+L 与单曲循环 Action |
| **修改** | `src/features/player/index.ts` | 导出 4 个特性深模块门面及 `PlayerController` |
| **修改** | `src/registry/descriptors.ts` | 登记 3 个新增特性的描述符（order: 52, 54, 56） |
| **修改** | `src/i18n/locales.ts` | 补充各语言下的新特性标题与描述字典 |
| **新增** | `docs/adr/0006-decoupling-player-shortcuts-by-capability.md` | 记录快捷键按能力解耦与生命周期一体化的架构决策 |
| **修改** | `CONTEXT.md` | 登记新增深模块词汇，废弃集中式 `PlayerShortcuts` |
| **新增** | `src/features/player/__tests__/player-features-decoupling.test.ts` | 覆盖 4 项能力独立启停、快捷键与 Action 协同注销及异常隔离的单元测试 |

---

## 9. 迁移落地阶段

### 阶段一：纯净化 `PlayerController` 与快捷键提取
1. 在 `PlayerController` 中移除 `setupShortcuts` 与 `Toolbar.registerActions`；
2. 将调速快捷键（`>`、`<`、`Shift+R`）下沉至 `PlayerSpeedFeature` 并配置事务回滚；
3. 运行现存单元测试，确保底层核心方法正常运行。

### 阶段二：实现独立能力深模块
1. 新建 `screenshot-feature.ts`、`pip-feature.ts`、`loop-feature.ts`；
2. 分别对接 `ShortcutDispatcher` 与 `Toolbar.registerActions`；
3. 保证各深模块具备幂等性与尽力释放的销毁保障。

### 阶段三：配置总线与国际化接入
1. 在 `descriptors.ts` 接入 3 个新增特性；
2. 扩充 `locales.ts` 中的多语言字段；
3. 更新 `src/features/player/index.ts` 导出。

### 阶段四：编写测试与架构治理
1. 编写生命周期与解耦集成测试；
2. 更新 `CONTEXT.md` 术语表与落位 `ADR-0006`；
3. 执行 `pnpm check`、`pnpm test` 与 `pnpm build` 全流程验证。

---

## 10. 验收矩阵

| 维度 | 验证场景 | 验收基准 |
| --- | --- | --- |
| **独立启停** | 单独关闭“视频截图”特性 | `Shift+S` 失效且控制栏相机按钮移除；倍速、画中画与循环完全不受影响 |
| **状态隔离** | 单独关闭“单曲循环”特性 | `Shift+L` 失效且控制栏循环按钮移除；当前视频播放速率保持不变 |
| **按键纯洁** | 关闭“倍速增强”特性 | 仅 `>`、`<`、`Shift+R` 及倍速按钮失效；截图、PiP 与循环依然正常工作 |
| **零残留** | 连续快速启闭各特性 | 无孤儿快捷键监听残留，Toolbar 插槽自适应更新且无重复节点 |
| **底层纯粹** | `PlayerController` 代码审查 | 零 `ShortcutDispatcher.register`，零 `Toolbar.registerActions` |
| **类型安全** | 执行 `pnpm check` | TypeScript strict 模式 0 报错 |
| **构建校验** | 执行 `pnpm build` | 打包正常完成，产物体积与功能一致 |
