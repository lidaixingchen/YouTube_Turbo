# YouTube Turbo – 播放器倍速控制与插槽总线架构深化方案

本方案基于 **Codebase Design** 哲学（深模块 Deep Modules、清晰 Seam、高杠杆 Leverage、局部性 Locality 与删除测试 Deletion Test），针对架构审查反馈，重构并确立播放器倍速控制与插槽总线（`SlotMountBus`）的**最佳实践演进方案**。

---

## 1. 架构目标与设计原则

- **对齐 ADR-0005 挂载总线决策（ADR-0005 Alignment）**：严格遵循 [ADR 0005](adr/0005-unified-slot-mount-bus.md) 确立的“全站仅维护最多 1 个处于活跃状态的 `MutationObserver`，插槽就绪即刻停机”核心红线，彻底废除 `PlayerSpeedButtonView` 内部独立的 5000ms `waitForElement` 及多余的全局观察器。
- **锚点自适应拓扑消除注入竞态（Deterministic Anchor-Based Topology）**：消除 `.ytp-right-controls` 容器中工具箱胶囊与倍速指示器的盲目 `prepend` 竞态，采用双向相对锚点探测机制，无条件保证 `[倍速按钮] [工具箱] [原生按钮...]` 的物理拓扑稳定性。
- **高杠杆复用 PopoverEngine 基础设施（Leverage PopoverEngine）**：废除手写的外部点击监听、粗糙的 Hover 定时器与可能引发重排的样式操作，全面接入现有的 [`PopoverEngine`](../src/ui/toolbar/popover.ts)，共享纯 GPU 合成层变换（`translate3d`）、显式三态状态机与按需挂载的 `pointerdown` 外部点击收起能力。
- **生命周期完全闭环与杜绝幽灵 DOM（Lifecycle Closure & Zero Ghost DOM）**：在 `SlotDefinition` 中扩充 `unmount` 契约，使总线在插槽注销或路由失效时能够通知挂载项清理附属浮层（挂在 `#movie_player` 下的倍速菜单）与状态订阅，实现零内存泄漏。
- **领域模型与视图彻底解耦（Decouple View from Player Domain）**：[`PlayerController`](../src/features/player/controller.ts) 纯化为不感知具体 DOM 结构的领域深模块（专注速率状态机、原生 `ratechange` 同步、快捷键调度与响应式事件源）；倍速按钮降级为轻量无状态视图适配器；二者的装配与生命周期收敛至特性注册表 [`descriptors.ts`](../src/registry/descriptors.ts)。

---

## 2. 领域模型与术语对齐

- **`SlotMountBus`**：单一聚合挂载总线，将全站所有待就绪插槽的突变侦测合并为单遍扫描观察器，全量插槽就绪或离开路由后即刻 `disconnect()`。
- **`SlotDefinition`**：插槽元数据契约，声明目标容器选择器、挂载策略及新增的 `unmount` 清理回调。
- **`PopoverEngine`**：通用浮层引擎，支持 `CLOSED`、`HOVER_OPEN`、`PINNED_OPEN` 三态切换，采用 GPU 合成层定位并提供安全的防视口溢出约束。
- **`PlayerController`**：播放器核心领域模型单例，管理播放速率、单曲循环、画中画与快捷键，对外广播响应式 `onStateChange` 事件。
- **`PlayerSpeedButtonView`**：纯视图适配器，负责构建底栏按钮与悬浮菜单 DOM，绑定 `PopoverEngine`，订阅控制器状态并更新视图。
- **`SLOT_PLAYER_SPEED_BUTTON`**：播放器右侧控制条倍速插槽，依托锚点协议挂载至工具箱按钮左侧。

---

## 3. 现状分析与架构摩擦点 (Friction)

### 3.1 现存 5 大架构缺陷与摩擦点

```
【当前架构：两套并行的右控制栏注入通道与监听器重叠】

                         .ytp-right-controls (目标注入容器)
                               ▲              ▲
               ┌───────────────┘              └───────────────┐
               │                                              │
    [通道 1: 官方聚合总线]                       [通道 2: 独立野挂载器]
      SlotMountBus                               PlayerSpeedButtonView
           ▲                                          ▲
           │                                          │
    ToolbarController                    ┌────────────┴────────────┐
           ▲                             │ 独立 MutationObserver  │ (waitForElement, 5000ms)
           │                             │ 独立 yt-navigate-finish │
        main.ts                          │ 常驻 capture 'click'    │ (内存泄漏隐患)
                                         └─────────────────────────┘
                                                      ▲
                                         PlayerController (反向强耦合)
```

1. **冗余全局观察器**：`speed-button-view.ts` 在每次页面导航时发起 `waitForElement`，在 `document.body` 上拉起长达 5000ms 的次级 `MutationObserver`，严重违背 ADR-0005。
2. **DOM 注入顺序偶发错位**：`ToolbarController` 与 `PlayerSpeedButtonView` 均无序执行 `target.prepend(...)`，异步就绪先后顺序导致工具箱与倍速按钮位置偶发颠倒。
3. **浮层状态机低效重造**：倍速菜单手写了 `document.addEventListener("click", ..., true)` 与外部点击收起，缺少窗口缩放重定位、边界防溢出和 GPU 硬件加速，未能复用成熟的 `PopoverEngine`。
4. **生命周期闭环断裂**：`SlotMountBus` 仅能删除匹配 `elementId` 的按钮本身；而挂载在播放器外层容器的浮动菜单（`#yt-turbo-speed-options`）在卸载时沦为幽灵 DOM 节点。
5. **领域与视图双向耦合**：`PlayerController` 显式持有 `PlayerSpeedButtonView.mount()` 与 `unmount()`，导致领域层直接依赖 UI 展现层。

---

## 4. 最佳实践架构设计

### 4.1 架构拓扑与协作流

```
                    ┌──────────────────────────────────────────────┐
                    │          FeatureRegistry (特性配置层)        │
                    └───────────────┬──────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌──────────────────────────────┐          ┌───────────────────────────────────────┐
│ PlayerController (纯领域单例)│          │ SlotMountBus (单一聚合挂载总线)       │
│ - targetSpeed / playbackRate │          │ - 全局唯一活跃 MutationObserver       │
│ - ShortcutDispatcher 快捷键  │          │ - 挂载即停机，路由驱动唤醒            │
│ - onStateChange 响应式事件源 │          └───────────────────┬───────────────────┘
└──────────────┬───────────────┘                              │ 驱动生命周期
               │ (订阅状态 / 派发动作)                         ▼
               │                          ┌───────────────────────────────────────┐
               │                          │ 锚点协同注入协议 (Anchor Protocol)    │
               │                          │ [SpeedBtn] [Toolbox] [NativeButtons]  │
               ▼                          └───────────────────┬───────────────────┘
┌──────────────────────────────────────┐                      │
│ PlayerSpeedButtonView (纯UI适配器)   │◄─────────────────────┘
│ - 构建 SpeedButton & OptionsMenu DOM │
│ - 接入 PopoverEngine (GPU加速/三态)  │
│ - 实现 SlotDefinition.unmount 销毁   │
└──────────────────────────────────────┘
```

### 4.2 核心模块重构策略

#### 1. 扩充 `SlotDefinition` 销毁契约 (`src/ui/toolbar/types.ts`)
在 `SlotDefinition` 中新增可选的 `unmount?: () => void` 钩子：
```typescript
export interface SlotDefinition {
  slotKey: string;
  containerSelector: string;
  targetSelector: string;
  elementId: string;
  isApplicable?: (url: URL) => boolean;
  mount: (target: HTMLElement, element: HTMLElement) => void;
  unmount?: () => void; // 赋予插槽在注销时释放附属节点、清理事件与解绑状态的能力
}
```
当 `SlotMountBus.unmountSlot()` 执行或在路由切换判定当前插槽不适用时，优先调用 `unmount()`，彻底根除浮层与事件泄漏。

#### 2. 锚点自适应注入算法 (Anchor-Based Peer Injection)
在 `.ytp-right-controls` 内建立确定性相对拓扑：
- **倍速按钮挂载时**：探测工具箱容器 `#yt_extension_toolbox_root`。若已存在，执行 `toolboxRoot.before(speedBtn)`；若不存在，执行 `target.prepend(speedBtn)`。
- **工具箱挂载时**：探测倍速按钮 `.yt-turbo-speed-btn`。若已存在，执行 `speedBtn.after(toolboxRoot)`；若不存在，执行 `target.prepend(toolboxRoot)`。
- **拓扑保证**：无论二者网络响应与 DOM 就绪顺序如何、无论用户何时动态开关任一功能，二者相对位置恒定为 `[倍速按钮] [工具箱] [原生设置/全屏...]`。

#### 3. 接入 `PopoverEngine` 驱动倍速菜单
- 废除内部自写的高开销外部点击监听与样式写入；
- 将倍速选项菜单挂载至播放器根容器后，直接交由 `PopoverEngine.bind(speedBtn, menuEl, playerEl)` 管理；
- 继承 `PopoverEngine` 的 150ms Hover 防抖、GPU `translate3d` 硬件加速定位、以及 Pinned 态按需绑定的 `pointerdown` 外部点击收起。

#### 4. 纯化 `PlayerController` 领域边界
- 移除 `PlayerController` 对 `PlayerSpeedButtonView` 的任何直接引用；
- 纯化后的 `enableSpeedControl()` 与 `disableSpeedControl()` 仅负责快捷键（`<`、`>`、`Shift+R`）的注册与注销；
- 在 `src/registry/descriptors.ts` 的 `isOpenSpeedControl` 特性描述符中协调领域层与视图层生命周期：
  ```typescript
  {
    id: "isOpenSpeedControl",
    // ...
    setup: () => {
      PlayerController.getInstance().enableSpeedControl();
      PlayerSpeedButtonView.mount();
    },
    teardown: () => {
      PlayerController.getInstance().disableSpeedControl();
      PlayerSpeedButtonView.unmount();
    }
  }
  ```

---

## 5. 预期代码结构设计

### 5.1 纯化后的视图适配器 (`src/features/player/speed-button-view.ts`)

```typescript
import { PlayerController, type PlayerState } from "./controller";
import { PLAYER_CONSTANTS } from "./constants";
import { StyleEngine } from "../../core/style-engine";
import { PopoverEngine } from "../../ui/toolbar/popover";
import { SlotMountBus } from "../../ui/toolbar/slot-mount-bus";
import { TOOLBAR_CONSTANTS } from "../../ui/toolbar/constants";
import type { PopoverController, SlotDefinition } from "../../ui/toolbar/types";

export class PlayerSpeedButtonView {
  private static instance: PlayerSpeedButtonView | null = null;
  private buttonEl: HTMLElement | null = null;
  private menuEl: HTMLElement | null = null;
  private popoverController: PopoverController | null = null;
  private stateUnbind: (() => void) | null = null;

  public static getInstance(): PlayerSpeedButtonView {
    if (!this.instance) {
      this.instance = new PlayerSpeedButtonView();
    }
    return this.instance;
  }

  public static mount(): void {
    this.getInstance().registerToBus();
  }

  public static unmount(): void {
    if (this.instance) {
      SlotMountBus.getInstance().unmountSlot(PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY);
      this.instance.destroy();
      this.instance = null;
    }
  }

  private registerToBus(): void {
    this.injectStyles();

    const slotDef: SlotDefinition = {
      slotKey: PLAYER_CONSTANTS.SELECTORS.SPEED_SLOT_KEY,
      containerSelector: PLAYER_CONSTANTS.SELECTORS.PLAYER_CONTAINER,
      targetSelector: PLAYER_CONSTANTS.SELECTORS.RIGHT_CONTROLS,
      elementId: PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID,
      isApplicable: (url: URL) => !url.pathname.startsWith("/shorts"),
      mount: (target: HTMLElement, element: HTMLElement) => {
        const toolbox = target.querySelector<HTMLElement>(`#${TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID}`);
        if (toolbox) {
          toolbox.before(element);
        } else if (!target.contains(element)) {
          target.prepend(element);
        }
      },
      unmount: () => {
        this.destroy();
      }
    };

    SlotMountBus.getInstance().mountSlot(slotDef, () => this.createSlotElement());
  }

  private injectStyles(): void {
    const combinedStyle = `${PLAYER_CONSTANTS.STYLES.SPEED_BTN_CSS}\n${PLAYER_CONSTANTS.STYLES.SPEED_OPTIONS_CSS}`;
    StyleEngine.inject(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID, combinedStyle);
  }

  public createSlotElement(): HTMLElement | null {
    if (this.buttonEl && this.buttonEl.isConnected) {
      return this.buttonEl;
    }

    const currentSpeed = PlayerController.getInstance().getSpeed();

    this.buttonEl = document.createElement("div");
    this.buttonEl.id = PLAYER_CONSTANTS.SELECTORS.SPEED_BUTTON_ID;
    this.buttonEl.className = PLAYER_CONSTANTS.CLASSES.SPEED_BUTTON;
    this.buttonEl.tabIndex = 0;
    this.buttonEl.setAttribute("role", "button");
    this.buttonEl.setAttribute("aria-haspopup", "true");

    const speedText = document.createElement("span");
    speedText.textContent = `${currentSpeed}×`;
    this.buttonEl.appendChild(speedText);

    this.setupMenuAndPopover(currentSpeed);
    this.bindPlayerState();

    return this.buttonEl;
  }

  private setupMenuAndPopover(currentSpeed: number): void {
    const player = document.querySelector<HTMLElement>(PLAYER_CONSTANTS.SELECTORS.PLAYER_CONTAINER);
    if (!player || !this.buttonEl) return;

    if (this.menuEl) {
      this.menuEl.remove();
    }

    this.menuEl = document.createElement("div");
    this.menuEl.id = PLAYER_CONSTANTS.SELECTORS.SPEED_OPTIONS_MENU_ID;
    this.menuEl.className = PLAYER_CONSTANTS.CLASSES.SPEED_OPTIONS_MENU;

    PLAYER_CONSTANTS.PRESET_SPEEDS.forEach((speedNum: number) => {
      const option = document.createElement("div");
      option.className = PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM;
      option.textContent = `${speedNum}×`;
      option.dataset.speed = String(speedNum);

      if (Math.abs(speedNum - currentSpeed) < PLAYER_CONSTANTS.SPEED_EPSILON) {
        option.classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
      }

      option.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        PlayerController.getInstance().setSpeed(speedNum, true);
        this.popoverController?.close();
      });

      this.menuEl?.appendChild(option);
    });

    player.appendChild(this.menuEl);

    if (this.popoverController) {
      this.popoverController.destroy();
    }
    this.popoverController = PopoverEngine.bind(this.buttonEl, this.menuEl, player);
  }

  private bindPlayerState(): void {
    if (this.stateUnbind) {
      this.stateUnbind();
    }
    this.stateUnbind = PlayerController.getInstance().onStateChange((state: PlayerState) => {
      this.updateView(state.speed);
    });
  }

  private updateView(speed: number): void {
    if (this.buttonEl) {
      const span = this.buttonEl.querySelector("span");
      if (span) span.textContent = `${speed}×`;
    }
    if (this.menuEl) {
      const options = this.menuEl.querySelectorAll<HTMLElement>(`.${PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM}`);
      options.forEach((opt) => {
        const optSpeed = parseFloat(opt.dataset.speed || "0");
        if (Math.abs(optSpeed - speed) < PLAYER_CONSTANTS.SPEED_EPSILON) {
          opt.classList.add(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
        } else {
          opt.classList.remove(PLAYER_CONSTANTS.CLASSES.SPEED_OPTION_ITEM_ACTIVE);
        }
      });
    }
  }

  public destroy(): void {
    if (this.stateUnbind) {
      this.stateUnbind();
      this.stateUnbind = null;
    }
    if (this.popoverController) {
      this.popoverController.destroy();
      this.popoverController = null;
    }
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    if (this.buttonEl) {
      this.buttonEl.remove();
      this.buttonEl = null;
    }
    StyleEngine.remove(PLAYER_CONSTANTS.STYLES.SPEED_CONTROL_STYLE_ID);
  }
}
```

### 5.2 工具箱锚点注入适配 (`src/ui/toolbar/toolbar.ts`)

同步优化 `ToolbarController` 中的 `SLOT_PLAYER_CONTROLS` 挂载策略，实现双向自愈锚点注入：
```typescript
[TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS]: {
  slotKey: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
  containerSelector: "#player-container-outer .html5-video-player, #movie_player",
  targetSelector: ".ytp-right-controls",
  elementId: TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID,
  isApplicable: (url: URL) => !url.pathname.startsWith("/shorts"),
  mount: (target: HTMLElement, element: HTMLElement) => {
    const speedBtn = target.querySelector<HTMLElement>(`.${PLAYER_CONSTANTS.CLASSES.SPEED_BUTTON_CLASS}`);
    if (speedBtn) {
      speedBtn.after(element);
    } else if (!target.contains(element)) {
      target.prepend(element);
    }
  }
}
```

### 5.3 插槽总线销毁闭环改造 (`src/ui/toolbar/slot-mount-bus.ts`)

在总线移除插槽时触发 `unmount` 契约：
```typescript
public unmountSlot(slotKey: string): void {
  this.pendingSlots.delete(slotKey);
  const entry = this.registeredSlots.get(slotKey);
  if (entry) {
    entry.definition.unmount?.();
    const el = document.getElementById(entry.definition.elementId);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }
  this.registeredSlots.delete(slotKey);
  if (this.pendingSlots.size === 0) {
    this.stopObserver();
  }
}
```

---

## 6. 架构收益评估 (Benefits & Wins)

| 评估维度 | 重构前现状 | 最佳实践重构后 |
| :--- | :--- | :--- |
| **Locality (局部性)** | 播放器控制栏存在 2 套独立的观察器和注入入口。 | 统一由 `SlotMountBus` 单点观察与调度，符合局部性原则。 |
| **消灭冗余监听器** | 存在 5000ms 的次级全局 MutationObserver 与常驻 capture click。 | 彻底消灭独立的 MutationObserver，外部点击仅在 Pinned 态按需激活。 |
| **Leverage (高杠杆)** | 手写基础浮层交互与样式重排计算。 | 复用成熟的 `PopoverEngine`，直接享受 GPU 合成层加速与视口安全边界。 |
| **DOM 拓扑稳定性** | 两个独立逻辑争相 `prepend`，按钮相对顺序偶发颠倒。 | 引入锚点自适应注入算法，无条件维持 `[倍速] [工具箱] [原生]` 物理顺序。 |
| **生命周期闭环** | 卸载后遗留悬浮菜单与事件订阅（幽灵 DOM 泄漏）。 | `SlotDefinition.unmount` 确保浮层、状态订阅与样式百分之百回收。 |
| **Decoupling (解耦)** | `PlayerController` 强耦合具体 DOM 视图类。 | 控制器回归纯粹领域模型，UI 视图通过 `FeatureRegistry` 胶水编排。 |

---

## 7. 破坏面排查与实施步骤

### 7.1 破坏面排查
- **类型系统兼容**：`SlotDefinition.unmount` 为可选属性（`unmount?: () => void`），完全向后兼容现有的 Shorts 与 Watch Metadata 插槽定义。
- **样式冲突**：通过 `StyleEngine` 管理的 `yt-turbo-speed-control` 样式作用域保持不变，类名严格使用 `PLAYER_CONSTANTS.CLASSES` 常量。
- **全屏与小窗适应**：菜单挂载于 `#movie_player` 根节点并由 `PopoverEngine` 托管，自动继承全屏层级与窗口变化重定位。

### 7.2 实施步骤
1. **契约扩展**：在 `src/ui/toolbar/types.ts` 中向 `SlotDefinition` 增加 `unmount?: () => void` 钩子，并在 `SlotMountBus` 的 `unmountSlot` 及路由失效清理中执行该钩子；
2. **常量收敛**：在 `src/features/player/constants.ts` 与 `src/ui/toolbar/constants.ts` 中补充 `SPEED_SLOT_KEY`、`TOOLBOX_ROOT_ID` 与 `SPEED_BUTTON_ID` 常量；
3. **改造 `speed-button-view.ts`**：剥离原有的 `waitForElement`、路由监听与粗糙事件，全面接入 `SlotMountBus` 与 `PopoverEngine`；
4. **改造 `ToolbarController` 挂载策略**：引入对倍速按钮的 `speedBtn.after(element)` 锚点协同；
5. **纯化 `PlayerController`**：移除对 `PlayerSpeedButtonView` 的直接调用；
6. **更新 `descriptors.ts`**：在 `isOpenSpeedControl` 的 `setup` 与 `teardown` 中完成领域层与视图层的装配编排；
7. **类型检查与构建验证**：运行 `pnpm check` 与 `pnpm build`，确保严格模式零报错。
