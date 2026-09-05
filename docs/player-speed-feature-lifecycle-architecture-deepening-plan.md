# 播放器倍速特性生命周期架构深化方案

## 1. 方案目标

本方案在既有 [`PlayerController`](../src/features/player/controller.ts) 与 [`PlayerSpeedButtonView`](../src/features/player/speed-button-view.ts) 分工基础上，引入 `PlayerSpeedFeature` 深模块，将播放器快捷交互与倍速视图的组合生命周期从 [`FeatureDescriptor`](../src/registry/descriptors.ts) 收拢到单一领域所有者（Lifecycle Owner）。

调用方仅需表达特性的启停意图：

```typescript
PlayerSpeedFeature.enable();
PlayerSpeedFeature.disable();
```

`PlayerSpeedFeature` 在极简接口后封装以下核心规则：

- 幂等启停与 $O(1)$ 常数时间快速返回；
- 确定的正向启用顺序（Controller → View）；
- 确定的逆序注销顺序（View → Controller）；
- 启用异常时的原子回滚与状态自愈，杜绝半激活状态；
- 注销期间的异常隔离与尽力释放（Best-effort Teardown）；
- 既有播放器快捷键兼容基线。

本方案继续严格遵守 [`ADR-0005`](adr/0005-unified-slot-mount-bus.md)：`PlayerSpeedButtonView` 统一通过 `SlotMountBus` 挂载插槽，DOM 暂缺属于正常 pending 状态；严禁新增独立的 `MutationObserver`、轮询或导航监听。

## 2. 范围边界

本方案专注深化倍速特性的组合生命周期契约，不改变播放器既有行为语义：

- `isOpenSpeedControl` 继续统一控制当前六项播放器快捷键（`>`、`<`、`Shift+R`、`Shift+S`、`Shift+P`、`Shift+L`）；
- `PlayerController` 继续拥有播放速率、截图、画中画、循环播放及底层状态同步逻辑；
- `PlayerSpeedButtonView` 继续拥有按钮、菜单、Popover、样式与状态订阅；
- `SlotMountBus` 继续拥有插槽等待、路由适用性与单一聚合观察器调度；
- `PopoverEngine`、既有锚点协议及播放器控制栏 DOM 拓扑保持不变；
- 关闭特性不重置当前播放倍速，亦不销毁 `PlayerController` 核心实例。

> **架构边界说明**：
> 当前 `isOpenSpeedControl` 开关同时托管截屏、画中画与循环播放等非倍速快捷键，属于兼容既有交互的历史设计。本方案在此基线上实现生命周期原子化，快捷键按能力解耦属于独立的领域演进目标，不在本方案中变更。

## 3. 当前架构摩擦

当前倍速特性在描述符层直接硬编码两组跨模块调用：

```typescript
setup: (): void => {
  PlayerController.getInstance().enableSpeedControl();
  PlayerSpeedButtonView.mount();
},
teardown: (): void => {
  PlayerController.getInstance().disableSpeedControl();
  PlayerSpeedButtonView.unmount();
}
```

该结构存在以下架构摩擦点：

1. **组合规则泄露**：`FeatureDescriptor` 直接感知两个具体实现类及其执行顺序，与其它单入口特性不一致；
2. **缺乏原子回滚**：`view.mount()` 若发生异常，已启用的控制器快捷键未被逆序回滚，导致系统残留部分激活资源；
3. **注销缺乏隔离**：`teardown` 某一步骤若抛出异常，会导致后续清理中断，遗留未销毁的 DOM 或事件订阅；
4. **快捷键注册存在竞态**：`PlayerController.setupShortcuts()` 在全部注册完成后才集中保存 Disposer，中途失败将导致孤儿快捷键残留；
5. **状态提交时点不一致**：`enableSpeedControl()` 在快捷键注册完成前即设置 `isSpeedControlEnabled = true`，异常时破坏状态真实性。

## 4. 目标架构

```text
FeatureRegistry
    |
    | setup / teardown
    v
PlayerSpeedFeature (生命周期深模块)
    |
    |-- 正向装配、逆序注销、失败原子回滚
    |
    +--> PlayerController (领域模型)
    |       |
    |       +--> ShortcutDispatcher
    |
    +--> PlayerSpeedButtonView (UI 适配器)
            |
            +--> SlotMountBus
            +--> PopoverEngine
            +--> StyleEngine
```

各层职责划分：

- `PlayerSpeedFeature`：倍速特性的统一生命周期门面，负责子系统的编排、回滚与异常安全，不承载具体业务与 DOM 操作；
- `PlayerController`：播放器核心领域单例，管理播放速率状态机，并在内部保证快捷键注册的事务原子性；
- `PlayerSpeedButtonView`：纯 UI 适配器，管理按钮与浮层 DOM 结构，维持幂等挂载与销毁契约；
- `FeatureRegistry`：通用配置注册中心，只调用特性提供的统一接口，不感知具体子模块与装配顺序。

## 5. 领域词汇

实施时在 `CONTEXT.md` 登记以下领域术语：

```markdown
**PlayerSpeedFeature**:
播放器倍速特性的生命周期深模块，原子协调 `PlayerController` 快捷交互与 `PlayerSpeedButtonView` 视图适配器，封装正向装配、逆序注销及失败回滚机制。
_Avoid_: SpeedControlManager, PlayerSpeedCoordinator, FeatureComposer
```

## 6. 最小公共接口与实现模型

在 `src/features/player/speed-feature.ts` 中实现：

```typescript
import { PlayerController } from "./controller";
import { PlayerSpeedButtonView } from "./speed-button-view";

let isEnabled: boolean = false;

function teardownSafely(): void {
  // 严格逆序注销：先注销视图阻断交互，再注销控制器快捷键
  try {
    PlayerSpeedButtonView.unmount();
  } catch (error: unknown) {
    console.error("[PlayerSpeedFeature] Failed to unmount speed view:", error);
  }

  try {
    PlayerController.getInstance().disableSpeedControl();
  } catch (error: unknown) {
    console.error("[PlayerSpeedFeature] Failed to disable speed control:", error);
  }
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

    try {
      // 1. 优先建立领域能力与快捷键
      PlayerController.getInstance().enableSpeedControl();
      // 2. 再注册插槽与展示视图
      PlayerSpeedButtonView.mount();
      isEnabled = true;
    } catch (error: unknown) {
      // 任意步骤失败，立即全量回滚并重置状态，杜绝中间半激活态
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

接口设计原则：

- 不公开 `mountView()`、`bindShortcuts()` 等实现细节；
- 不向外部泄漏 Disposer，避免将资源管理负担推回调用方；
- 方法不依赖 `this` 上下文，可直接安全传递为高阶函数引用；
- 提供只读 `isActive()` 方法，方便测试断言与健康检查。

描述符接入形态：

```typescript
{
  id: "isOpenSpeedControl",
  i18nKey: "function_is_speed_control_open",
  titleI18nKey: "feature_speed_control_title",
  descI18nKey: "feature_speed_control_desc",
  defaultValue: true,
  order: 50,
  setup: (): void => PlayerSpeedFeature.enable(),
  teardown: (): void => PlayerSpeedFeature.disable()
}
```

## 7. 生命周期与状态治理

在浏览器单线程同步环境中，状态模型应保持极简与确定性，杜绝复杂的中间态与状态死锁。

### 7.1 状态转移与幂等性

- **状态表达**：由内部私有布尔变量 `isEnabled` 表达当前激活态；
- **快速幂等**：
  - `enable()` 在 `isEnabled === true` 时直接常数时间返回；
  - `disable()` 在 `isEnabled === false` 时直接常数时间返回；
- **零僵死保证**：异常发生时状态始终被原子重置为 `false`，后续调用具备清晰确定的起点，绝不锁死系统。

### 7.2 启用时序（Controller → View）

1. 幂等检查：已启用则直接返回；
2. 启用领域快捷键：调用 `PlayerController.getInstance().enableSpeedControl()`；
3. 挂载视图：调用 `PlayerSpeedButtonView.mount()`；
4. 提交状态：全部执行成功后，将 `isEnabled` 设为 `true`。

> 遵循“领域交互就绪优先于 UI 暴露”原则，确保按钮渲染完成后底层命令已百分之百可用。

### 7.3 停用时序（View → Controller）

1. 幂等检查：未启用则直接返回；
2. 撤销标记：立即将 `isEnabled` 设为 `false`；
3. 逆序清理：调用 `teardownSafely()`；
   - 先执行 `PlayerSpeedButtonView.unmount()`，阻断 UI 交互、注销浮层与状态订阅；
   - 后执行 `PlayerController.getInstance().disableSpeedControl()`，清理全局快捷键。

## 8. 异常防护与回滚语义

### 8.1 启用异常原子回滚

- **Controller 启用失败**：不进入 View 挂载流程，调用 `teardownSafely()` 清理潜在残留，保持 `isEnabled = false`，将异常向上抛出；
- **View 挂载失败**：立即逆序执行完整清理（View 清理 + Controller 清理），撤销已注册快捷键，保持 `isEnabled = false`，将异常向上抛出；
- **调用方结果**：失败后系统始终处于完全未激活状态，不遗留任何孤儿 DOM、未解除的观察器或悬挂快捷键。

### 8.2 停用异常隔离

- `teardownSafely()` 使用相互独立的异常保护块；
- View 注销抛错不阻断 Controller 快捷键的清理；
- Controller 注销抛错亦不影响状态标记的完成；
- 所有清理异常均记录错误日志，确保资源得到尽最大努力释放。

## 9. PlayerController 快捷键事务

`PlayerSpeedFeature` 的回滚必须依赖 Controller 内部快捷键注册的事务一致性。`PlayerController.setupShortcuts()` 规范如下：

```typescript
private setupShortcuts(): void {
  this.teardownShortcuts();

  const acquiredCleanups: Array<() => void> = [];

  try {
    acquiredCleanups.push(
      ShortcutDispatcher.register({
        key: ">",
        shiftKey: true,
        description: "Increase playback speed",
        handler: () => this.increaseSpeed()
      })
    );
    acquiredCleanups.push(
      ShortcutDispatcher.register({
        key: "<",
        shiftKey: true,
        description: "Decrease playback speed",
        handler: () => this.decreaseSpeed()
      })
    );
    acquiredCleanups.push(
      ShortcutDispatcher.register({
        key: "r",
        shiftKey: true,
        description: "Reset playback speed to 1.0x",
        handler: () => this.resetSpeed()
      })
    );
    acquiredCleanups.push(
      ShortcutDispatcher.register({
        key: "s",
        shiftKey: true,
        description: "Capture screenshot",
        handler: () => {
          this.captureScreenshot().catch((err: unknown) => {
            console.error("[PlayerController] Screenshot error:", err);
          });
        }
      })
    );
    acquiredCleanups.push(
      ShortcutDispatcher.register({
        key: "p",
        shiftKey: true,
        description: "Toggle Picture-in-Picture",
        handler: () => {
          this.togglePictureInPicture().catch((err: unknown) => {
            console.error("[PlayerController] PiP error:", err);
          });
        }
      })
    );
    acquiredCleanups.push(
      ShortcutDispatcher.register({
        key: "l",
        shiftKey: true,
        description: "Toggle Loop playback",
        handler: () => this.toggleLoop()
      })
    );

    // 全部成功后原子提交
    this.shortcutCleanups = acquiredCleanups;
  } catch (error: unknown) {
    // 逆序回滚已取得的 Disposer
    while (acquiredCleanups.length > 0) {
      const cleanup = acquiredCleanups.pop();
      try {
        cleanup?.();
      } catch (e: unknown) {
        console.error("[PlayerController] Shortcut rollback error:", e);
      }
    }
    throw error;
  }
}
```

配套改造点：

- `isSpeedControlEnabled` 仅在快捷键全部成功绑定后提交为 `true`；
- `teardownShortcuts()` 采用独立的异常保护块遍历执行全部 Disposer，保证释放完整性。

## 10. PlayerSpeedButtonView 契约

视图适配器保持轻量与幂等，满足以下不变量：

- `mount()` 重复调用不重复注入样式、不重复注册插槽；
- `unmount()` 在 pending 状态、已挂载状态、Popover 展开状态均可安全调用；
- `unmount()` 执行后，相关 DOM、Popover 实例、样式及状态订阅均被完整清理；
- `SlotDefinition.unmount` 回调与显式 `unmount()` 保持统一收敛，避免双重清理冲突；
- 不持有 `PlayerController` 的初始化或销毁逻辑；
- 严格遵循 `ADR-0005`，不引入独立的 `MutationObserver` 或常驻定时器。

## 11. 文件落位

| 文件 | 职责说明 |
| --- | --- |
| `src/features/player/speed-feature.ts` | 新增 `PlayerSpeedFeature`，负责倍速生命周期的统一协调、原子回滚与异常安全 |
| `src/features/player/controller.ts` | 保留领域模型；加固快捷键注册事务与原子提交 |
| `src/features/player/speed-button-view.ts` | 维持 UI 适配器职责；确保挂载与清理的幂等性 |
| `src/features/player/index.ts` | 导出 `PlayerSpeedFeature`，作为该特性的唯一生命周期出口 |
| `src/registry/descriptors.ts` | 倍速特性描述符对齐为单一 `PlayerSpeedFeature.enable()/disable()` 调用 |
| `src/features/player/__tests__/speed-feature.test.ts` | 生命周期单元测试：正逆序、幂等、异常回滚与清理隔离 |
| `CONTEXT.md` | 登记 `PlayerSpeedFeature` 领域词汇 |

## 12. 迁移阶段

### 阶段一：建立特征测试（Characterization Tests）

- 锁定当前六项快捷键的行为语义与响应；
- 锁定 controller → view 的正向时序与 view → controller 的逆向时序；
- 覆盖插槽 pending、已挂载、浮层打开三种状态下的销毁路径；
- 确保测试只断言公开行为，不断言私有实现。

### 阶段二：加固 Controller 快捷键事务

- 改造 `setupShortcuts()`：引入暂存数组，支持逐项回滚；
- 纠正 `isSpeedControlEnabled` 的置位时机；
- 确保任一快捷键注册抛错时，不残留任何孤儿快捷键。

### 阶段三：引入 PlayerSpeedFeature

- 新建 `src/features/player/speed-feature.ts`；
- 实现确定性时序、原子回滚与安全停用机制；
- 编写生命周期单元测试，覆盖正常启停、重复启停与模拟抛错回滚。

### 阶段四：迁移特性描述符

- 将 `descriptors.ts` 中的倍速配置切换为 `PlayerSpeedFeature.enable()` / `disable()`；
- 更新 `src/features/player/index.ts` 导出；
- 更新 `CONTEXT.md`。

### 阶段五：集成验证与回归测试

- 运行全部测试套件、严格模式类型检查与打包构建；
- 在实际页面中验证不同路由切换与特性反复启停的行为一致性。

## 13. 测试方案

### 13.1 生命周期单元测试 (`speed-feature.test.ts`)

- **正常装配顺序**：`enable()` 严格按照 Controller → View 顺序执行；
- **正向启用幂等**：连续多次调用 `enable()`，底层组件仅初始化一次；
- **正常注销顺序**：`disable()` 严格按照 View → Controller 逆序执行；
- **逆向注销幂等**：连续多次调用 `disable()`，后续调用为常数时间 no-op；
- **Controller 失败防护**：Controller 抛错时 View 不被调用，且状态为未激活；
- **View 失败原子回滚**：View 挂载抛错时，Controller 快捷键立即被逆序注销，系统恢复未激活态；
- **Teardown 异常隔离**：View 注销抛错时，Controller 快捷键仍被正常释放。

### 13.2 Controller 事务测试

- 六项快捷键全部注册成功后，原子提交 Disposer 数组；
- 任意快捷键注册失败时，已取得的 Disposer 均按逆序调用注销；
- 注册失败后 `isSpeedControlEnabled` 维持 `false`；
- Teardown 遍历注销，个别失败不影响其余 Disposer 的执行。

### 13.3 集成测试

- DOM 暂缺时 `enable()` 正常完成，插槽进入 `SlotMountBus` 队列；
- 插槽挂载后全局活跃 `MutationObserver` 归零；
- 各种视图状态下调用 `disable()`，DOM 节点与事件订阅均彻底清除；
- 切换路由（如 `/watch` → `/shorts` → `/watch`）仅触发视图重挂载，不重复执行特性生命周期。

## 14. 模块深度与删除测试

`PlayerSpeedFeature` 是一个典型的深模块（Deep Module）：

- **接口极度收敛**：对外仅暴露 `enable()` 与 `disable()` 两个无参函数，隐藏了多组件依赖；
- **隐藏固有复杂度**：
  - 隐藏了快捷交互与视图适配器之间的跨模块依赖关系；
  - 隐藏了确定的装配时序（Controller → View）与严格的逆序注销（View → Controller）；
  - 隐藏了部分步骤失败时的原子回滚策略，保证调用方永远面对一致的最终状态；
- **删除测试验证**：若移除该模块，上述时序协调、逆序注销与原子回滚逻辑将重新散落并泄露至 `descriptors.ts` 配置层，或导致配置层不得不理解深层实现细节。

## 15. 验收矩阵

| 维度 | 验证场景 | 验收基准 |
| --- | --- | --- |
| **API 纯粹度** | 特性描述符配置 | 仅调用 `PlayerSpeedFeature.enable()/disable()` |
| **功能兼容性** | 切换 `isOpenSpeedControl` | 六项快捷键行为与倍速按钮体验完全保持一致 |
| **事务原子性** | 快捷键注册中途抛错 | 已注册项目逆序回滚，无残留孤儿 Handler |
| **回滚安全性** | View 挂载过程抛错 | Controller 快捷键立即逆序回滚，状态保持为未激活 |
| **清理完整性** | View 销毁过程抛错 | Controller 快捷键仍被正常清理，系统无残留资源 |
| **架构规范性** | 遵守 ADR-0005 | 全站共享单个活跃观察器，挂载完成立即断开 |
| **领域隔离度** | 关闭倍速特性 | 保持当前播放速率，不销毁 `PlayerController` 核心实例 |
| **类型安全性** | 执行 `pnpm check` | TypeScript strict 模式零错误 |
| **测试完整性** | 执行 `pnpm test` | 生命周期与集成测试 100% 通过 |
| **构建完整性** | 执行 `pnpm build` | 脚本打包成功，产物正常输出 |

## 16. 交付验收命令

```bash
pnpm test
pnpm check
pnpm build
```

生产构建完成后，在浏览器油猴环境中进行以下验证：

1. 打开普通视频播放页，开启倍速功能，验证倍速按钮与六项快捷键均正常工作；
2. 展开倍速浮层菜单，在浮层展开状态下通过设置面板关闭特性，确认按钮与浮层立即彻底销毁；
3. 在视频详情页、Shorts、首页之间来回切换，验证插槽能够正常按路由恢复，且无重复注册；
4. 反复启闭特性，验证播放速率得到保持，且未产生悬挂的观察器或内存泄漏。

## 17. 完成定义

满足以下条件时，本方案视为落地完成：

- `PlayerSpeedFeature` 成为倍速特性的唯一组合生命周期入口；
- `FeatureDescriptor` 不再感知 `PlayerController` 与 `PlayerSpeedButtonView` 的装配与时序细节；
- Controller 快捷键注册具备逐项 Disposer 暂存、失败回滚与正确提交时点；
- 生命周期启用具备原子性（全成功或全回滚），注销具备隔离性（尽最大努力释放）；
- 六项快捷键与倍速视图行为语义保持完全兼容；
- 代码与架构不引入冗余的状态机、独立轮询或常驻观察器；
- `pnpm test`、`pnpm check` 与 `pnpm build` 全部无警告、无错误通过。
