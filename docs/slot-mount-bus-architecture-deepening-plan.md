# SlotMountBus 插槽就绪与生命周期架构深化方案

> 状态：已实施。第 2 节的摩擦分析基于提交 `8e6b7ed` 时的代码快照；其余章节描述的即为当前生效的契约。

## 1. 目标与适用范围

本方案深化 [SlotMountBus](../src/ui/toolbar/slot-mount-bus.ts)，让工具栏与倍速视图通过同一 interface 获得插槽注册、当前路由定位、延迟挂载、宿主迁移与确定性释放能力。观察目标、重试预算、路由代次和清理顺序集中在总线 implementation 内，调用方只负责展示内容与插入位置。

覆盖现有四项注册：播放器工具箱、播放器倍速按钮、Shorts 动作栏、详情页元数据栏。播放器工具箱与倍速按钮共享播放器容器，仍由各自特性独立启停。

本方案沿用以下约束：

- [ADR-0005：统一多插槽挂载总线](adr/0005-unified-slot-mount-bus.md)规定的单一聚合 observer、导航驱动和就绪即停机。
- [ADR-0004：响应式 DOM 句柄缓存](adr/0004-reactive-dom-registry-caching.md)规定的播放器句柄统一获取与失效检查。
- [ADR-0006：播放器能力解耦](adr/0006-decoupling-player-shortcuts-by-capability.md)规定的独立特性生命周期。
- [工具栏动作生命周期方案](toolbar-action-lifecycle-architecture-deepening-plan.md)中的动作注册、订阅与 ownership。
- [倍速特性生命周期方案](player-speed-feature-lifecycle-architecture-deepening-plan.md)中的启用回滚、禁用释放与跨路由注册保留。

实施范围为沙箱内挂载总线、两个调用方的插槽声明与渲染定位，以及核心注册表的播放器容器限定查询。Popover 内容、动作执行、PlayerController 媒体能力与 Tabview 页面端协议维持各自职责。本轮交付为设计与实施方案。

## 2. 当前实现与具体摩擦

以下结论基于提交 `8e6b7ed` 的源码与既有测试，属于静态分析；交叉时序故障尚需测试复现。

| 位置 | 当前行为 | 需要集中解决的知识 |
| --- | --- | --- |
| `SlotMountBus.startObserver()` | 使用固定选择器，并可回退到 `document.body` 的 `subtree: true` 观察 | `containerSelector` 与实际观察范围脱节；宽范围突变唤醒所有 pending 插槽 |
| `refreshAll()`、`tryMountSingleSlot()`、`processPendingSlots()` | 分别实现挂载判断；pending 回调未重新检查路由适用性 | 同一插槽由不同入口触发时，结果与清理规则不一致 |
| `processPendingSlots()` | 目标存在时，即使 renderer 返回 `null`，也会删除 pending | “可以找到目标”被等同于“已完成挂载” |
| `refreshAll()`、`tryMountSingleSlot()` | 全局查找 `targetSelector`；同 ID 元素只要已连接就直接成功 | 目标归属、当前宿主和注册节点身份缺少联合校验 |
| `stopObserver()` | 断开观察、清除定时器，同时清空 pending | 暂停等待会丢失未完成状态，状态查询不能解释超时后的注册 |
| `ToolbarController.reconcileSlot()` | 路由不适用时调用 `unmountSlot()` 注销注册 | Toolbar 与总线重复掌握路由规则；返回原路由时，总线可能已失去恢复所需的注册 |
| `ToolbarRenderers.createPlayerControlsElement()` | 自行全局查找播放器与已存在展示元素 | 总线即使选中正确目标，renderer 仍可能将配套弹层放进另一个宿主 |
| `destroy()` | 移除两个导航监听，但未显式移除尚未触发的 `DOMContentLoaded` 监听 | 销毁后的迟到事件仍可能重新进入总线 |

相关源码：[总线](../src/ui/toolbar/slot-mount-bus.ts)、[插槽契约](../src/ui/toolbar/types.ts)、[工具栏调用方](../src/ui/toolbar/toolbar.ts)、[倍速视图](../src/features/player/speed-button-view.ts)。

## 3. 深化方向

### 3.1 保留 SlotMountBus 作为共享 deep module

采用一个总线拥有多个局部观察目标的设计。MutationObserver 实例数与观察目标数分别管理：同一个实例可以观察播放器、元数据或 Shorts 的局部节点，实例上限仍为一个。

所有触发来源进入统一协调流程，三个公开刷新入口不再各自包含挂载判断。路由与观察都是总线内部知识，caller 不传递代次、不管理 observer，也不负责重试。

删除测试支持保留总线：删除它会把路由、等待和释放规则散回 ToolbarController 与 PlayerSpeedButtonView。应收敛的是总线内部重复的协调路径，使这两类 caller 获得更多 leverage，并让验证具有 locality。

### 3.2 module 职责

| module / adapter | 负责内容 |
| --- | --- |
| SlotMountBus | 注册记录、路由适用性、容器与目标解析、挂载身份、等待预算、单 observer 调度、失败隔离、释放 |
| ToolbarController | 按动作可见性决定是否保留注册，提供 renderer、插入位置和展示资源清理 |
| PlayerSpeedButtonView | 倍速展示、菜单与状态订阅，提供 renderer、插入位置和展示资源清理 |
| ReactiveDOMRegistry | 提供播放器容器句柄、限定作用域查询及既有缓存失效能力 |

生产环境的 DOM 与测试环境的 jsdom/fake observer 构成可替换的内部 seam。沿用现有测试设施，不为选择器、定时器或每个插槽增加独立公开 port。

## 4. 对外契约

### 4.1 保留现有调用入口

| 入口 | 目标语义 |
| --- | --- |
| `mountSlot(definition, renderer)` | 建立或更新该 key 的注册，并立即进行一次同步协调；返回当前挂载的 `HTMLElement`，暂不适用或尚未就绪时返回 `null` |
| `unmountSlot(slotKey)` | 撤销该注册，释放其展示资源，使该记录的排队工作失效 |
| `refreshSlot(slotKey)` | 对已有注册重新协调，返回当前挂载的 `HTMLElement` 或 `null`；可在观察预算耗尽后发起新的限时等待 |
| `refreshAll()` | 根据当前路由重新协调所有注册；保留原有同步可观察行为 |
| `hasSlot(slotKey)` | 只表示注册是否存在，不代表当前 DOM 已挂载 |
| `isSlotPending(slotKey)` | 表示当前路由适用但挂载尚未完成；观察暂停或超时后仍可为 `true` |
| `bindNavigation()` | 幂等绑定生命周期事件；注册入口自动保证绑定，已有调用保持兼容 |
| `destroy()` | 全量终止总线当前生命周期并释放资源；允许之后通过正常入口重新启用 |

同一 key 的注册拥有唯一当前记录。相同 definition 与 renderer 的重复调用只协调现有记录；声明变化时，先使旧记录失效并释放旧展示，再建立新记录。旧批次通过记录身份判断失效，不能挂载或清理后来替换的记录。

两个单项入口通过返回当前展示节点提供直接结果，caller 无需组合 `hasSlot` 与 `isSlotPending` 推断是否可刷新展示。既有忽略返回值的调用可以继续使用；类型声明同步更新。

### 4.2 SlotDefinition 的职责

继续使用 `slotKey`、`containerSelector`、`targetSelector`、`elementId`、`isApplicable`、`mount` 和 `unmount`，为不可变配置显式声明 `readonly`。

- `containerSelector` 定义物理作用域，参与实际容器解析；不得只作为说明字段保留。
- `targetSelector` 仅在选中的容器内求值，不能回退到全局同名目标。
- `elementId` 用于 DOM 标识。总线通过记录中的节点引用确认 ownership，不以全局同 ID 节点代替当前记录。
- `mount` 同步完成具体放置规则。工具栏与倍速按钮保持相邻顺序；Shorts 元素仍位于导航按钮之后；元数据元素位于对应动作容器内。
- `unmount` 幂等释放该插槽的展示资源。它不撤销动作定义或停用底层播放能力。

总线验证挂载元素已连接、位于当前物理容器中，并记录本次目标。由于 Shorts 使用兄弟节点插入，不能统一要求 `target.contains(element)`；具体相对位置由 mount adapter 保证，并通过对应集成测试验证。

### 4.3 renderer 获得已解析的挂载上下文

将 renderer 契约收敛为 `(context: SlotMountContext) => HTMLElement | null`；`SlotMountContext` 只包含只读的 `container: HTMLElement` 和 `target: HTMLElement`。由总线在二者均有效时传入，不包含 observer、路由代次或待办状态。

renderer 使用该 context 放置配套弹层，创建或复用自己持有的展示资源。它不再全局重新选择宿主，也不通过同 ID 元素推断 ownership。现有不需要上下文的 renderer 可以忽略入参。

这样，容器归属在总线中判断一次，按钮与配套 Popover 使用同一宿主；复杂度不会在 DOM 挂载和展示创建两个位置重复出现。

## 5. 注册、展示与等待状态

### 5.1 三类展示状态

| 状态 | 注册存在 | 含义 | 是否 pending |
| --- | --- | --- | --- |
| `inactive` | 是 | 当前路由不适用，展示已释放 | 否 |
| `pending` | 是 | 当前路由适用，容器、目标或展示尚未就绪 | 是 |
| `mounted` | 是 | 当前记录的元素已挂载到当前容器与目标 | 否 |

显式注销后记录不存在。观察器是否活跃属于等待调度状态，不引入与展示状态混用的“已完成”标记。

pending 记录可以处于主动等待、预算耗尽后的等待或错误后的暂停。后两者均保留恢复所需的注册，但不会自行安排循环重试。

### 5.2 记录内容

每个内部记录持有 definition、renderer、唯一身份、展示状态、当前容器／目标／展示节点引用以及恢复所需的最小等待信息。只要发现引用断连、容器归属变化或记录失效，就释放相应资源与引用。

这些记录属于 implementation，不增加供测试读取 Map、代次或状态机内部字段的 getter。

### 5.3 暂停展示与撤销注册

- 路由暂不适用：释放展示、移出主动等待、转为 inactive，保留注册。
- 动作全部不可见、特性禁用或 caller 销毁：调用 `unmountSlot()` 撤销其注册。
- 观察预算耗尽：断开当前等待观察并释放观察目标引用，保留 pending 注册。
- 总线销毁：使所有工作失效，撤销所有注册，移除全部事件监听。

ToolbarController 销毁只撤销自身三个插槽。倍速注册继续由 PlayerSpeedFeature／PlayerSpeedButtonView 拥有。

## 6. 容器定位与局部发现

### 6.1 确定当前容器

一次协调中先解析当前 URL 与适用的页面容器，再解析各插槽的物理容器。

| 插槽 | 物理容器 | 目标查找 |
| --- | --- | --- |
| 播放器工具箱、倍速按钮 | 通过 ReactiveDOMRegistry 获取限定在当前页面或活跃迷你播放器内的播放器，并检查连接状态和声明匹配 | 在该容器内查找右侧控制区 |
| Shorts 动作栏 | 当前路由的已连接 Shorts 容器 | 在该容器内查找导航按钮 |
| 元数据动作栏 | 当前详情页中的原生元数据容器 | 在该容器内查找既有动作目标 |

保持现有路由适用规则：播放器插槽适用于 Shorts 以外页面，Shorts 插槽适用于 Shorts，元数据插槽适用于详情页。存在可用迷你播放器时继续使用核心注册表返回的播放器句柄。

为支持已连接旧页面并存的情况，给既有 `getPlayerContainer()` 增加可选的 `scope: HTMLElement` 参数：提供 scope 时，只返回位于该 scope 内、或 scope 自身匹配的播放器；未命中返回 `null`，不回退到其他页面。无参数调用保持既有行为与缓存快速路径。

有 scope 的查询在复用缓存前验证归属；限定查询结果不能覆盖无作用域调用的缓存。总线每批次按物理作用域复用查询结果，工具箱与倍速不重复查找同一播放器。该改动只增强容器定位，不改变视频等待、媒体事件或其他缓存的生命周期。

选择页面容器时排除明确标记为隐藏或不活跃的保留页面。不能仅用 `isConnected` 判定页面归属，也不以读取布局尺寸判定可用性。

原生元数据定位须兼容 Tabview 对原节点的迁移，并避开简介镜像中的同名节点。具体页面标记与选择器在实施前通过真实 DOM 核对，随后收敛到 constants 与 DOM fixture；这是容器定位的验证步骤，不能用全局首个匹配作为验收替代。

### 6.2 两阶段发现

**阶段一：物理容器就绪。**

直接解析目标。若目标暂缺，对该物理容器建立 `childList: true` 的局部观察；子树监听仅覆盖这一业务容器，不提升至全站内容树。

**阶段二：物理容器暂缺。**

在限时观察窗口内，选择当前已连接、可证明归属的发现根：

- 详情页：当前 `ytd-watch-flexy`，用于发现播放器或原生元数据容器。
- Shorts：当前 `ytd-shorts`，用于发现动作目标。
- 已存在的播放器外部宿主或迷你播放器：只使用该局部宿主。
- 页面容器本身尚未出现：若 `#page-manager` 已存在，只观察其直接子节点，`subtree: false`，用于发现路由页面容器。

发现物理容器后，在同一协调批次中立即收缩观察范围。详情页发现根的较宽子树观察只服务尚未发现容器的插槽，并受同一时间预算约束。

发现根表作为总线内部的有限定位策略；不能由 caller 任意传入祖先搜索或无限回退链。`document`、`document.body`、`document.documentElement` 和通用 `#content` 均不属于观察目标。

若以上根全部缺失，保持 pending，依靠 `DOMContentLoaded`、导航事件、`yt-page-data-updated` 或显式刷新重新解析，不启动空转定时器。页面根已经插入后更深的容器出现，交由该页面的局部发现阶段处理。

### 6.3 多目标聚合与替换

根据当前主动等待的注册，计算观察根集合；相同节点去重，相同节点所需选项取并集，保留 root 到相关插槽的内部映射。祖先 subtree 根与后代目标并存时，同一突变可能向 observer 重复投递记录；总线接受重复投递，由同一批次“每个 dirty slot 最多协调一次”的去重规则消化，不追求根集合最小化。根集合吸收等分发优化仅在实测出现可度量开销时引入，不属于本轮交付内容。

观察目标集合发生变化时，使用同一个 observer 完成断开与重新绑定。调整前保留受影响 slot 的 dirty 标记，重新绑定后仅对这些 slot 做一次状态复核，覆盖换绑期间可能遗漏的变化。

等待中的物理容器被整体替换时，本窗口不重定位，总线不通过观察容器父节点识别替换。预算到期停机后保留 pending，旧引用在下一次导航、页面数据事件（`yt-page-data-updated`）或显式刷新触发的协调中释放并重定位。

全部等待结束后不继续监测已挂载宿主。此时的宿主替换同样依靠上述恢复时机惰性修复；该行为是就绪即停机约束下的明确恢复边界。

## 7. 统一协调与代次隔离

### 7.1 每个插槽的固定处理顺序

1. 确认总线生命周期、路由快照和记录身份仍有效。
2. 读取当前 URL 并检查 `isApplicable`；不适用时释放展示，保留 inactive 注册。
3. 解析当前容器与目标，仅在所属容器中查询。
4. 校验记录中的已挂载元素、容器和目标身份；仍有效时直接复用。
5. 若旧宿主失效或目标变化，先释放旧展示，再进入 pending。
6. 容器或目标缺失时，记录等待需求，结束该插槽本次协调。
7. 将当前 container 与 target 作为 context 调用 renderer；返回 `null` 时保留 pending，不能记录为 mounted。
8. renderer 完成后再次核对记录身份、当前 URL、容器与目标连接状态，随后执行 mount。
9. 检查挂载结果并提交 mounted 记录；失败时清理本次展示资源。
10. 全批次处理结束后，统一更新观察目标与等待预算。

挂载前后检查记录身份，防止 renderer、mount 或 cleanup 回调同步注销、替换注册或触发路由变化后，本次调用继续提交旧结果。

### 7.2 触发入口

注册、单项刷新、全量刷新、导航与页面数据事件执行同一协调核心。公开入口仍提供同步初次尝试；MutationObserver 回调只标记相关 pending 插槽，并在一个微任务中合并处理。

同一批次每个 dirty slot 最多协调一次。mounted 且宿主有效的插槽不因其他容器的突变重复调用 renderer。

### 7.3 生命周期令牌

总线使用内部生命周期令牌、路由代次和当前观察批次身份隔离旧工作。排队的 observer 微任务与超时回调都捕获其归属，执行前验证。

- 路由事件使旧观察批次失效，依据当前页面重新协调。
- URL 在正式导航事件前已变化时，公开入口和突变批次也必须按新 URL 失效旧路由快照；不能只检查 pathname 是否仍适用。
- 同一导航的 `yt-page-type-changed` 与 `yt-navigate-finish` 可以重复触发协调，但已挂载且归属有效的节点不重复创建。
- 相同 URL 的重复事件不延长正在运行的观察截止时间；新 URL 或明确的新一轮恢复才建立新预算。
- `unmountSlot()`、注册替换与 `destroy()` 使其旧记录或生命周期令牌失效。
- 旧微任务不能清空新批次的 dirty 集合，旧超时不能关闭后来建立的观察窗口。

### 7.4 自触发与重入

总线的 DOM 写入不能持续激活自身观察。协调期间记录自身展示节点；突变回调只将影响容器、目标就绪或有效宿主的外部变化纳入 dirty 集合。

renderer 返回 `null` 或挂载失败时，不通过再次入队自己来重试。无新外部事件时，微任务数量必须收敛。

若调整观察目标需要 `disconnect()`，先归并已取得的外部 records，完成同步协调与换绑后复核受影响插槽。不能盲目丢弃其他插槽的外部变化，也不能依赖一个只在同步栈中生效的布尔锁抑制异步 MutationObserver 回调。

## 8. 等待预算与失败语义

### 8.1 限时观察

沿用 [TOOLBAR_CONSTANTS.MOUNT_SAFETY_TIMEOUT_MS](../src/ui/toolbar/constants.ts) 的现有预算，当前为 4000 ms。implementation 只引用具名常量。

一次等待窗口最多拥有一个 timer：

- 首次存在可观察的 pending 目标时开始计时。
- 普通突变、观察根收缩和新插槽加入已有窗口都不重置截止时间。
- 全部挂载、全部不适用或全部撤销时立即清除 observer 与 timer。
- 到期时断开观察、取消本窗口排队工作，保留 pending 注册。
- 后续导航、`yt-page-data-updated` 页面数据事件或显式刷新先静态尝试，仍未就绪时才建立新的等待窗口。

超过预算才出现的节点不会自动被发现，直到出现下一次明确唤醒事件（导航、`yt-page-data-updated` 或显式刷新）。没有合法发现根时同样依靠事件恢复。验收需记录这一恢复时机，不能同时宣称停机后仍能持续发现任意 DOM 变化。

### 8.2 异常隔离与启用回滚

| 场景 | 处理结果 |
| --- | --- |
| 容器或目标缺失 | 正常 pending，按合法观察根等待 |
| renderer 返回 `null` | 正常 pending；保持窗口原截止时间 |
| 新注册的同步初次 renderer／mount 抛错 | 清理该次已创建资源并撤销失败的新记录，再向 caller 抛错，使 PlayerSpeedFeature 的既有启用回滚生效 |
| 已注册插槽在导航、刷新或突变处理中抛错 | 清理局部展示，保留注册并暂停本窗口内该插槽的自动重试；继续处理其他插槽 |
| mount 返回但元素未连接到当前物理容器 | 按挂载失败处理，不能提交 mounted |
| `unmount` 抛错 | 记录错误，继续移除总线拥有的展示节点、清理记录与其他插槽 |
| 回调中同步撤销或替换注册 | 当前提交失效，只清理自己创建的资源，保留新记录 |

注册替换失败时不恢复已经释放的旧展示资源。清理新记录并报告失败；调用方可通过后续明确注册恢复。不能承诺对任意 DOM 回调提供无法实现的完整事务回滚。

cleanup 根据节点与记录 ownership 执行，不用全局 ID 删除可能属于新记录的元素。caller 的清理回调只清理其持有的资源引用。

## 9. 调用方接入

### 9.1 ToolbarController

`reconcileSlot()` 专注可见动作：

1. 无可见动作时撤销该 slot 注册并释放其展示。
2. 存在可见动作时保留或更新注册，由总线判断路由适用性与物理就绪。
3. 仅当总线返回有效展示节点时刷新内容；返回 `null` 时结束展示操作，不在 inactive 路由中构造孤立展示节点。

路由适用性保留在 SlotDefinition，Toolbar 不再因为离开页面而丢弃仍有可见动作的注册。这样，首次在 Watch 注册的 Shorts 动作，以及 Watch → Shorts → Watch 往返，都可通过总线恢复。

Toolbar 的微任务协调循环对每个 slot 的 reconcile 做独立异常隔离：本契约下 `mountSlot()` 初次注册的同步 renderer／mount 抛错会向 caller 传播，Toolbar 必须逐 slot 捕获并记录，保证一项插槽的异常不中断同批其余插槽的协调，也不逃逸出微任务调度。

Toolbar 的动作注册 disposer、状态订阅和批量动作事务保持既有契约。`destroy()` 只撤销自身插槽。

Toolbar 持有本次 renderer 创建的配套弹层、网格与提示节点引用。ToolbarRenderers 通过这些引用及挂载 context 创建或刷新展示；其全局播放器查找、全局同 ID 复用与清理改为记录所属资源操作。已经有效的 mounted 插槽更新动作内容时刷新现有视图，不要求总线重新调用 renderer。

### 9.2 PlayerSpeedButtonView

继续在特性启用时注册、禁用时注销。跨路由 inactive 只清理按钮、菜单、Popover 和展示订阅，保留特性注册状态；回到适用页面后由总线调用 renderer 重建。

保留现有倍速按钮与工具箱相邻顺序，以及悬停时的 Popover 宿主校验。该校验承担用户交互时的局部修复，不增加独立 observer 或导航监听。

初次渲染时使用总线传入的挂载 context 创建菜单。交互时继续从自己已挂载的按钮确定宿主，保证配套菜单与按钮属于同一播放器。

### 9.3 事件释放

对 `yt-navigate-finish`、`yt-page-type-changed`、`yt-page-data-updated` 和尚未触发的 `DOMContentLoaded` 均持有可移除的监听引用。总线全量销毁及最后一项注册撤销后释放其等待工作与事件绑定；后续注册自动重新绑定。

空总线即使被显式 `bindNavigation()` 调用，也只绑定上述事件入口，不创建 observer 或 timer；`destroy()` 始终能够全部解除。

## 10. 实施拆分与文件落位

| 阶段 | 文件 | 内容与完成条件 |
| --- | --- | --- |
| A：行为证据 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` | 按本方案目标契约（而非当前实现）从公开入口覆盖局部目标、pending 语义、路由失效、清理和等待预算；先于实施编写并确认其失败，作为后续阶段的验收基准 |
| B：状态收敛 | `src/ui/toolbar/slot-mount-bus.ts`、`types.ts` | 统一协调、记录身份、展示状态与资源释放；公开同步尝试契约保持可观察 |
| C1：容器作用域 | `src/ui/toolbar/slot-mount-bus.ts`、`constants.ts`、`src/core/dom-registry.ts` | 实现播放器限定查询、容器内目标查找、单 observer 多目标（同节点去重与选项并集、变化时换绑）与固定截止时间 |
| C2：两阶段发现 | `src/ui/toolbar/slot-mount-bus.ts`、`constants.ts` | 实现发现根表、`#page-manager` 直接子节点观察与发现物理容器后的观察范围收缩 |
| D：调用方适配 | `src/ui/toolbar/toolbar.ts`、`renderers.ts`、`src/features/player/speed-button-view.ts` | Toolbar 保留跨路由注册并实现微任务协调的逐插槽异常隔离，renderer 使用挂载 context；刷新与清理基于资源 ownership |
| E：集成验证 | 工具栏与播放器现有 `__tests__` | 覆盖真实插入关系、跨路由恢复、独立启停及初次挂载异常回滚 |

新增选择器、事件名、观察选项与调度常量收敛到对应 `constants.ts`。播放器核心选择器沿用 ReactiveDOMRegistry；不在业务调用方新增 `document.querySelector('video')` 或复制核心播放器解析规则。

测试 fixture 常量放在测试文件的具名常量或现有测试辅助位置。TypeScript 新增与修改的变量、参数和返回值均显式标注类型，保持严格模式。

保留现有集成测试，补强其可观察断言；不因总线内部结构变化删除仍保护特性生命周期的测试，也不新增仅复刻私有实现的测试。

## 11. 自动化验收矩阵

测试通过正式注册／刷新／注销入口、DOM 结果与 fake observer 的观察目标验证行为，不读取私有 Map。

| 类别 | 输入场景 | 可观察结果 |
| --- | --- | --- |
| 静态直达 | 容器与目标注册前均存在 | 同步挂载成功，无等待 observer／timer |
| 局部目标 | 多个容器包含同名目标 | 元素只进入该 definition 所属容器 |
| 挂载上下文 | 另一个播放器先于当前播放器存在 | renderer 获得当前容器，按钮与配套弹层均进入同一正确宿主 |
| 保留页面 | 旧页面仍连接，新页面成为当前页 | 旧页面同名目标不获得新展示 |
| 延迟目标 | 容器已存在，之后插入目标 | 局部观察完成挂载，最后一项完成即停机 |
| 延迟容器 | 当前路由根存在，之后插入物理容器 | 从路由根发现后收缩到物理容器，沿用原截止时间 |
| 延迟页面 | 只有 page-manager 存在，之后插入页面容器 | page-manager 仅直接子节点观察；识别后进入路由局部发现 |
| 根全部缺失 | 注册时没有合法发现根 | 保留 pending，observer／timer 为零；后续就绪或导航事件可恢复 |
| 多插槽 | 工具箱、倍速与元数据同时等待 | 总线最多一个活跃 observer；共享根去重；就绪插槽不重复渲染 |
| 重复投递 | 祖先 subtree 根与后代目标同时观察，同一突变命中两者 | 重复记录不产生重复协调，同一 dirty slot 每批次仅处理一次 |
| 部分注销 | 两项等待时注销其中一项 | 其注册与资源消失，另一项继续等待 |
| 目标替换 | 等待窗口内宿主被替换 | 本窗口不重定位；预算到期停机并保留 pending，下一次恢复事件重定位并释放旧引用 |
| 挂载复用 | 连续刷新，目标与元素均有效 | 元素身份保持，不重复绑定展示订阅 |
| 宿主变更 | 已挂载旧元素仍连接，刷新时目标已变化 | 释放旧展示，只在当前目标完成一次挂载 |
| 兄弟插入 | Shorts 导航按钮后挂载动作栏 | 正确挂载，不因元素不是目标子节点而反复重建 |
| renderer 暂缺 | renderer 首次返回 `null` | pending 保留；新外部就绪事件可再次尝试 |
| 路由竞态 | 突变排队后 URL 改变，导航通知稍后到达 | 旧批次失效，新路由不产生不适用展示 |
| 同类页面导航 | Watch A → Watch B | 旧 URL 批次失效；归属有效的复用宿主可保留 |
| 导航重复 | 同一 URL 的两类导航通知 | 有效展示不重复创建，正在运行的预算不延期 |
| 超时 | 预算内目标始终缺失 | observer／timer 归零，`hasSlot` 与 `isSlotPending` 均为 true |
| 超时恢复 | 到期后目标出现，再显式刷新或 `yt-page-data-updated` 唤醒 | 静态挂载成功并清除 pending，新一轮等待窗口独立计时 |
| 旧超时 | 新窗口开启后执行旧窗口回调 | 新窗口继续有效 |
| 自触发 | mount 写 DOM，另一项 renderer 返回 `null` | 无自维持微任务链；外部相关变化仍可驱动等待项 |
| 回调重入 | renderer／mount 中注销或替换当前 key | 旧记录不提交，不影响替换后的记录 |
| 初次失败 | 新注册的同步挂载抛错 | 失败记录与局部资源撤销，特性启用回滚可收到异常 |
| 局部异常 | 一项延迟挂载或 cleanup 抛错 | 其他插槽完成协调与释放 |
| 确定性销毁 | DOMContentLoaded、突变或微任务尚未完成时销毁 | 迟到事件不挂载、不复活观察器、不改变新生命周期 |

### 11.1 caller 集成测试

补充或增强以下文件：

- `src/core/__tests__/dom-registry.test.ts`：播放器限定查询、旧页面并存、scope 自身匹配、未命中返回 null，以及无参数缓存行为保持。
- [toolbar-actions.integration.test.ts](../src/ui/toolbar/__tests__/toolbar-actions.integration.test.ts)：实际 DOM 的 Watch → Shorts → Watch 往返、首次在不适用路由注册、动作可见性变化、工具栏销毁时倍速保留。
- [speed-feature.integration.test.ts](../src/features/player/__tests__/speed-feature.integration.test.ts)：同时断言注册意图和按钮实际位置，验证延迟控件、禁用后迟到突变及重新启用。
- [speed-popover-hover.test.ts](../src/features/player/__tests__/speed-popover-hover.test.ts)：保留悬停宿主修复与按钮／工具箱顺序保护。
- [speed-feature.test.ts](../src/features/player/__tests__/speed-feature.test.ts)：确保总线初次同步挂载失败仍能触发现有特性回滚。

### 11.2 测试设施的真实边界

[FakeMutationObserver](../src/test/fake-observers.ts) 可以记录观察目标、选项和活跃实例，并手动触发回调；它不会自动模拟浏览器的 DOM 突变投递，`takeRecords()` 当前也不维护真实队列。

因此：

- 使用显式 `type: "childList"`、target 和 added／removed nodes 构造记录，分别验证正常批次与故意迟到的回调。
- 验证观察目标去重时，保存 disconnect 前的快照；其 `observedTargets` 会在 disconnect 时清空。
- 使用 fake timers 验证截止时间与取消，避免真实等待。
- 在总线专用测试中显式追踪 document 的四类生命周期事件添加／移除；当前全局 listener tracker 主要覆盖 window，不能据此证明 document 监听已释放。
- 自触发、真实 MutationObserver 批处理与 Custom Elements 挂载顺序，通过实际浏览器补足；fake observer 测试不能替代这部分验收。

## 12. 性能与端到端验收

### 12.1 可测性能约束

| 状态 | SlotMountBus 自身资源要求 |
| --- | --- |
| 有局部等待目标 | 最多一个活跃 MutationObserver、一个截止 timer |
| 全部 mounted 或 inactive | observer、timer 和排队重试均为零 |
| 等待超时或无合法发现根 | observer 与 timer 为零，保留注册记录 |
| 总线销毁 | 记录、目标引用、监听器、timer 和有效排队工作全部释放 |

普通突变批次只协调受影响的 pending 插槽；单次路由协调遍历注册集合一次。具体 DOM 查找成本取决于所选局部根大小，不承诺所有选择器操作为常数时间。

性能指标仅针对本总线拥有的资源；其他 module 可以按自身职责持有 observer，不能据全站实例数判断本方案达标。

### 12.2 实施阶段检查命令

```powershell
pnpm check
pnpm exec vitest run src/core/__tests__/dom-registry.test.ts src/ui/toolbar/__tests__/slot-mount-bus.test.ts src/ui/toolbar/__tests__/toolbar-actions.integration.test.ts src/features/player/__tests__/speed-feature.integration.test.ts src/features/player/__tests__/speed-popover-hover.test.ts src/features/player/__tests__/speed-feature.test.ts
pnpm build
```

这些命令为实施阶段验收要求，尚不表示已经执行或通过。

将构建产物载入 Tampermonkey／Violentmonkey，在 YouTube 桌面端完成：

1. 普通详情页、启用 Tabview 的详情页和 Shorts 页面，核对真实容器标记、观察目标和插入位置。
2. Watch → Shorts → Watch、Watch A → Watch B、返回首页且迷你播放器存在时，核对注册保留和展示归属。
3. 延迟加载控制区或元数据，核对发现根收缩、预算到期停机与事件恢复。
4. 独立启停倍速和工具栏动作，确认没有重复按钮、旧 Popover 或多余订阅。
5. 在 Performance／观察器计数中核对等待与挂载完成两个阶段，确认闲置时没有总线产生的周期性执行。

## 13. 完成标准

本方案实施完成时，caller 只需理解注册意图、renderer 与放置规则；路由适用性、物理容器归属、pending 恢复、观察预算和迟到任务失效均由 SlotMountBus 提供一致保障。

交付应同时具备：通过的定向测试与类型检查、成功的生产构建、真实 YouTube 验证记录，以及对局部发现和停机后恢复时机的准确说明。实施完成时在 [ADR-0005](adr/0005-unified-slot-mount-bus.md) 补充“单 observer 多目标作用域观察与有限发现根表”的观察目标策略；文档同步只描述最终契约。
