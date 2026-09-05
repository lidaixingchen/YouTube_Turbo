# 播放器快捷键按能力解耦架构深化方案

## 1. 方案目标

本方案依据 [`player-speed-feature-lifecycle-architecture-deepening-plan.md`](player-speed-feature-lifecycle-architecture-deepening-plan.md) 确立的架构边界，对播放器内散落及捆绑的快捷键与辅助交互能力进行彻底的领域解耦：

1. **破除历史隐式捆绑**：将原先寄宿在 `isOpenSpeedControl`（倍速特性）中的非倍速快捷键（`Shift+S`、`Shift+P`、`Shift+L`）与倍速控制彻底剥离；
2. **能力生命周期一体化**：将视频截图、原生画中画、单曲循环播放与倍速控制对等重构为 4 个独立的一等特性（First-class Features），统管各自的快捷键与控制栏 Toolbar Action；
3. **退守领域核心底座**：[`PlayerController`](../src/features/player/controller.ts) 彻底剥离快捷键与 UI 挂载副作用，成为专注于 HTML5 媒体元素状态机、Canvas 物理分辨率截帧、原生画中画调度与循环播放的纯粹领域模型；
4. **抽象高阶复合门面工厂**：提炼通用复合特性工厂 `createToolbarActionFeature`，内置严格栈式逆序注销（LIFO）、原子回滚与有状态特性注销钩子，消除样板代码；
5. **完善状态机自愈契约**：单曲循环特性在停用时协同重置底座循环状态，杜绝界面入口移除后视频仍持续自动重播的失控隐患；
6. **平滑向后兼容与常量收敛**：新特性全量采用 `defaultValue: true`，相关键位、Action 标识符与排序权重全部收敛至常量模块，彻底杜绝魔法字符串与硬编码。

---

## 2. 能力矩阵与范围边界

解耦后，播放器子系统划分为 4 个职责单一、互不干扰的独立能力：

| 能力标识 | 一等特性配置项 | 涵盖快捷键 | 控制栏 UI (Toolbar / Slot) | 特性类型 | 对应生命周期深模块 | 排序 (Order) |
| --- | --- | --- | --- | --- | --- | --- |
| **倍速控制** (Speed) | `isOpenSpeedControl` | `>`（加速）、`<`（减速）、`Shift+R`（重置 1.0x） | `PlayerSpeedButtonView` (控制栏右侧插槽) | 有状态 | `PlayerSpeedFeature` | 50 |
| **视频截图** (Screenshot) | `isOpenScreenshot` | `Shift+S` | 相机图标 Action (`order: 30`) | 无状态动作 | `PlayerScreenshotFeature` | 52 |
| **画中画** (PiP) | `isOpenPictureInPicture` | `Shift+P` | 画中画图标 Action (`order: 40`) | 无状态动作 | `PlayerPiPFeature` | 54 |
| **单曲循环** (Loop) | `isOpenLoopPlayback` | `Shift+L` | 循环状态图标 Action (`order: 50`) | 有状态联动 | `PlayerLoopFeature` | 56 |

### 架构边界约束

- **一体化启闭契约**：特性的启用与停用同时作用于其快捷键与控制栏图标。当用户在设置中禁用某一能力时，对应的快捷键立即解绑，且控制栏上的按钮同步销毁，不留孤儿监听与无效按钮；
- **底层底座共享与状态隔离**：4 个特性深模块作为交互协调层，底层均依托单例 `PlayerController` 提供的媒体核心 API；关闭截图、画中画或倍速不重置媒体核心的核心状态（如当前播放速率与视频句柄缓存）；
- **有状态特性的停用自愈**：对于单曲循环特性，停用时在卸载快捷键与工具栏按钮的同时，必须协同执行底座 `PlayerController.getInstance().setLoop(false)`，确保底层媒体元素立即脱离循环模式，杜绝无界面可调的死锁。

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
    +---> createToolbarActionFeature (复合门面工厂)
            |
            |-- 严格栈式逆序注销 (LIFO: onDisable -> Toolbar -> Shortcut)
            |-- 异常原子回滚 (Rollback)
            |-- 尽力释放 (Best-effort Teardown)
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
                    |-- 控制栏按钮: Toolbar Action (loop)
                    +-- 停用自愈钩子: PlayerController.setLoop(false)
                            |
                            v (原子业务调度)
                  PlayerController (纯领域底座单例)
                    |-- 视频元素生命周期 & WeakRef 监听
                    |-- 播放速率控制 (targetSpeed)
                    |-- 高清画布截帧 (Canvas Blob 导出)
                    |-- 原生画中画 API 封装
                    +-- 单曲循环状态机 (<video loop> & ended 事件)
```

### 分层职责划分

1. **配置与注册层 (`FeatureRegistry` & `descriptors.ts`)**：
   - 统一通过无参的 `enable()` 与 `disable()` 调度特性；
   - 依赖强类型描述符，不感知具体按键字符串、DOM 节点或 Toolbar Action 内部细节。
2. **复合门面工厂 (`createToolbarActionFeature`)**：
   - 封装“快捷键 + 控制栏动作”的标准装配、逆序释放与回滚逻辑；
   - 保证幂等执行，提供状态隔离与异常尽力释放。
3. **生命周期深模块门面 (`Player*Feature`)**：
   - 拥有该能力的完整交互生命周期；
   - 负责向门面工厂或自身适配器注入精准的业务编排与状态重置回调。
4. **领域核心模型 (`PlayerController`)**：
   - 彻底剥离所有按键监听与 Toolbar 绑定逻辑；
   - 专注管理视频底层生命周期、状态机派发与浏览器底层 API 交互。

---

## 4. 领域词汇

实施时在 `CONTEXT.md` 登记与更新以下术语：

```markdown
**createToolbarActionFeature**:
通用复合动作特性门面工厂，标准化协调快捷键注册、控制栏动作注入、严格逆序注销（LIFO）与异常回滚机制。

**PlayerSpeedFeature**:
播放器倍速特性的生命周期深模块，原子协调调速快捷键（>、<、Shift+R）与 `PlayerSpeedButtonView` 视图适配器，封装装配、注销及失败回滚机制。
_Avoid_: SpeedControlManager, PlayerSpeedCoordinator, FeatureComposer

**PlayerScreenshotFeature**:
视频截图特性的生命周期深模块，基于复合门面工厂协调快捷键（Shift+S）与控制栏截图 Action 的挂载与注销，调度 `PlayerController` 执行画布截帧。
_Avoid_: ScreenshotManager, CaptureCoordinator, ScreenshotService

**PlayerPiPFeature**:
原生画中画特性的生命周期深模块，基于复合门面工厂协调快捷键（Shift+P）与控制栏画中画 Action 的挂载与注销，调度 `PlayerController` 切换画中画状态。
_Avoid_: PiPCoordinator, PictureInPictureManager

**PlayerLoopFeature**:
单曲循环播放特性的生命周期深模块，基于复合门面工厂协调快捷键（Shift+L）与控制栏循环 Action 的双向联动，并在停用时执行底层循环自愈重置。
_Avoid_: LoopManager, RepeatCoordinator
```

---

## 5. 最小公共接口与实现规范

### 5.1 常量收敛 (`src/features/player/constants.ts`)

在现有播放器常量中扩充能力配置：

```typescript
export const PLAYER_FEATURE_CONSTANTS = {
  SHORTCUTS: {
    SCREENSHOT: {
      KEY: "s",
      SHIFT: true,
      DESCRIPTION: "Capture screenshot"
    },
    PIP: {
      KEY: "p",
      SHIFT: true,
      DESCRIPTION: "Toggle Picture-in-Picture"
    },
    LOOP: {
      KEY: "l",
      SHIFT: true,
      DESCRIPTION: "Toggle Loop playback"
    },
    SPEED_UP: {
      KEY: ">",
      SHIFT: true,
      DESCRIPTION: "Increase playback speed"
    },
    SPEED_DOWN: {
      KEY: "<",
      SHIFT: true,
      DESCRIPTION: "Decrease playback speed"
    },
    SPEED_RESET: {
      KEY: "r",
      SHIFT: true,
      DESCRIPTION: "Reset playback speed to 1.0x"
    }
  },
  ACTIONS: {
    SCREENSHOT: "screenshot",
    PIP: "pip",
    LOOP: "loop"
  },
  ORDERS: {
    SCREENSHOT: 30,
    PIP: 40,
    LOOP: 50,
    FEATURE_SPEED: 50,
    FEATURE_SCREENSHOT: 52,
    FEATURE_PIP: 54,
    FEATURE_LOOP: 56
  },
  I18N_KEYS: {
    ACTION_SCREENSHOT: "action_screenshot",
    ACTION_PIP: "action_pip",
    ACTION_LOOP: "action_loop"
  }
} as const;
```

### 5.2 复合门面工厂 (`src/features/player/feature-factory.ts`)

```typescript
import { ShortcutDispatcher, type ShortcutRegistrationOptions } from "../../core/shortcuts";
import { Toolbar, type ActionConfig } from "../../ui/toolbar";

export interface ActionFeatureDefinition {
  readonly name: string;
  readonly shortcut: ShortcutRegistrationOptions;
  readonly action: ActionConfig;
  readonly onDisable?: () => void;
}

export interface FeatureFacade {
  readonly enable: () => void;
  readonly disable: () => void;
  readonly isActive: () => boolean;
}

export function createToolbarActionFeature(def: ActionFeatureDefinition): FeatureFacade {
  let isEnabled: boolean = false;
  let shortcutCleanup: (() => void) | null = null;
  let toolbarCleanup: (() => void) | null = null;

  function teardownSafely(): void {
    // 严格栈式逆序注销 (LIFO)：
    // 1. 触发领域停用自愈钩子
    if (typeof def.onDisable === "function") {
      try {
        def.onDisable();
      } catch (err: unknown) {
        console.error(`[${def.name}] onDisable hook error:`, err);
      }
    }

    // 2. 卸载控制栏动作（优先脱离视图呈现）
    if (toolbarCleanup) {
      try {
        toolbarCleanup();
      } catch (err: unknown) {
        console.error(`[${def.name}] Toolbar cleanup error:`, err);
      }
      toolbarCleanup = null;
    }

    // 3. 解除按键事件拦截
    if (shortcutCleanup) {
      try {
        shortcutCleanup();
      } catch (err: unknown) {
        console.error(`[${def.name}] Shortcut cleanup error:`, err);
      }
      shortcutCleanup = null;
    }
  }

  return Object.freeze({
    enable(): void {
      if (isEnabled) {
        return;
      }

      try {
        shortcutCleanup = ShortcutDispatcher.register(def.shortcut);
        toolbarCleanup = Toolbar.registerActions([def.action]);
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
}
```

### 5.3 截图能力深模块 (`src/features/player/screenshot-feature.ts`)

```typescript
import { TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { createToolbarActionFeature, type FeatureFacade } from "./feature-factory";

export const PlayerScreenshotFeature: FeatureFacade = createToolbarActionFeature({
  name: "PlayerScreenshotFeature",
  shortcut: {
    key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SCREENSHOT.KEY,
    shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SCREENSHOT.SHIFT,
    description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SCREENSHOT.DESCRIPTION,
    handler: (): void => {
      PlayerController.getInstance().captureScreenshot().catch((err: unknown) => {
        console.error("[PlayerScreenshotFeature] Shortcut screenshot error:", err);
      });
    }
  },
  action: {
    id: PLAYER_FEATURE_CONSTANTS.ACTIONS.SCREENSHOT,
    slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    titleKey: PLAYER_FEATURE_CONSTANTS.I18N_KEYS.ACTION_SCREENSHOT,
    defaultTitle: "Screenshot",
    icon: "screenshot",
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.SCREENSHOT,
    dismissOnExecute: true,
    onClick: (): void => {
      PlayerController.getInstance().captureScreenshot().catch((err: unknown) => {
        console.error("[PlayerScreenshotFeature] Toolbar screenshot error:", err);
      });
    }
  }
});
```

### 5.4 画中画能力深模块 (`src/features/player/pip-feature.ts`)

```typescript
import { TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { createToolbarActionFeature, type FeatureFacade } from "./feature-factory";

export const PlayerPiPFeature: FeatureFacade = createToolbarActionFeature({
  name: "PlayerPiPFeature",
  shortcut: {
    key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.PIP.KEY,
    shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.PIP.SHIFT,
    description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.PIP.DESCRIPTION,
    handler: (): void => {
      PlayerController.getInstance().togglePictureInPicture().catch((err: unknown) => {
        console.error("[PlayerPiPFeature] Shortcut PiP error:", err);
      });
    }
  },
  action: {
    id: PLAYER_FEATURE_CONSTANTS.ACTIONS.PIP,
    slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    titleKey: PLAYER_FEATURE_CONSTANTS.I18N_KEYS.ACTION_PIP,
    defaultTitle: "Picture to picture",
    icon: "pip",
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.PIP,
    dismissOnExecute: true,
    onClick: (): void => {
      PlayerController.getInstance().togglePictureInPicture().catch((err: unknown) => {
        console.error("[PlayerPiPFeature] Toolbar PiP error:", err);
      });
    }
  }
});
```

### 5.5 单曲循环能力深模块 (`src/features/player/loop-feature.ts`)

```typescript
import { TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { createToolbarActionFeature, type FeatureFacade } from "./feature-factory";

export const PlayerLoopFeature: FeatureFacade = createToolbarActionFeature({
  name: "PlayerLoopFeature",
  shortcut: {
    key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.LOOP.KEY,
    shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.LOOP.SHIFT,
    description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.LOOP.DESCRIPTION,
    handler: (): void => {
      PlayerController.getInstance().toggleLoop();
    }
  },
  action: {
    id: PLAYER_FEATURE_CONSTANTS.ACTIONS.LOOP,
    slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
    titleKey: PLAYER_FEATURE_CONSTANTS.I18N_KEYS.ACTION_LOOP,
    defaultTitle: "Loop",
    icon: { normal: "loopOff", active: "loopOn" },
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.LOOP,
    dismissOnExecute: false,
    isActive: (): boolean => PlayerController.getInstance().isLoopEnabled(),
    onClick: (): void => {
      PlayerController.getInstance().toggleLoop();
    },
    onStateBind: (refresh: () => void): (() => void) => {
      return PlayerController.getInstance().onStateChange(refresh);
    }
  },
  onDisable: (): void => {
    PlayerController.getInstance().setLoop(false);
  }
});
```

### 5.6 倍速能力深模块纯净化 (`src/features/player/speed-feature.ts`)

```typescript
import { ShortcutDispatcher } from "../../core/shortcuts";
import { PLAYER_FEATURE_CONSTANTS } from "./constants";
import { PlayerController } from "./controller";
import { type FeatureFacade } from "./feature-factory";
import { PlayerSpeedButtonView } from "./speed-button-view";

let isEnabled: boolean = false;
let shortcutCleanups: Array<() => void> = [];

function teardownSafely(): void {
  // 严格栈式逆序注销 (LIFO)：1. 先卸载视图组件，2. 再释放快捷键
  try {
    PlayerSpeedButtonView.unmount();
  } catch (error: unknown) {
    console.error("[PlayerSpeedFeature] Failed to unmount speed view:", error);
  }

  for (let i = shortcutCleanups.length - 1; i >= 0; i--) {
    try {
      shortcutCleanups[i]();
    } catch (err: unknown) {
      console.error("[PlayerSpeedFeature] Shortcut cleanup error:", err);
    }
  }
  shortcutCleanups = [];
}

export const PlayerSpeedFeature: FeatureFacade = Object.freeze({
  enable(): void {
    if (isEnabled) {
      return;
    }

    const acquiredCleanups: Array<() => void> = [];

    try {
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_UP.KEY,
          shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_UP.SHIFT,
          description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_UP.DESCRIPTION,
          handler: (): void => {
            PlayerController.getInstance().increaseSpeed();
          }
        })
      );
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_DOWN.KEY,
          shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_DOWN.SHIFT,
          description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_DOWN.DESCRIPTION,
          handler: (): void => {
            PlayerController.getInstance().decreaseSpeed();
          }
        })
      );
      acquiredCleanups.push(
        ShortcutDispatcher.register({
          key: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_RESET.KEY,
          shiftKey: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_RESET.SHIFT,
          description: PLAYER_FEATURE_CONSTANTS.SHORTCUTS.SPEED_RESET.DESCRIPTION,
          handler: (): void => {
            PlayerController.getInstance().resetSpeed();
          }
        })
      );

      PlayerSpeedButtonView.mount();
      shortcutCleanups = acquiredCleanups;
      isEnabled = true;
    } catch (error: unknown) {
      for (let i = acquiredCleanups.length - 1; i >= 0; i--) {
        try {
          acquiredCleanups[i]();
        } catch (e: unknown) {
          console.error("[PlayerSpeedFeature] Rollback shortcut cleanup error:", e);
        }
      }
      try {
        PlayerSpeedButtonView.unmount();
      } catch (e: unknown) {
        console.error("[PlayerSpeedFeature] Rollback view unmount error:", e);
      }
      isEnabled = false;
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

### 5.7 `PlayerController` 纯净化

从 `PlayerController` 中移除所有交互呈现副作用：
- 移除 `isSpeedControlEnabled` 属性及 `enableSpeedControl()`、`disableSpeedControl()`、`isSpeedControlActive()` 方法；
- 移除 `setupShortcuts()`、`teardownShortcuts()` 及 `shortcutCleanups` 字段；
- 移除 `init()` 中硬编码的 `Toolbar.registerActions([screenshot, pip, loop])` 调用；
- 明确提供 `setLoop(enabled: boolean): void` 显式设态接口，底层原子化同步 `<video>` 元素与派发 `notifyStateChange()`；
- 保留 `init()` 核心底座逻辑：读取初始存储配置（倍速与循环标记）、视频元素绑定与 `yt-navigate-finish` 路由监听。

---

## 6. 特性描述符配置接入

在 `src/registry/descriptors.ts` 中连续编排播放器能力簇：

```typescript
import {
  PlayerSpeedFeature,
  PlayerScreenshotFeature,
  PlayerPiPFeature,
  PlayerLoopFeature,
  PLAYER_FEATURE_CONSTANTS
} from "../features/player";

export const defaultFeatureDescriptors: FeatureDescriptor[] = [
  // ... 前序特性 (10: Tabview, 20: Grid, 30: Theme, 40: Download)
  {
    id: "isOpenSpeedControl",
    i18nKey: "function_is_speed_control_open",
    titleI18nKey: "feature_speed_control_title",
    descI18nKey: "feature_speed_control_desc",
    defaultValue: true,
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.FEATURE_SPEED,
    setup: (): void => PlayerSpeedFeature.enable(),
    teardown: (): void => PlayerSpeedFeature.disable()
  },
  {
    id: "isOpenScreenshot",
    i18nKey: "function_is_screenshot_open",
    titleI18nKey: "feature_screenshot_title",
    descI18nKey: "feature_screenshot_desc",
    defaultValue: true,
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.FEATURE_SCREENSHOT,
    setup: (): void => PlayerScreenshotFeature.enable(),
    teardown: (): void => PlayerScreenshotFeature.disable()
  },
  {
    id: "isOpenPictureInPicture",
    i18nKey: "function_is_pip_open",
    titleI18nKey: "feature_pip_title",
    descI18nKey: "feature_pip_desc",
    defaultValue: true,
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.FEATURE_PIP,
    setup: (): void => PlayerPiPFeature.enable(),
    teardown: (): void => PlayerPiPFeature.disable()
  },
  {
    id: "isOpenLoopPlayback",
    i18nKey: "function_is_loop_open",
    titleI18nKey: "feature_loop_title",
    descI18nKey: "feature_loop_desc",
    defaultValue: true,
    order: PLAYER_FEATURE_CONSTANTS.ORDERS.FEATURE_LOOP,
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
// en 示例
{
  function_is_screenshot_open: "Enable video physical resolution screenshot.",
  feature_screenshot_title: "Physical Resolution Screenshot",
  feature_screenshot_desc: "Shortcut: Shift+S, supports player toolbar action and lossless canvas frame capture.",

  function_is_pip_open: "Enable native picture-in-picture mode.",
  feature_pip_title: "Picture in Picture",
  feature_pip_desc: "Shortcut: Shift+P, supports player toolbar action for floating window playback.",

  function_is_loop_open: "Enable single video loop playback.",
  feature_loop_title: "Single Video Loop",
  feature_loop_desc: "Shortcut: Shift+L, supports player toolbar status indicator and automatic replay."
}

// zh-CN 示例
{
  function_is_screenshot_open: "启用视频物理分辨率截图。",
  feature_screenshot_title: "视频物理分辨率截图",
  feature_screenshot_desc: "快捷键：Shift+S，支持控制栏快捷按钮与无损画布截帧。",

  function_is_pip_open: "启用原生画中画模式。",
  feature_pip_title: "原生画中画模式",
  feature_pip_desc: "快捷键：Shift+P，支持控制栏一键切换画中画浮窗。",

  function_is_loop_open: "启用单曲循环播放。",
  feature_loop_title: "单曲循环播放",
  feature_loop_desc: "快捷键：Shift+L，支持控制栏状态高亮与自动循环重播。"
}

// ja 示例
{
  function_is_screenshot_open: "動画の物理解像度スクリーンショットを有効にする。",
  feature_screenshot_title: "物理解像度スクリーンショット",
  feature_screenshot_desc: "ショートカット：Shift+S、ツールバーボタンとロスレスキャンバスキャプチャに対応。",

  function_is_pip_open: "ネイティブピクチャーインピクチャーを有効にする。",
  feature_pip_title: "ピクチャーインピクチャー",
  feature_pip_desc: "ショートカット：Shift+P、ツールバーからフローティングウィンドウ再生へ切替可能。",

  function_is_loop_open: "動画のループ再生を有効にする。",
  feature_loop_title: "シングル動画ループ再生",
  feature_loop_desc: "ショートカット：Shift+L、ツールバーステータス表示と自動リピートに対応。"
}
```

---

## 8. 文件落位

| 变更类型 | 文件路径 | 职责说明 |
| --- | --- | --- |
| **修改** | `src/features/player/constants.ts` | 集中收敛快捷键、Toolbar 动作标识符、顺序权重与文案键值 |
| **新增** | `src/features/player/feature-factory.ts` | 实现通用复合门面工厂，承载栈式逆序注销、异常回滚与自愈钩子 |
| **修改** | `src/features/player/controller.ts` | 彻底剥离快捷键与 Toolbar 注册，补充 `setLoop` 纯化为媒体领域核心底座 |
| **修改** | `src/features/player/speed-feature.ts` | 聚焦倍速生命周期，统管 3 项调速按键事务与 SpeedButtonView 的逆序释放 |
| **新增** | `src/features/player/screenshot-feature.ts` | 声明式构建 `PlayerScreenshotFeature` 门面，统管 Shift+S 与截图 Action |
| **新增** | `src/features/player/pip-feature.ts` | 声明式构建 `PlayerPiPFeature` 门面，统管 Shift+P 与画中画 Action |
| **新增** | `src/features/player/loop-feature.ts` | 声明式构建 `PlayerLoopFeature` 门面，统管 Shift+L、循环 Action 与状态重置 |
| **修改** | `src/features/player/index.ts` | 导出 4 个特性门面、相关常量及 `PlayerController` |
| **修改** | `src/registry/descriptors.ts` | 登记 3 个新增特性的描述符（order: 52, 54, 56） |
| **修改** | `src/i18n/locales.ts` | 补充各语言环境下的新特性标题与描述字典 |
| **新增** | `docs/adr/0006-decoupling-player-shortcuts-by-capability.md` | 记录快捷键按能力解耦与复合门面工厂的架构决策 |
| **修改** | `CONTEXT.md` | 登记 `createToolbarActionFeature` 等新增深模块领域词汇 |
| **新增** | `src/features/player/__tests__/player-features-decoupling.test.ts` | 覆盖 4 项能力独立启停、逆序注销、异常回滚及循环状态自愈重置的单元测试 |

---

## 9. 迁移落地阶段

### 阶段一：常量与基础工厂建设
1. 在 `constants.ts` 集中登记能力相关常量；
2. 实现 `src/features/player/feature-factory.ts`，编写单元测试验证原子装配、LIFO 逆序注销、回滚与 `onDisable` 钩子。

### 阶段二：纯净化 `PlayerController`
1. 在 `PlayerController` 补充 `setLoop(enabled: boolean)` 纯状态更新方法；
2. 移除 `setupShortcuts`、`teardownShortcuts` 与硬编码的 `Toolbar.registerActions`；
3. 将调速快捷键事务收拢至 `PlayerSpeedFeature`。

### 阶段三：声明式能力构建与接入
1. 基于工厂实现 `screenshot-feature.ts`、`pip-feature.ts`、`loop-feature.ts`；
2. 在 `descriptors.ts` 接入 3 个新增特性描述符；
3. 在 `locales.ts` 增补多语言字典，更新 `src/features/player/index.ts` 导出。

### 阶段四：验证与架构治理
1. 编写生命周期与解耦集成测试，特别覆盖停用 Loop 特性时的底层状态自愈验证；
2. 更新 `CONTEXT.md` 术语表与落位 `ADR-0006`；
3. 执行 `pnpm check`、`pnpm test` 与 `pnpm build` 全流程验证。

---

## 10. 验收矩阵

| 维度 | 验证场景 | 验收基准 |
| --- | --- | --- |
| **独立启停** | 单独关闭“视频截图”特性 | `Shift+S` 失效且控制栏相机按钮移除；倍速、画中画与循环完全不受影响 |
| **状态自愈** | 开启循环播放后，在设置中关闭“单曲循环”特性 | `Shift+L` 失效，控制栏循环按钮移除，且底层循环播放状态立即解除（视频播放至末尾不再重播） |
| **按键纯洁** | 关闭“倍速增强”特性 | 仅 `>`、`<`、`Shift+R` 及倍速按钮失效；截图、PiP 与循环依然正常工作 |
| **栈式逆序** | 特性停用生命周期调用 | 严格按照“状态钩子/UI 动作先销毁，底层按键监听后解除”的 LIFO 顺序执行 |
| **零残留** | 连续快速启闭各特性 | 无孤儿快捷键监听残留，Toolbar 插槽自适应更新且无重复节点 |
| **底层纯粹** | `PlayerController` 代码审查 | 零 `ShortcutDispatcher.register`，零 `Toolbar.registerActions` |
| **类型安全** | 执行 `pnpm check` | TypeScript strict 模式 0 报错 |
| **构建校验** | 执行 `pnpm build` | 打包正常完成，产物体积与功能一致 |
