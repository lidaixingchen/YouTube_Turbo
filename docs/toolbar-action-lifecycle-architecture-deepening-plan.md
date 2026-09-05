# 工具栏动作生命周期架构深化方案

## 1. 方案目标

本方案将 [`ActionRegistry`](../src/ui/toolbar/action-registry.ts) 的动作存储、排序、状态绑定与注销实现收回其唯一调用者 [`ToolbarController`](../src/ui/toolbar/toolbar.ts)，形成由一个稳定 interface 隐藏动作 ownership、状态订阅、插槽协调、渲染与清理规则的深模块。

最终 public interface 收敛为：

```typescript
Toolbar.init(): void;
Toolbar.registerAction(action: ActionConfig): () => void;
Toolbar.registerActions(actions: readonly ActionConfig[]): () => void;
Toolbar.destroy(): void;
```

调用方只声明动作并持有注册 disposer，不再理解动作存储、状态 binding、slot mount、局部 refresh 或 cleanup ordering。

本方案保留当前“一项 `ActionConfig` 对应一个插槽”的数据模型，不引入多 placement、repository、event bus、全局依赖注入或新的 registry port。`SlotMountBus` 继续作为 [`ADR-0005`](adr/0005-unified-slot-mount-bus.md) 确立的独立 seam。

## 2. 范围边界

本轮聚焦 action lifecycle 与 `ToolbarController` module depth：

- 保留播放器控制栏、Shorts 动作栏与详情页元数据栏三个既有插槽；
- 保留 `ActionConfig.id`、`slot`、标题、图标、顺序、可见性、激活态、执行与状态订阅能力；
- 保留 `registerAction()` 与 `registerActions()` 两种 caller 入口，前者委托同一个批量事务 implementation；
- 保留动作定义跨 `Toolbar.destroy()/init()` 的生命周期语义；
- 保留 `SlotMountBus` 的单 Observer、路由驱动、pending slot 与挂载即停机约束；
- 保留既有 Popover、DOM anchor、图标和多语言 infrastructure；
- 下载动作继续使用三个独立 action ID，不在本轮合并为多 placement 领域对象。

本方案会收窄 `ToolbarController` 的命令式公开 surface：`mount()`、`unmount()`、`refresh()` 与 `syncSlots()` 转为私有 implementation；动作执行和状态通知由 Toolbar 自动使受影响插槽失效，因此 `ActionContext.refresh` 从公共数据契约移除。

## 3. 当前架构摩擦

### 3.1 ActionRegistry 的实际边界

`ActionRegistry` 当前持有两张静态 Map，并提供：

- 单项与批量注册；
- 按插槽过滤、排序；
- active icon 解析；
- `onStateBind` disposer 保存；
- 单项、全部 binding 和 action 清理。

这些能力只有 `ToolbarController` 一个 production caller。删除该 class 后，数据结构与遍历逻辑会自然进入唯一 caller，不会向多个模块扩散，因此 `ActionRegistry` 未通过删除测试。

### 3.2 动作 ownership 状态

当前注册以 action ID 作为唯一删除依据。若同名动作被后续注册覆盖，旧 disposer 仍可删除新动作，缺少 registration ownership。

批量注册逐项写入 Map，缺少先校验后提交的事务边界；批内重复 ID 或跨批冲突可能形成部分状态或静默替换。

### 3.3 状态订阅与渲染耦合

状态 binding 在按钮渲染期间建立。每次重绘需要先解绑再绑定；不可见动作或 DOM 尚未出现时没有稳定订阅 owner，状态变化无法独立驱动动作重新出现。

`ActionContext.refresh()` 还要求 action caller 理解 Toolbar 需要手动刷新。循环播放动作同时通过 click context 和 `onStateBind` 触发 refresh，扩大了调用方 interface。

### 3.4 共享 SlotMountBus ownership

当前 `ToolbarController.unmount()` 的全量路径调用 `SlotMountBus.destroy()`。该总线同时服务 `PlayerSpeedButtonView`，因此 Toolbar 销毁可能清除不属于 Toolbar 的倍速插槽和共享导航绑定。

`ToolbarController` 只能卸载自己拥有的三个 slot。共享总线的全局 `destroy()` 必须由应用级 owner 决定，不能成为某个消费者的 teardown 实现。

## 4. 目标 architecture

```text
main / PlayerController / ThemeController / VideoDownloadService
                         |
                         | registerAction(s) / disposer
                         v
                 ToolbarController (门面与调度中枢)
                         |
                         |-- action catalog + owner token
                         |-- state subscription ledger
                         |-- microtask invalidation & reconciliation
                         |
                         +--> ToolbarRenderers (私有 DOM 模板渲染)
                         |        |
                         |        +--> PlayerControls / Shorts / Metadata DOM
                         |        +--> PopoverEngine
                         |
                         +--> SlotMountBus (共享挂载总线)
                                  |
                                  +--> route events
                                  +--> single MutationObserver
```

模块职责如下：

- `ToolbarController`：动作贡献、状态、微任务协调与自身插槽 presentation 的唯一公共门面；
- `ToolbarRenderers`：Toolbar 内部私有渲染辅助模块，专注插槽 DOM 模板构建与 Popover 挂载，不对外导出；
- `SlotMountBus`：Toolbar 与倍速视图共享的插槽挂载 seam，只负责目标 DOM 何时可挂载；
- action contributor：声明自身动作并持有 disposer，不调用 mount、refresh 或 registry；
- `StyleEngine`、`IconRegistry`、`Locale`、`PopoverEngine`：Toolbar 的本地可替换 implementation dependency，不扩展为公共 port。

## 5. 公共类型与 interface

### 5.1 ActionContext

```typescript
export interface ActionContext {
  readonly actionId: string;
  readonly slot: string;
  readonly buttonElement: HTMLElement;
}
```

删除 `refresh()`。Toolbar 在以下事件后自动将对应 slot 标记为需要协调：

- `onClick` 同步返回或 Promise settle；
- `onStateBind` 提供的通知 callback 被调用；
- action 注册或 disposer 注销；
- `init()`、SPA 路由变更或 slot root 被替换。

### 5.2 ActionConfig

```typescript
export interface ActionConfig {
  readonly id: string;
  readonly slot: string;
  readonly titleKey: string;
  readonly defaultTitle: string;
  readonly icon:
    | string
    | Readonly<{
        readonly normal: string;
        readonly active: string;
      }>;
  readonly order?: number;
  readonly dismissOnExecute?: boolean;
  readonly isVisible?: () => boolean;
  readonly isActive?: () => boolean;
  readonly onClick: (
    event: MouseEvent,
    context: ActionContext
  ) => void | Promise<void>;
  readonly onStateBind?: (
    notifyChanged: () => void
  ) => (() => void) | void;
}
```

配置使用 `readonly`，Toolbar 在注册时保存规范化快照，不允许 caller 在注册后通过对象突变绕过 reconciliation。默认顺序、默认可见性、默认激活态与默认 dismiss 行为必须使用 [`constants.ts`](../src/ui/toolbar/constants.ts) 中的具名常量或私有具名常量，不散落魔法值。

`isVisible` 与 `isActive` 契约约定：
- 必须为同步、轻量、无副作用的纯探测函数（Pure Probes）；
- 严禁在探测函数中执行耗时 DOM 查询、触发强制重排（Reflow/Layout Thrashing）或发起网络请求；
- 探测抛错时 Toolbar 降级至安全默认值，不影响其他动作。

`onStateBind` 保持现有能力与名称。它只发布“状态可能变化”的 invalidation，不直接操作 DOM；Toolbar 重新读取 `isVisible()` 与 `isActive()` 并更新视图。

### 5.3 ToolbarController

```typescript
export class ToolbarController {
  public init(): void;
  public registerAction(action: ActionConfig): () => void;
  public registerActions(actions: readonly ActionConfig[]): () => void;
  public destroy(): void;
}

export const Toolbar: ToolbarController;
```

`registerAction()` 仅调用同一个私有 `registerBatch()`，不维护第二套规则。`mount()`、`unmount()`、`refresh()` 与 `syncSlots()` 全部变为 private，外部 feature 不再直接操纵 presentation。

## 6. 内部架构与私有数据模型

深模块的核心在于公共 interface 的极简与强信息隐藏，其物理实现应遵循清晰的单一职责划分。

### 6.1 内部物理组织 (Internal Seams)

为防止 `ToolbarController` 演化为冗长的上帝类，模块物理落位分为两部分：

1. `src/ui/toolbar/toolbar.ts`：集中管理生命周期状态、注册事务、所有权 Token、状态订阅账本、微任务调度与插槽协调。
2. `src/ui/toolbar/renderers.ts`：内部私有渲染辅助模块（不从 `index.ts` 导出），封装三类插槽的 DOM 构建、Popover 绑定与按钮更新渲染，由 `ToolbarController` 统一组装调用。

### 6.2 私有数据模型

在 `ToolbarController` 内部维护以下数据模型：

```typescript
interface ToolbarActionRecord {
  readonly owner: symbol;
  readonly sequence: number;
  readonly config: Readonly<ActionConfig>;
  stateDisposer: (() => void) | null;
  stateBindingStatus: "unbound" | "bound" | "unavailable";
  isExecuting: boolean;
  executionTimer: ReturnType<typeof setTimeout> | null;
}

interface ToolbarActionRegistration {
  readonly owner: symbol;
  readonly actionIds: readonly string[];
  readonly affectedSlots: ReadonlySet<string>;
  disposed: boolean;
}
```

`ToolbarController` 私有持有：

- `actionsById`：动作 ID 到 normalized record 的索引；
- `registrationsByOwner`：批量注册 ownership 与清理状态；
- `nextRegistrationSequence`：稳定排序的具名序列来源；
- `pendingSlotInvalidations`：同一轮需要协调的 slot 集合；
- `invalidationScheduled`：单一微任务合并标记；
- `lifecycleGeneration`：使 destroy 前排队的 callback 自动失效；
- `isInitialized` 与 presentation 资源句柄。

以上均为 Toolbar implementation detail。测试通过正式 interface 与 DOM 可观察结果验证，不为这些 Map 或 record 创建公共 getter。

## 7. 注册事务

### 7.1 验证阶段

`registerActions()` 在任何 mutation 前完整验证：

- 数组中不存在重复 ID；
- ID 为有效非空值；
- slot 属于 Toolbar 支持的 slot 集合；
- 当前 active catalog 不存在同名动作；
- callback 与可选状态函数满足运行时最低要求。

任一验证失败均同步抛错，catalog、订阅、DOM 和 slot 状态保持原样。

### 7.2 提交阶段

1. 创建唯一 owner token（`Symbol()`）与 registration sequence；
2. 复制并规范化整批 `ActionConfig`；
3. 原子写入 `actionsById` 与 registration record；
4. Toolbar 已初始化时，为本批动作建立状态订阅；
5. 对受影响 slot 去重并请求一次 reconciliation；
6. 返回绑定 owner token 的幂等 disposer。

初始化前注册只保存定义，不访问 DOM，也不建立状态订阅。`init()` 时统一绑定并完成首次 reconciliation。

同 order 动作按隐藏的 registration sequence 稳定排序，保持注册先后语义，不依赖 Map 或运行时排序稳定性的隐式行为。

### 7.3 状态订阅建立失败

单个 `onStateBind` 抛错时：

- 记录 action-local diagnostic；
- 将该 record 标记为 `unavailable`；
- 继续建立其他动作的订阅并渲染静态 action；
- 不让一个状态源阻断整个 Toolbar；
- 只在下一次 `init()` 或该 action 重新注册时重试绑定，避免无界重试。

首次 `isVisible()` 或 `isActive()` 读取失败时使用安全默认值：动作保持可见、激活态为 false。存在 last-known state 时沿用上一次成功结果。

## 8. Disposer Ownership 与释放语义

注册返回的 disposer 必须满足：

1. 首次调用时将 registration 标记为 disposed，使晚到状态 callback 立即失效；
2. 只移除 owner token 匹配的 action records；
3. 逆序释放本批 action 的状态订阅；
4. 清空本 registration 的 ownership 记录；
5. 对受影响 slot 去重并触发一次 reconciliation；
6. 重复调用为幂等 no-op，不重复解绑、不重复删除、不重复刷新。

Owner token 防止以下 stale disposer 场景：

1. action A 注册 ID `loop`；
2. A 的 disposer 释放该动作；
3. action B 随后重新注册同一 ID；
4. 再次调用 A 的旧 disposer 不得删除 B。

### 8.1 异常隔离与尽力释放 (Best-effort Teardown)

在执行 Disposer 期间：
- 逐项解绑状态 Disposer，每个 Disposer 调用必须包裹在独立的 `try...catch` 中；
- 单项解绑抛错记录 `console.error` 诊断日志，严禁向外抛出异常；
- 确保所有属于该 registration 的状态订阅、动作记录与 slot 刷新路径均被完全执行；
- 坚决杜绝因局部清理异常导致上层调用者的级联清理中断。

## 9. 状态失效与局部 reconciliation

### 9.1 状态 binding

每个 active action 在一次 Toolbar 初始化周期内最多建立一个 `onStateBind` subscription，与 action record 而非按钮 DOM 绑定：

- DOM 重绘不重复订阅；
- action 当前不可见时仍能收到状态通知并重新出现；
- slot root 被宿主替换时只重建 presentation；
- `destroy()` 解除订阅，后续 `init()` 从保留的 action definitions 重新绑定；
- disposer 删除 definition，并释放当前 subscription。

### 9.2 invalidation 合并

状态通知只将该 action 对应 slot 加入 `pendingSlotInvalidations`。Toolbar 使用单个 microtask 合并同一轮重复通知：

- 每个受影响 slot 最多 reconcile 一次；
- 不扫描未受影响 slot；
- 不使用 `setInterval`、递归 timeout 或常驻任务；
- callback 校验当前 `lifecycleGeneration`；若在微任务执行前 Toolbar 已 destroy 或重新初始化，排队 callback 自动失效；
- 过滤已注销动作的悬挂通知，保证无副作用。

### 9.3 slot reconciliation

对一个 slot 的协调顺序：

1. **路由适用性前置判定**：读取该 slot 的 `SlotDefinition.isApplicable`。若当前 `window.location.href` 与该 slot 不匹配（例如在微任务排队期间发生了 SPA 路由切换），立即卸载该 slot 的已有 DOM 并通知 `SlotMountBus.unmountSlot(slot)`，结束该 slot 的本轮协调，坚决杜绝在非适用路由下实例化孤儿 DOM；
2. 读取该 slot 的 action records；
3. 安全求值 `isVisible()`；
4. 按 order 与 registration sequence 稳定排序；
5. 没有可见动作时，销毁该 slot presentation 并调用 `SlotMountBus.unmountSlot(slot)`；
6. 存在可见动作时，通过 `SlotMountBus.mountSlot()` 或 `refreshSlot()` 建立或刷新 slot root；
7. 由 `ToolbarRenderers` 读取 `isActive()`、解析图标和标题并创建 DOM；
8. 播放器工具箱 Popover 只在 player-controls slot presentation 存在时持有。

DOM 暂缺是 `SlotMountBus` 的正常 pending 状态，不是 action 注册失败。renderer 的单 slot 异常被隔离并记录；action definition 保留，后续状态通知或路由 reconciliation 可重试。

## 10. 动作执行语义与看门狗自愈

Toolbar 为每个 action 安装统一执行 wrapper，内置并发防重入互斥锁、超时看门狗与异常隔离：

```typescript
const executeAction = async (
  action: ToolbarActionRecord,
  event: MouseEvent,
  context: ActionContext
): Promise<void> => {
  if (action.isExecuting) {
    return;
  }
  action.isExecuting = true;

  // 启动安全看门狗定时器，防止 onClick 返回挂起永不 resolve 的 Promise 导致按钮永久死锁
  const releaseLock = (): void => {
    if (action.executionTimer !== null) {
      clearTimeout(action.executionTimer);
      action.executionTimer = null;
    }
    action.isExecuting = false;
    invalidateSlot(action.config.slot);
  };

  action.executionTimer = setTimeout(() => {
    console.warn(`[ToolbarController] Action "${action.config.id}" execution timed out, releasing lock.`);
    releaseLock();
  }, TOOLBAR_CONSTANTS.ACTION_EXECUTION_TIMEOUT_MS);

  try {
    const result: void | Promise<void> = action.config.onClick(event, context);
    if (action.config.dismissOnExecute) {
      closeOwnedPopover();
    }
    await result;
  } catch (error: unknown) {
    console.error(`[ToolbarController] Error executing action "${action.config.id}":`, error);
  } finally {
    releaseLock();
  }
};
```

关键保障：

- `isExecuting` 互斥锁拦截同一动作执行期间的高频重复点击，保护 Shorts 与元数据栏等无遮罩动作；
- **看门狗兜底（Safety Timeout）**：通过 `TOOLBAR_CONSTANTS.ACTION_EXECUTION_TIMEOUT_MS`（常量定义为 5000ms）兜底。若业务 Promise 挂起，看门狗强制释放互斥锁并恢复可点击态，彻底消除按钮僵死隐患；
- `dismissOnExecute` 在动作发起后立即收起 Popover，不阻塞远程/异步耗时操作；
- 所有的同步抛错与 Promise rejection 均在内部记录并隔离，不逃逸到原生事件监听器。

## 11. Toolbar 生命周期

### 11.1 init

1. 校验当前 host；
2. 若已初始化，仅请求现有 slot reconciliation；
3. 推进 lifecycle generation 并标记 initialized；
4. 注入 Toolbar 样式；
5. 确保 `SlotMountBus` 导航绑定已建立；
6. 为全部已注册动作建立每 action 一次的状态订阅；
7. 对三个 Toolbar-owned slot 执行一次 reconciliation。

初始化前已注册的 action 在此时统一生效。任一状态订阅失败按第 7.3 节 action-local 隔离，不阻断其他动作。

### 11.2 destroy

`destroy()` 负责撤销 Toolbar 所有的 DOM 展示层、Popover 实例及状态监听：

确定性顺序如下：

1. 标记未初始化并推进 lifecycle generation，使排队 invalidation 失效；
2. 清空 pending invalidation 集合；
3. 逆序释放全部状态订阅（独立异常隔离保护）；
4. 销毁 Toolbar 持有的 Popover；
5. 分别调用 `SlotMountBus.unmountSlot()` 仅卸载三个 Toolbar 自身拥有的 slot；
6. 移除 Toolbar 自身 DOM 和样式；
7. 保留 `actionsById` 与 registration ownership，供后续 `init()` 重建。

**核心生命周期红线**：
- `destroy()` **绝对严禁调用共享 `SlotMountBus.destroy()`**，不得注销 `PlayerSpeedButtonView` 的插槽或断开全局路由监听；
- 清理流程严格遵循 **Best-effort Teardown** 原则：每一项卸载均使用独立 `try...catch` 包裹，错误记录至 `console.error`，**严禁向调用方抛出任何未捕获异常**，保证宿主清理通道通畅。

### 11.3 re-init

`destroy()` 后再次 `init()`：

- 使用保留的 action definitions 重建状态订阅；
- 根据当前路由与可见性重新申请 slot；
- 不复用旧 DOM、Popover、subscription 或 pending callback；
- registration disposer 仍保持原 owner token 与幂等语义。

## 12. Caller Ownership

外部业务特性拥有自己动作的完整注册生命周期，必须严格在自身停用时显式调用 Disposer：

### 12.1 PlayerController

`PlayerController` 保存 `Toolbar.registerActions()` 返回的 disposer，并在自身 `destroy()` 时显式释放。循环动作移除 `ctx.refresh()`，仅调用领域命令；Toolbar 通过执行 wrapper 与 `onStateBind` 自动刷新：

```typescript
this.toolbarActionsDisposer = Toolbar.registerActions([
  screenshotAction,
  pictureInPictureAction,
  loopAction
]);
```

`PlayerController.init()` 必须保持幂等，重复初始化不产生重复 action ID。

### 12.2 VideoDownloadService

继续使用现有 feature-scoped disposer：

```typescript
public static enable(): void {
  if (this.unregisterFn) {
    return;
  }
  this.unregisterFn = Toolbar.registerActions(DOWNLOAD_ACTIONS);
}

public static disable(): void {
  this.unregisterFn?.();
  this.unregisterFn = null;
}
```

三个下载 action 保持各自 ID 与 slot，不引入多 placement 数据模型。下载特性关闭时显式触发 Disposer，从 Toolbar 目录中彻底注销自身定义。

### 12.3 ThemeController

`ThemeController.init()` 保存单项注册 disposer 并以已有 disposer 作为幂等 guard，避免严格重复 ID 校验下重复注册。主题动作与脚本生命周期一致。

### 12.4 main bootstrap

设置动作属于脚本级 contribution，由 bootstrap 注册一次并持续到页面脚本生命周期结束。bootstrap 不调用内部 mount/refresh；`Toolbar.init()` 统一建立 presentation。

## 13. 文件落位

| 文件 | 目标职责 |
| --- | --- |
| `src/ui/toolbar/toolbar.ts` | 核心深模块门面，统管 action catalog、registration transaction、state ledger、微任务 invalidation 与 slot reconciliation 调度。 |
| `src/ui/toolbar/renderers.ts` | 内部私有渲染辅助模块（不对外导出），封装播放器控制网格、Shorts 按钮与元数据外框的 DOM 模板构建与 Popover 绑定。 |
| `src/ui/toolbar/types.ts` | 将 action 配置设为 readonly，移除 `ActionContext.refresh`，明确纯函数探针与异步 `onClick` 契约。 |
| `src/ui/toolbar/constants.ts` | 收敛默认顺序、默认状态、看门狗超时时间（`ACTION_EXECUTION_TIMEOUT_MS`）及具名常量。 |
| `src/ui/toolbar/action-registry.ts` | 迁移完成后逐一删除；不保留别名或等价 registry。 |
| `src/ui/toolbar/index.ts` | 移除 `ActionRegistry` export，仅保留 Toolbar public types 与 controller facade。 |
| `src/features/player/controller.ts` | 保存 action disposer，移除手动 `ctx.refresh()`，在 destroy 时释放。 |
| `src/features/theme/theme-controller.ts` | 使 action 注册幂等并明确脚本级 ownership。 |
| `src/features/download/index.ts` | 复用现有 feature-scoped disposer，适配 readonly batch。 |
| `src/main.ts` | 保持设置 action 为 bootstrap contribution，不调用 presentation interface。 |
| `src/ui/toolbar/__tests__/toolbar-actions.test.ts` | action 注册、状态、排序、disposer、并发防重、看门狗自愈与错误隔离单元测试。 |
| `src/ui/toolbar/__tests__/toolbar-actions.integration.test.ts` | Toolbar、SlotMountBus、Popover、微任务跨路由竞态与 DOM 生命周期联合测试。 |

> **删除规范**：`action-registry.ts` 的删除遵循项目规范逐一删除，严禁批量删除。

## 14. 迁移阶段

### 阶段一：建立 interface tests

- 通过 `ToolbarController` public interface 锁定注册、渲染、状态刷新和 cleanup 行为；
- 覆盖初始化前注册与初始化后注册；
- 为重复 ID、批量原子性、stale disposer 和 destroy/re-init 建立测试；
- 使用 fake `SlotMountBus` 或 jsdom 可观察结果，不测试私有 Map。

完成条件：删除或绕过 ownership、binding 或 slot cleanup 时测试能够失败。

### 阶段二：抽离内部私有渲染器并内聚动作目录

- 新建私有模块 `src/ui/toolbar/renderers.ts`，迁入模板构建与更新逻辑；
- 将 actions Map、bindings Map、按 slot 查询、排序迁入 `ToolbarController`；
- 引入 owner token、registration record 与 sequence；
- 让单项注册委托批量 transaction；
- 保持 production caller interface 可编译。

完成条件：Toolbar 不再依赖 `ActionRegistry`，内部渲染职责分离清晰。

### 阶段三：收拢状态订阅与失效

- 将 `onStateBind` 从 render-time binding 改为每 action、每 Toolbar 初始化周期一次；
- 建立受影响 slot 的微任务合并；
- 为 state callback 增加 owner/generation gate；
- 在 click wrapper 的 `finally` 自动 invalidation，并增加超时看门狗；
- 删除 `ActionContext.refresh` 与调用方手动刷新。

完成条件：DOM 重绘不增加 subscription 数量，不可见动作可由状态通知重新出现，异步挂起自动超时自愈。

### 阶段四：收窄 Toolbar public surface

- 将 `syncSlots()`、`mount()`、`unmount()` 与 `refresh()` 转为 private；
- 统一三个 slot 的 reconciliation；
- `destroy()` 改为逐一卸载 Toolbar-owned slot，执行 Best-effort 隔离清理；
- 保留 definitions，释放 presentation 与状态 subscription。

完成条件：外部 caller 只使用 `init/registerAction/registerActions/destroy`。

### 阶段五：迁移 caller ownership

- `PlayerController` 保存并释放批量 action disposer；
- 循环动作删除 `ctx.refresh()`；
- `ThemeController.init()` 增加 action registration guard；
- `VideoDownloadService` 保持 feature enable/disable disposer 闭环；
- 设置动作保持 bootstrap lifetime ownership。

完成条件：所有具有可结束生命周期的 contributor 都有明确 disposer owner。

### 阶段六：清理浅模块

- 从 barrel export 移除 `ActionRegistry`；
- 逐一删除 `src/ui/toolbar/action-registry.ts`；
- 清除 import、过渡 alias、兼容 facade 与测试专用 production export；
- 更新相关架构文档与 `CONTEXT.md` 中 `ToolbarController` 定义。

完成条件：仓库不存在 `ActionRegistry` 或功能等价的重命名 registry。

### 阶段七：集成验证

- 执行 Vitest、严格类型检查与生产构建；
- 验证普通详情页、Shorts、元数据栏的动作注册与注销；
- 验证 Toolbar destroy/re-init 不影响倍速 slot；
- 验证全部 pending slot 就绪后 Observer 停机。

## 15. 测试方案

### 15.1 注册与 ownership

- 初始化前注册不访问 DOM，`init()` 后一次性渲染；
- 初始化后注册只 reconcile 受影响 slot；
- `registerAction()` 与 `registerActions()` 使用同一 transaction；
- 批内重复 ID 与跨 registration 冲突均为零 mutation；
- batch 中任一配置无效时不产生部分注册；
- disposer 幂等；
- 旧 disposer 不删除后来注册的同名 action；
- 同 order 动作按 registration sequence 稳定排序。

### 15.2 状态订阅与渲染

- 每个 action 每次 Toolbar 初始化只建立一个 subscription；
- DOM rerender 与 SPA root replacement 不增加 subscription 数量；
- 不可见 action 的状态通知可使其出现；
- `isActive()` 变化更新 class 与 active icon；
- 高频同步通知在一个 microtask 内只刷新受影响 slot 一次；
- 微任务调度期间路由发生变化时，非适用 slot 自动跳过或卸载，不实例化孤儿 DOM；
- 注销后排队 callback 因 owner/generation gate 失效；
- `isVisible()`、`isActive()` 或 `onStateBind` 抛错时其他 action 正常工作；
- state disposer 抛错时其余 subscription 与 DOM 仍完成 cleanup。

### 15.3 动作执行与看门狗

- 同步 action 完成后自动刷新对应 slot；
- Promise action settle 后自动刷新；
- 异步动作执行中连续点击被防重互斥锁拦截，零重复调用，执行完毕后释放锁并刷新；
- 异步动作 Promise 挂起超时后，看门狗自动释放互斥锁并恢复可交互性；
- 同步异常与 Promise rejection 被记录，不逃逸 DOM event listener；
- `dismissOnExecute` 在动作成功发起后立即关闭 Popover；
- 一个 action 失败不阻断同 slot 其他 action；
- caller 不再依赖 `ActionContext.refresh`。

### 15.4 Toolbar 与 SlotMountBus 集成

- 三类 slot 均遵守同一 registration/disposal 语义；
- 最后一个可见 action 消失时对应 slot 卸载；
- action 再次可见时通过 `SlotMountBus` 恢复；
- DOM 暂缺时只进入共享 pending 集合，不新增 Observer；
- 所有 pending slot 就绪后 fake `MutationObserver` 活跃数归零；
- 预先注册并挂载倍速 slot，调用 `Toolbar.destroy()` 后该 slot 仍保留在 `SlotMountBus`；
- `destroy()` 清理 Toolbar-owned DOM、Popover、样式、subscription 与 pending callback；
- `destroy()` 后再次 `init()` 从保留 definitions 重建且不复用旧资源。

## 16. 删除测试与 depth 验收

### 16.1 ActionRegistry

删除 `ActionRegistry` 后，其存储、过滤、排序与 binding 逻辑内聚到唯一 caller `ToolbarController`，复杂度不会向外部其他业务模块扩散，因此它不具备独立 module depth，应被折叠。

### 16.2 ToolbarController

若删除深化后的 `ToolbarController`，以下规则会扩散到 `main.ts`、播放器、主题和下载 feature：

- 重复 ID 与批量事务；
- action ownership 与 stale disposer；
- 稳定排序与状态读取；
- state subscription 与 invalidation 微任务合并；
- DOM renderer 与 active icon；
- slot eligibility、mount/unmount 与 Popover 调度；
- destroy/re-init 与共享总线 ownership。

因此 `ToolbarController` 通过删除测试：较小 public interface 隐藏了明显更大的 implementation 与跨调用方规则。

### 16.3 SlotMountBus

`SlotMountBus` 同时服务 Toolbar 与倍速视图，并隐藏 SPA 路由、pending slot、单一 Observer 与停机协议。删除它会使挂载规则重新分散到多个 caller，因此继续保持独立 deep module。

## 17. 验收矩阵

| 维度 | 场景 | 通过标准 |
| --- | --- | --- |
| **interface** | 扫描外部 Toolbar caller | 只使用 `init/registerAction/registerActions/destroy` |
| **atomicity** | 批内或跨批 ID 冲突 | 同步报错且 catalog、DOM、subscription 零变化 |
| **ownership** | disposer 重复或晚到 | 只清理所属 registration，不影响新 owner |
| **state binding** | 多次 rerender | 每 action 每初始化周期最多一个 subscription |
| **invalidation** | 同步连续状态通知 | 单微任务、单受影响 slot reconciliation |
| **route race** | 微任务调度期间路由变更 | 自动跳过或卸载非适用 slot，无孤儿 DOM 节点残留 |
| **concurrency guard** | 异步 action 执行中连续触发 | 互斥锁拦截重复点击，执行完毕后释放并刷新 |
| **watchdog recovery** | 异步 action 永远挂起超时 | 超时看门狗自动释放互斥锁并恢复可点击态 |
| **action error** | 同步异常或 Promise rejection | 错误被隔离，Popover 与状态刷新语义完整 |
| **destroy** | Toolbar 销毁 | 清理自身资源并保留 action definitions，绝不向外抛出未捕获异常 |
| **re-init** | destroy 后 init | 从 definitions 重建，无旧 DOM、listener 或 callback |
| **shared bus** | 倍速 slot 与 Toolbar 并存 | Toolbar destroy 不注销倍速 slot 或销毁总线 |
| **ADR-0005** | 全部 slot 已挂载 | 活跃 `MutationObserver` 数量为零 |
| **deletion test** | 删除浅层 registry | 逻辑内聚进 Toolbar，内部渲染职责分离清晰 |
| **type safety** | `pnpm check` | TypeScript strict 零错误 |
| **tests** | `pnpm test` | action 与集成测试全部通过 |
| **build** | `pnpm build` | Userscript 生产构建成功 |

## 18. 交付验收命令

```bash
pnpm test
pnpm check
pnpm build
```

生产构建通过后，在 Tampermonkey 或 Violentmonkey 中执行：

1. 普通详情页验证设置、主题、截图、画中画、循环与下载动作；
2. Shorts 页面验证下载动作挂载、执行与路由重建；
3. 详情页元数据栏验证下载动作动态启停；
4. 循环状态切换后验证图标和 active class 自动刷新；
5. 调用 Toolbar destroy/re-init 路径，确认 action 恢复且倍速 slot 不受影响；
6. 反复启用、关闭下载 feature，确认 disposer 幂等且无幽灵按钮；
7. 检查空闲时无活跃 `MutationObserver` 或 pending invalidation。

## 19. 完成定义

满足以下条件时，本架构深化完成：

- `ActionRegistry` 已逐一删除，且不存在等价的 registry、store 或 repository 替代物；
- `ToolbarController` 私有拥有 action catalog、registration ownership、state ledger 与 slot reconciliation；
- 内部私有渲染辅助模块 `renderers.ts` 独立承载 DOM 模板构建，主类保持纯净门面；
- public interface 只保留 `init/registerAction/registerActions/destroy`；
- `ActionContext.refresh` 已移除，状态变化和 action 执行由 Toolbar 自动 invalidation；
- 批量注册原子、重复 ID 明确失败、disposer 幂等且具备 stale-owner 防护；
- 状态订阅不随 DOM rerender 重复建立；
- slot reconciliation 具备路由适用性前置判定，微任务调度具备跨路由竞态防护；
- action 执行具备异步并发防重入互斥锁与看门狗超时自愈保护；
- `destroy()` 遵循 Best-effort Teardown 原则释放自身资源，严禁向外抛错，且不调用 `SlotMountBus.destroy()`；
- `SlotMountBus` 继续满足 ADR-0005 的单 Observer 与挂载即停机约束；
- 各 action contributor 的 disposer ownership 明确；
- 不引入多 placement、公共 action storage port 或测试专用 production seam；
- `pnpm test`、`pnpm check` 与 `pnpm build` 全部通过。
