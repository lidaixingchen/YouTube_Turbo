# 播放器倍速特性生命周期架构深化方案

## 1. 方案目标

本方案在既有 [`PlayerController`](../src/features/player/controller.ts) 与 [`PlayerSpeedButtonView`](../src/features/player/speed-button-view.ts) 分工基础上，引入 `PlayerSpeedFeature` 深模块，将播放器快捷交互与倍速视图的组合生命周期从 [`FeatureDescriptor`](../src/registry/descriptors.ts) 收拢到单一领域 owner。

最终调用方只表达特性启停：

```typescript
PlayerSpeedFeature.enable();
PlayerSpeedFeature.disable();
```

`PlayerSpeedFeature` 在两个入口后隐藏以下规则：

- 幂等启停与同步重入保护；
- controller 与 view 的确定性启用顺序；
- 部分启用失败后的逆序回滚；
- teardown 期间的完整清理与错误聚合；
- 清理失败后的残余资源重试；
- 当前播放器快捷键兼容基线。

本方案继续遵守 [`ADR-0005`](adr/0005-unified-slot-mount-bus.md)：`PlayerSpeedButtonView` 仍通过 `SlotMountBus` 申请插槽，DOM 暂缺属于正常 pending 状态；不得增加独立 `MutationObserver`、轮询或导航监听。

## 2. 范围边界

本轮只深化倍速特性的生命周期 ownership，不改变播放器行为语义：

- `isOpenSpeedControl` 继续统一控制当前六项播放器快捷键，即 `>`、`<`、`Shift+R`、`Shift+S`、`Shift+P` 与 `Shift+L`；
- `PlayerController` 继续拥有播放速率、截图、画中画、循环播放、播放器状态与持久化逻辑；
- `PlayerSpeedButtonView` 继续拥有按钮、菜单、Popover、样式和状态订阅；
- `SlotMountBus` 继续拥有插槽等待、路由适用性和单一聚合观察器；
- `PopoverEngine`、既有锚点协议及播放器控制栏 DOM 拓扑保持不变；
- 关闭特性不重置当前播放倍速，也不销毁 `PlayerController` 的核心生命周期。

快捷键按能力拆分属于独立的产品语义决策，不进入本次架构迁移。

## 3. 当前架构摩擦

当前倍速特性描述符直接执行两组调用：

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

该结构已经完成领域控制器与 DOM adapter 的物理分离，但仍将组合规则暴露给配置层：

1. `FeatureDescriptor` 必须知道两个 implementation owner 及其调用顺序；
2. view 挂载失败时，已启用的快捷键没有统一回滚边界；
3. teardown 的第一步抛错时，调用方无法保证第二步继续执行；
4. `PlayerController.setupShortcuts()` 在全部注册结束后才集中保存 disposer，中途失败可能遗留部分快捷键；
5. `enableSpeedControl()` 在快捷键注册完成前设置启用标记，失败后可能形成状态与资源不一致；
6. 幂等、残余清理与错误聚合需要由每个组合 caller 自行理解。

这些规则属于播放器倍速特性，而不是通用配置注册表。将其继续留在 `descriptors.ts` 会降低 locality，并使新增资源时扩大调用方知识面。

## 4. 目标 architecture

```text
FeatureRegistry
    |
    | setup / teardown
    v
PlayerSpeedFeature
    |
    |-- 正向启用、逆序清理、失败回滚
    |
    +--> PlayerController
    |       |
    |       +--> ShortcutDispatcher
    |
    +--> PlayerSpeedButtonView
            |
            +--> SlotMountBus
            +--> PopoverEngine
            +--> StyleEngine
```

模块职责如下：

- `PlayerSpeedFeature`：倍速特性的事务型 lifecycle owner，只协调资源，不实现播放器命令或 DOM；
- `PlayerController`：播放器领域状态与命令 owner，并在内部保证快捷键注册事务完整；
- `PlayerSpeedButtonView`：倍速 UI adapter，保持既有 `mount()/unmount()` 幂等契约；
- `FeatureRegistry`：读取配置并调用 feature interface，不理解具体资源及其 ordering。

该结构不引入通用 `FeatureComposer`、全局依赖注入容器或额外的公共 port。当前依赖均为同进程依赖，可通过 Vitest 模块替换、局部 fake 与 jsdom 完成测试替换。

## 5. 领域词汇

实施时在 `CONTEXT.md` 增加以下领域定义：

```markdown
**PlayerSpeedFeature**:
播放器倍速特性的事务型生命周期深模块，原子协调 `PlayerController` 的快捷交互与 `PlayerSpeedButtonView` 的视图生命周期，并在部分失败时执行确定性回滚。
_Avoid_: SpeedControlManager, PlayerSpeedCoordinator, FeatureComposer
```

`PlayerSpeedFeature` 对应用户配置中的倍速特性边界；其名称不替代 `PlayerController` 或 `PlayerSpeedButtonView`，也不扩展为播放器核心生命周期 owner。

## 6. 最小公共 interface

建议新增 `src/features/player/speed-feature.ts`：

```typescript
export const PlayerSpeedFeature: Readonly<{
  readonly enable: () => void;
  readonly disable: () => void;
}> = createPlayerSpeedFeature();
```

公共 interface 只包含两个 entry point：

- 不公开 `mountView()`、`bindShortcuts()` 等 implementation 操作；
- 不公开 lifecycle phase 或资源 ownership；
- 不返回 disposer，避免将 disposer 保存责任重新推回 `FeatureDescriptor`；
- 不要求 caller 传入 controller、view 或 DOM dependency；
- 不依赖 `this` 绑定，可直接安全映射到描述符回调。

描述符目标形态：

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

## 7. 生命周期状态与 ownership

implementation 内部维护以下阶段：

| 阶段 | 含义 | 允许的下一步 |
| --- | --- | --- |
| `inactive` | 不持有快捷交互或视图资源 | `enable()` |
| `activating` | 正在按顺序获取资源 | 成功进入 `active`，失败进入回滚 |
| `active` | 两类资源均已取得 | `disable()` |
| `deactivating` | 正在逆序释放资源 | 成功进入 `inactive` |
| `cleanup-pending` | 至少一项清理失败，保留精确 ownership | 再次 `disable()` 或先清理后 `enable()` |

内部至少记录 controller 与 view 两类资源的 ownership。标记只在对应清理成功后清除，确保失败后的下一次 `disable()` 只重试仍由本 module 持有的资源。

### 7.1 启用 ordering

1. `inactive` 转为 `activating`；
2. 调用 `PlayerController.getInstance().enableSpeedControl()`；
3. controller 成功后记录 controller ownership；
4. 调用 `PlayerSpeedButtonView.mount()`；
5. view 成功后记录 view ownership；
6. 两项均成功后转为 `active`。

先建立播放器交互，再暴露可点击视图，避免按钮已经出现但领域命令尚不可用。

`enable()` 的幂等规则：

- `active` 时直接返回；
- `activating` 或 `deactivating` 时拒绝同步重入并抛出具名 lifecycle 错误；
- `cleanup-pending` 时先完成残余清理，清理成功后才允许新一轮启用；
- DOM 暂缺不属于启用失败，`PlayerSpeedButtonView` 注册到 `SlotMountBus` 后即可视为取得 view ownership。

### 7.2 停用 ordering

1. 转为 `deactivating`；
2. 若持有 view，调用 `PlayerSpeedButtonView.unmount()`；
3. 若持有 controller，调用 `PlayerController.getInstance().disableSpeedControl()`；
4. 所有资源成功释放后转为 `inactive`。

清理采用启用的严格逆序，先阻断新的 UI 输入并释放 Popover、DOM 与状态订阅，再注销快捷键。

`disable()` 的幂等规则：

- `inactive` 时为常数时间 no-op；
- 必须尝试释放所有仍被持有的资源；
- 某一步失败不能阻断后续清理；
- 清理不完整时进入 `cleanup-pending`，保留精确 ownership 供后续重试。

## 8. 错误与回滚语义

### 8.1 controller 启用失败

- 不进入正常 view 挂载流程；
- 防御性调用 `disableSpeedControl()`，确保 controller 的部分资源被释放；
- 恢复 `inactive`，或在清理失败时进入 `cleanup-pending`；
- 将原始启用错误传播给 `FeatureRegistry`。

### 8.2 view 挂载失败

- 先调用 `PlayerSpeedButtonView.unmount()`，清理可能已创建的部分 UI 资源；
- 再调用 `disableSpeedControl()` 释放 controller 资源；
- 每项回滚相互隔离，某一步失败不阻断下一步；
- 只有全部回滚成功才恢复 `inactive`。

### 8.3 错误聚合

- 启用失败时，原始启用错误作为首要原因；
- 同一操作中的回滚或 teardown 错误通过 `AggregateError` 完整保留；
- implementation 不吞掉清理错误，也不在配置层复制错误处理；
- `FeatureRegistry` 继续作为特性启停错误的记录边界。

异步播放器命令、状态订阅 callback 与后续 DOM 挂载错误继续由各自 owner 隔离，不扩大 `PlayerSpeedFeature` 的同步 interface。

## 9. PlayerController 快捷键事务

`PlayerSpeedFeature` 的跨模块回滚必须建立在 controller 内部资源一致性上。`PlayerController.setupShortcuts()` 需要同步深化：

```typescript
private setupShortcuts(): void {
  this.teardownShortcuts();

  const pendingCleanups: Array<() => void> = [];

  try {
    pendingCleanups.push(registerSpeedUp());
    pendingCleanups.push(registerSpeedDown());
    pendingCleanups.push(registerResetSpeed());
    pendingCleanups.push(registerScreenshot());
    pendingCleanups.push(registerPictureInPicture());
    pendingCleanups.push(registerLoop());
    this.shortcutCleanups = pendingCleanups;
  } catch (error: unknown) {
    disposeInReverse(pendingCleanups);
    throw error;
  }
}
```

以上为接口级伪代码，`register*` 与 `disposeInReverse` 作为 `PlayerController` 私有 implementation 落位，不新增公共 helper。

必须满足：

- 每次 `ShortcutDispatcher.register()` 成功后立即记录 disposer；
- 注册中途失败时逆序释放已取得的 disposer；
- `isSpeedControlEnabled` 仅在全部快捷键注册成功后设为 `true`；
- `teardownShortcuts()` 对全部 disposer 执行 best-effort 清理，并在完成后原子更新内部集合；
- 禁止引入 `PlayerShortcutsService` 或全局 shortcut port，本阶段保持 controller 领域边界稳定。

## 10. PlayerSpeedButtonView 契约

视图 adapter 保持当前职责与公共形态，但需要通过测试锁定以下不变量：

- `mount()` 重复调用不重复注册插槽、样式或状态订阅；
- `unmount()` 在 pending、已挂载、Popover 打开及部分构建状态下均可安全调用；
- `unmount()` 返回后不存在倍速按钮、菜单、Popover listener 或播放器状态订阅；
- `SlotMountBus.unmountSlot()` 与视图显式清理形成幂等闭环；
- view 不拥有 `PlayerController.init()/destroy()`，也不改变播放速率持久化状态；
- view 不创建新的 Observer、导航 listener 或定时轮询。

若当前 `unmountSlot()` 回调与显式 `destroy()` 存在重复路径，应在视图内部以幂等 cleanup 收敛，而不是由 `PlayerSpeedFeature` 判断 DOM 细节。

## 11. 文件落位

| 文件 | 目标职责 |
| --- | --- |
| `src/features/player/speed-feature.ts` | 新增 `PlayerSpeedFeature` interface、状态、ownership、ordering、回滚与错误聚合。 |
| `src/features/player/controller.ts` | 保留播放器领域职责；深化快捷键注册与注销事务。 |
| `src/features/player/speed-button-view.ts` | 保持 UI adapter；补齐幂等清理和部分挂载失败安全性。 |
| `src/features/player/index.ts` | 导出 `PlayerSpeedFeature`；仅在存在真实外部 caller 时保留视图导出。 |
| `src/registry/descriptors.ts` | 倍速描述符只调用 `PlayerSpeedFeature.enable()/disable()`。 |
| `src/features/player/__tests__/speed-feature.test.ts` | lifecycle ordering、幂等、失败回滚与残余清理测试。 |
| `src/features/player/__tests__/speed-feature.integration.test.ts` | controller、view、SlotMountBus 与 DOM 资源联合测试。 |
| `CONTEXT.md` | 登记 `PlayerSpeedFeature` 领域词汇。 |

## 12. 迁移阶段

### 阶段一：建立 characterization tests

- 锁定六项快捷键的现有开关语义；
- 锁定 controller → view 的启用顺序与 view → controller 的停用目标顺序；
- 验证 pending 插槽、已挂载插槽和打开 Popover 三类状态下的清理结果；
- 记录当前 `FeatureDescriptor` 可观察行为，不断言 private implementation。

完成条件：测试能够在生命周期资源泄漏或行为语义变化时失败。

### 阶段二：强化 controller 事务

- 将快捷键 disposer 改为逐项获取、局部暂存和失败逆序释放；
- 调整 `isSpeedControlEnabled` 的提交时点；
- 让 teardown 完整尝试全部 disposer；
- 保持六项快捷键和播放器命令不变。

完成条件：任一快捷键注册失败后，controller 不保留部分注册或错误启用状态。

### 阶段三：引入 PlayerSpeedFeature

- 新建 `speed-feature.ts`；
- 实现 phase、ownership、同步重入保护和逆序 cleanup；
- 为启用失败、回滚失败及 teardown 失败建立聚合错误；
- 通过局部模块替换测试 controller/view，不导出 production test seam。

完成条件：仅通过 `enable()/disable()` 可证明全部生命周期不变量。

### 阶段四：迁移 composition root

- 将倍速描述符替换为 `PlayerSpeedFeature` 两个入口；
- 更新 player barrel export；
- 在确认不存在外部 caller 后收窄 `PlayerSpeedButtonView` 的 barrel 暴露；
- 更新 `CONTEXT.md`。

完成条件：`descriptors.ts` 不再出现 controller/view 配对与 ordering。

### 阶段五：集成验证

- 执行全部 Vitest、严格类型检查与生产构建；
- 在普通详情页、Shorts、首页之间切换并反复启停特性；
- 验证倍速状态保持、快捷键兼容、视图重挂载与 Observer 停机。

## 13. 测试方案

### 13.1 生命周期单元测试

- 首次 `enable()` 严格按 controller → view 执行；
- 重复 `enable()` 不重复注册快捷键或插槽；
- `disable()` 严格按 view → controller 执行；
- 重复 `disable()` 为 no-op；
- controller 启用失败时不进入 view 正常挂载；
- view 挂载失败时执行 view → controller 完整回滚；
- 回滚某一步失败时仍执行其余清理并保留全部错误；
- teardown 第一项失败时第二项仍执行；
- cleanup 失败后再次 `disable()` 只重试残余资源；
- `cleanup-pending` 状态下再次 `enable()` 先完成清理；
- transition 期间同步重入不会取得第二份资源。

### 13.2 controller 事务测试

- 六项快捷键全部成功时一次性提交 cleanup ledger；
- 每个注册位置分别注入失败，已取得的 disposer 均按逆序执行；
- 注册失败后 `isSpeedControlEnabled` 为 `false`；
- teardown 中某个 disposer 抛错时，其余 disposer 仍执行；
- 重复 enable/disable 不产生重复快捷键 handler。

### 13.3 jsdom 集成测试

- DOM 暂缺时 `enable()` 成功，`SlotMountBus` 至多保持一个活跃观察器；
- 插槽挂载后观察器活跃数归零；
- pending、已挂载和 Popover 打开状态下 `disable()` 均清空按钮、菜单、订阅与快捷键；
- `/watch → /shorts → /watch` 只由 `SlotMountBus` 重挂载视图，不重复激活 feature；
- disable 后旧状态 callback 不再更新 DOM；
- feature 关闭后播放速率保持不变，`PlayerController` 的截图、画中画与循环命令仍可调用；
- setup → teardown → setup 不复用旧 ownership 或旧 DOM。

测试复用仓库现有 Vitest、jsdom、`src/test/setup.ts` 与 fake Observer 基础设施，不新增测试运行器。

## 14. 删除测试与 depth 验收

`PlayerSpeedFeature` 只有在真实隐藏以下复杂度时才通过删除测试：

- lifecycle phase 与幂等；
- controller/view ownership；
- 启用 ordering 与逆序 teardown；
- 部分失败回滚；
- cleanup retry；
- 错误聚合。

删除该 module 后，上述规则会重新散落到 `FeatureDescriptor` 或其他 composition caller，因此它具有实际 module depth。若最终 implementation 仅剩两次直通调用而没有 ownership 与错误语义，则不满足本方案的完成定义。

## 15. 验收矩阵

| 维度 | 场景 | 通过标准 |
| --- | --- | --- |
| interface | 倍速描述符启停 | 只调用 `PlayerSpeedFeature.enable()/disable()` |
| compatibility | 切换 `isOpenSpeedControl` | 六项既有快捷键语义保持一致 |
| atomicity | 任一快捷键注册失败 | 无部分 handler、启用标记保持一致 |
| rollback | view 挂载失败 | view 与 controller 资源均被逆序清理 |
| cleanup | teardown 中单项抛错 | 其余资源继续释放，残余 ownership 可重试 |
| route lifecycle | watch/shorts/home 往返 | 不重复 feature activation，不产生幽灵 DOM |
| ADR-0005 | DOM 延迟出现 | 仅使用共享聚合观察器，挂载完成后停机 |
| domain boundary | 关闭倍速特性 | 不调用 `PlayerController.destroy()`，不重置倍速 |
| type safety | `pnpm check` | TypeScript strict 零错误 |
| tests | `pnpm test` | 生命周期与集成测试全部通过 |
| build | `pnpm build` | Userscript 生产构建成功 |

## 16. 交付验收命令

```bash
pnpm test
pnpm check
pnpm build
```

生产构建通过后，在 Tampermonkey 或 Violentmonkey 中执行以下路径：

1. 普通详情页启用倍速特性，验证按钮、菜单与六项快捷键；
2. 打开 Popover 后关闭特性，确认按钮与菜单立即清理；
3. 详情页 → Shorts → 首页 → 详情页，确认视图按路由恢复且无重复 handler；
4. 连续启用、关闭、再次启用，确认倍速状态保持且交互只触发一次；
5. 检查全部插槽就绪后的活跃 `MutationObserver` 数量为零。

## 17. 完成定义

满足以下条件时，本架构深化完成：

- `PlayerSpeedFeature` 成为倍速特性的唯一组合生命周期入口；
- `FeatureDescriptor` 不再理解 `PlayerController` 与 `PlayerSpeedButtonView` 的配对顺序；
- controller 快捷键注册具备逐项 disposer ledger、失败回滚和正确提交时点；
- enable、disable、rollback 与 cleanup retry 均具备确定性语义；
- 六项播放器快捷键及倍速状态行为保持兼容；
- `PlayerController`、`PlayerSpeedButtonView`、`SlotMountBus` 与 `PopoverEngine` 的领域边界保持清晰；
- 不新增轮询、独立 Observer、通用 lifecycle framework 或公共测试 seam；
- `pnpm test`、`pnpm check` 与 `pnpm build` 全部通过。
