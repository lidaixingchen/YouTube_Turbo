# FeatureRegistry 状态转换与跨标签页同步架构深化方案

## 1. 目标与范围

深化 [FeatureRegistry](../src/registry/feature-registry.ts)，将初始化、本地设置、远程存储通知与显式刷新收敛到同一套状态转换规则。调用方提交功能开关意图、读取状态与订阅变化；registry 负责持久化接入、生命周期顺序、异步结果归属和失败呈现。

本方案保留现有功能 ID、默认值、`functionState` 存储键及布尔字典格式，保留静态门面、描述符排序与 SettingsModalView 的视图职责。播放器倍速、截图、画中画和循环继续遵守 [ADR-0006](adr/0006-decoupling-player-shortcuts-by-capability.md) 的独立特性边界。

实施范围包括 registry、存储能力识别、设置面板状态反馈、描述符端点的完成与清理契约、类型与对应测试。端点整改覆盖播放器特性、Toolbar 资源释放，以及 Tabview 的异步装配、页面端清理结果和会话结束顺序。各 feature 负责自身资源的装配和释放；Tabview 的完成回执与 Polymer 生命周期由其领域模块管理，registry 只消费描述符的操作结果。

本方案细化 [特性注册表与设置视图方案](feature-registry-and-tabview-relocator-architecture-deepening-plan.md)的无头核心职责，并更新 [核心运行时性能方案](core-runtime-and-player-performance-deepening-plan.md)中缓存刷新和跨标签页同步的契约。涉及这些主题的实施约定以本方案为准；既有方案中的播放器、样式和 DOM 模块设计保持其各自职责。

## 2. 当前实现与可验证差距

基准提交为 `a43080a`。下表描述源码事实及可推导的时序风险，具体交错行为由实施阶段的可控 Promise 测试复现。

| 位置 | 当前行为 | 状态转换差距 |
| --- | --- | --- |
| `setEnabled()` | 先保存配置，再直接 await setup／teardown | 同一功能的连续切换可以同时进入生命周期 |
| 本地切换异常处理 | 将操作开始前的整份 `prevStates` 写回存储 | 等待期间其他功能或标签页的新配置可能被覆盖 |
| `saveStoredStates()` | 先替换内存，再调用 StorageUtil 写入 | 写入同步抛错时，内存可能已经显示新值 |
| `initAll()` | 顺序 await 启用功能，最后设置 `isInitialized` | 初始化期间配置更新只改变缓存，已经启动的功能可能漏掉关闭；重复初始化会再次 setup |
| 存储 listener | 每次远程通知直接启动异步 handler | 多次 handler、本地切换和初始化之间没有共同的执行顺序 |
| `handleRemoteStateChange()` | 合并新旧字典，再按配置差异调用生命周期 | 配置差异不能代表本页实际状态；删除字段会被旧值保留 |
| 远程／初始化错误 | 记录日志后继续 | 调用方无法区分已保存配置与本页应用失败 |
| `register()` | 直接覆盖同 ID 描述符 | 异步生命周期执行中替换描述符可能使启停使用不同资源拥有者 |
| SettingsModalView | checkbox 回调 await 切换后直接更新附加字段 | 缺少错误捕获、远程更新订阅和晚完成结果的视图归属 |
| StorageUtil | 缺少 GM API 时读取默认值、写入静默返回 | 调用返回不能单独证明设置已经持久化 |
| 播放器特性工厂与倍速特性 | 清理异常只记录日志；部分失败后内部启用标记已关闭，后续 disable 可以直接返回 | registry 再次清理时可能得到成功结果，残留资源却仍然存在 |
| Toolbar 与 Tabview 页面协调器 | 多处释放异常被吞掉，部分资源句柄随之清空 | 上层无法确认资源释放结果，也无法可靠继续部分失败清理 |
| Tabview ready 回调 | 先清除 READY 超时，再注入样式并 resolve；会话通知层隔离回调异常 | ready 后处理抛错时，setup Promise 可能长期 pending，阻塞后续初始化 |
| Tabview 会话关闭 | close 发送后关闭通道，页面端清理通过通知触发 | 通道关闭本身不能证明页面端资源已经释放 |

相关源码：[registry](../src/registry/feature-registry.ts)、[描述符](../src/registry/descriptors.ts)、[类型](../src/types/index.ts)、[设置面板](../src/registry/settings-view.ts)、[存储封装](../src/core/storage.ts)、[启动入口](../src/main.ts)。

当前 [registry 测试](../src/registry/__tests__/feature-registry.test.ts)覆盖缓存、本地写入、一次远程通知及 setup 失败回滚，缺少受控的生命周期交错。测试沿用 singleton，`invalidateCache()` 也没有清除描述符、初始化状态或 listener，后续需要建立独立的测试实例生命周期。

## 3. 模块深化与职责

### 3.1 保留一个状态与生命周期深模块

FeatureRegistry 继续作为 deep module。内部收敛“接纳目标—保存配置—调和运行状态—发布结果”的完整规则，不将本地、远程和初始化分别实现为公开协调服务。

| 参与者 | 拥有的职责 | 对外接缝 |
| --- | --- | --- |
| FeatureRegistry | 配置快照、逐功能执行状态、初始化进度、状态订阅 | 提交开关、读取状态、订阅变化 |
| StorageUtil | GM 能力识别、读写和变更通知适配 | 同步读写、listener 注册与移除 |
| FeatureDescriptor | 一个功能的装配和释放 | setup／teardown 的完成及失败契约 |
| SettingsModalView | 开关、进度、错误与附加字段呈现 | registry 的只读状态和操作结果 |
| main | 基础控制器启动、特性注册、开始初始化 | 保留现有启动顺序 |

**depth** 来自 interface 对顺序、结果与错误的统一保证；**locality** 来自异步归属和配置发布集中在 registry；**leverage** 来自全部描述符共用同一套时序测试。StorageUtil 是已有 adapter，描述符回调和存储接入是可替换 seam，不引入仅供一种实现使用的通用事件总线或任务调度框架。

删除测试支持保留 registry：移除它会把持久化规则、异步互斥和失败状态散回启动入口与设置视图。内部执行记录使用私有类型和方法即可，不需要让调用方管理队列、revision 或 Promise 链。

### 3.2 区分配置与本页运行事实

每个已注册功能拥有以下概念，持久化仍只保存配置布尔值。

| 概念 | 含义 | 更新依据 |
| --- | --- | --- |
| 目标配置 `enabled` | 当前已接纳的用户开关选择 | 本地存储写入成功、会话模式提交或存储刷新 |
| 已应用状态 `applied` | 本页生命周期最后确认的实际状态 | setup／teardown 成功，或成功的失败清理 |
| 运行阶段 `runtime` | 等待初始化、启用中、已启用、停用中、已停用、失败、等待刷新 | 当前执行进度和结果 |
| 错误 `error` | 本页未能完成的操作及原因分类 | 存储、装配、释放或清理失败 |

`applied` 使用 `boolean | null`。初始为 false；true 表示 setup 已成功；false 表示尚未装配或已确定释放；null 表示部分副作用的清理无法确认。不能在 teardown 失败后将其写为 false。

内部运行记录使用判别联合类型表达等待资格、装配、释放、失败清理和已结束阶段，由单一映射生成公开快照，并通过 `never` 检查转换分支的穷尽性。`applied` 在操作期间保留上次确认值，调用方必须结合 runtime 判断是否稳定；失败清理期间对外显示 stopping，并将错误标为暂不可重试。清理结束后才确定可恢复错误或 `reload-required`。存储错误独立于运行阶段，不能把本页已正常运行的功能仅因写入失败改成运行失败。

`isEnabled()` 与 `getAllStates()` 继续返回目标配置，稳定读取走内存。需要判断本页是否已经启用的调用方读取状态快照，不将这两个兼容查询改为返回运行状态。

当前核心调用点集中在 main 与 SettingsModalView。方案不以旧文档中的高频调用举例代替当前调用图，也不要求业务控制器新增对 registry 的反向依赖。

## 4. 对外 interface

### 4.1 保留入口，补充只读状态订阅

保留现有注册、查询、切换、初始化与打开设置的门面。新增的公开能力聚焦状态观察：

```typescript
export type FeatureRuntimeStatus =
  | "idle"
  | "starting"
  | "enabled"
  | "stopping"
  | "disabled"
  | "error"
  | "reload-required";

export type FeatureFailureStage = "storage" | "setup" | "teardown" | "cleanup";

export interface FeatureFailure {
  readonly stage: FeatureFailureStage;
  readonly retryable: boolean;
}

export interface FeatureStateSnapshot {
  readonly id: string;
  readonly enabled: boolean;
  readonly applied: boolean | null;
  readonly runtime: FeatureRuntimeStatus;
  readonly error: FeatureFailure | null;
  readonly persistence: "persistent" | "session";
}

export type FeatureStateListener = (state: FeatureStateSnapshot) => void;

export interface FeatureStateAccess {
  getState(id: string): FeatureStateSnapshot;
  subscribe(listener: FeatureStateListener): () => void;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}
```

以上是 interface 轮廓，不要求实现新增 `FeatureStateAccess` 服务。类型放在 registry 自己的类型文件并由现有 barrel 导出；描述符结构继续位于公共类型文件。

订阅立即交付各已注册功能的初始快照，随后按变化交付。快照及嵌套错误对象不可修改内部记录；取消订阅幂等。单个 listener 抛错被隔离，不能中断状态提交、其他 listener 或生命周期。

`persistence: persistent` 表示本环境具备所用 GM 读写能力，不表示跨标签页事务或磁盘落盘确认。错误详情使用 `unknown` 在内部保留并记录诊断，面板通过错误分类选择国际化文案。

### 4.2 setEnabled 的完成语义

| 情况 | 返回与执行约定 |
| --- | --- |
| 初始化尚未开始 | 接纳并保存配置后 resolve；生命周期由 initAll 启动 |
| 初始化已开始，但该功能尚未轮到 | 保存配置并等待该功能获得初始化执行资格 |
| 当前目标已在本页成功应用 | resolve，不重复写入和执行 hook |
| 相同目标正在执行 | 加入同一操作结果，不额外 setup／teardown |
| 当前目标处于可恢复错误 | 相同值调用表示显式重试，只启动一次新尝试 |
| 新目标替代了旧目标 | 旧请求以类型化的 `superseded` 原因结束；新请求等待自己的结果 |
| 存储调用抛错 | reject；本次未写入的目标不被接纳，成功读取的基础快照仍按外部配置事实处理 |
| 生命周期失败 | 必要的失败清理结束后 reject，并在快照呈现最终失败；已保存目标配置继续保留 |
| 运行资源状态无法确认 | 返回需要刷新恢复的类型化错误，停止继续装配 |
| 缺少 teardown 且功能已经启用 | 保存关闭配置，进入 `reload-required`；resolve 表示配置已接受，应用留待刷新 |

“相同目标正在执行”指目标版本没有变化时的重复提交，覆盖 hook 及其必要的失败清理阶段。目标经过其他值再回到当前 hook 的方向时属于新请求：hook 成功可以满足这个最新目标；hook 失败且清理成功时，若新请求尚未获得自己的尝试，则允许为它执行一次新尝试。

目标版本在最终接纳的布尔值变化时推进，每个目标版本自动提供一次尝试资格。显式同值重试在可恢复错误已经确定后分配新的尝试标识；执行中的同值请求共享该尝试，不重复分配。目标版本与尝试标识分别负责配置归属和执行归属，失败及重复远程通知不会自行产生尝试资格。

保留 `Promise<void>` 签名。类型化操作错误至少区分 `superseded`、未知 ID、存储失败、生命周期失败与需要刷新；这些是操作结果分类，不全部转成用户告警。内部以判别联合结果区分配置已接受、目标已应用、等待刷新、被替代与失败，再统一映射为兼容 Promise。resolve 的含义按上表判断，不能一律解释为本页已经生效；面板始终根据订阅快照呈现当前状态。被替代的请求立即结束，其原有 hook 和必要清理仍由执行器持有并收尾。

只对已注册 ID 接受状态写入。`getState()` 对未知 ID 明确报错；兼容的 `isEnabled()` 保留现有未知 ID 读取规则。未知布尔存储字段可以保留，但不会驱动生命周期。

### 4.3 注册和初始化边界

注册阶段允许补充描述符。相同描述符对象的重复注册可幂等返回；同 ID 的不同描述符明确报错。`registerAll()` 先检查整批 ID 和已有注册，再统一接纳，避免冲突时留下半批注册。

第一次有效 `initAll()` 开始后冻结描述符集合。当前 main 已在 initAll 之前完成 registerAll，符合这一约定。动态加载 feature 需要独立扩展注册契约，本方案交付稳定的静态特性集合。

并发及重复 `initAll()` 共享同一初始化工作和结果，只绑定一次存储监听。站点守卫未通过时不消耗初始化机会；正常浏览器仍遵守现有宿主范围，核心测试可使用 Node 环境或受控宿主。

首次存储读取失败属于 registry 启动失败：不执行任何 feature，移除本次已注册的 listener，清除本次失败的初始化工作引用并向调用方报错，允许后续显式 initAll 重试。main 捕获并记录启动错误，避免未处理拒绝；设置视图读取初始快照也捕获存储错误，显示载入失败及重试入口，重试成功后再装配功能行。功能自身 setup 失败则按逐项容错处理，不重启整个 registry。

## 5. 统一转换机制

### 5.1 同步接纳输入，逐功能执行生命周期

初始化、远程通知、本地写入、显式刷新都进入 registry 内部同一提交边界。边界内准备候选配置、完成所需存储操作并选定最终可接纳快照，随后同步替换全部目标记录、更新请求归属及待调和标记。基础快照和待写候选值不作为中间目标发布，也不消耗目标版本或尝试资格。hook 的完成结果也通过该边界更新运行记录，保持订阅发布与后续调和的顺序一致。

每个 feature 拥有一个私有执行记录：最新目标版本、当前尝试标识、当前 hook、已应用状态、初始化资格和等待该目标结果的请求。每个记录最多执行一个 hook。未开始的中间目标可以合并为最新值；已开始的 hook 必须等到完成或失败后才能执行下一步。

本地写入的同步读写与内存发布组成一个短临界段，不等待生命周期。提交期间仅记录待调和功能，退出最外层提交边界后才通知订阅者和安排一次调和微任务；该任务按届时最新的已提交目标执行 hook。同步重入的存储通知、订阅者操作和 hook 内提交都排到当前发布结束后按序处理。连续输入共享尚未执行的调和任务，空闲时不自行续排。仅省略 await 不构成此保证，任何接纳或发布过程都不得同步启动新 hook。

不同已获得初始化资格的功能独立推进。共享 PlayerController、Toolbar 等基础控制器仍在 main 中先初始化，feature 的 teardown 只释放自己拥有的能力。

### 5.2 核心不变量

1. 同一 feature 的 setup、teardown 和失败清理严格串行。
2. 生命周期比较基准是 `applied`，不是上一份配置字典。
3. 一个 hook 成功后必须记录实际效果，即使其目标版本已经过期；随后再向最新目标推进。
4. 过期操作不得替换最新目标、清除新请求错误或写回共享存储。
5. 失败只结束对应尝试，执行记录能够继续接纳后续请求；不保留永久 rejected 的队列尾 Promise。
6. 重复远程通知或无变化刷新不产生新的重试机会。
7. 操作完成、失败或被替代后及时释放等待者；空闲执行器不产生 timer、轮询或自续微任务。
8. 新 hook 只在提交边界和同步发布结束后的调和阶段启动，单次本地提交的基础值与候选值不触发生命周期或请求替代。
9. setup 失败后的尝试结果包含必要的清理结果；成功清理才能确认 applied=false，清理失败或无法确认则锁定 applied=null。
10. 描述符的全部受控成功、失败和关闭路径都结束其 Promise；等待超时只提供失败事实，资源可否继续使用由清理结果决定。

目标版本只用于本 registry 内的请求归属判断。它不写入存储，也不表示多个标签页之间的全局版本号。

### 5.3 初始化与切换共用执行器

保留 `getAllDescriptors()` 的排序和逐项初始化顺序。持久化模式先建立存储监听，再读取初始化快照；即使初始化前查询已经建立缓存，此处仍重新读取，覆盖监听建立前的变化。会话模式沿用已接纳的会话目标。每轮接纳的是完整的规范化配置快照。

初始化按顺序为每个功能开放执行资格，并等待该功能首个生命周期尝试结束。首个 setup 成功即结束该首次尝试；setup 失败时，必须等待同一尝试中的必要清理结束，确定 applied=false 或 applied=null 后才开放下一功能的资格。目标为关闭且资源尚未装配时直接确认 disabled。执行资格开放时读取最新目标，不使用循环开始前捕获的旧字典。

已经获得资格的功能即使初始化尚未全部结束，也能响应后续本地和远程变化。首个 setup 期间收到关闭：等待 setup 结束、记下 applied=true，再由同一执行器 teardown。初始化可以继续处理下一功能，本功能的后续调和继续独立推进。

首个尝试及其必要清理结束后记录功能错误并继续下一项，保留当前启动容错。`initAll()` 完成表示各功能的首次初始化检查／尝试已结束，包括失败清理结果已经确定；不表示全部功能健康，也不等待不断到来的后续设置请求或显式重试。已经获得资格的其他功能在此期间仍独立响应设置变化，状态与进度由订阅表达。

描述符必须满足第 7 节的完成契约：同步异常、异步拒绝、装配期关闭以及外部就绪等待超时都具有结束路径。领域模块为其外部就绪和清理回执等待提供有界等待，并在结束操作时清理定时器和使晚到回调失效。若资源释放或异步活动停止无法确认，该功能以资源未知结束并等待刷新。registry 不通过通用超时假定 hook 已停止，也不启动相反 hook 来解除等待；挂起 Promise 属于端点契约验收失败。

### 5.4 关键交错的确定结果

| 交错 | 必须得到的行为 |
| --- | --- |
| setup 开始后收到关闭 | setup 与 teardown 不重叠；setup 成功后执行 teardown，最终 disabled |
| 启用—关闭—启用，setup 仍未结束 | 中间关闭请求以 superseded 结束；setup 成功且最新目标为开启时直接收敛，不重复装配 |
| teardown 开始后收到开启 | 等 teardown 成功再 setup；不能忽略 teardown 的真实完成 |
| 初始化已启动 A，远程关闭 A | A 的执行器接纳关闭；不受全局初始化尚未结束限制 |
| 初始化尚未轮到 B，远程关闭 B | 轮到 B 时读取最新目标，跳过 setup |
| A setup 失败，同时 B 配置已变化 | A 发布本页错误；B 的配置、生命周期和持久化结果保持有效 |
| 旧 setup 失败，最新目标已经关闭 | 清理成功后确认 disabled；旧错误结束旧请求，不将最新关闭请求标为失败 |
| 旧 setup 失败且清理也失败 | applied=null，阻止继续装配；最新目标仍显示，但需要刷新恢复 |
| 基础快照为开启，本次提交关闭且 applied=false | 成功提交后只接纳关闭目标，不启动中间 setup；原有同目标等待者不因基础快照被替代 |
| 首个 setup 失败，清理仍在进行 | 本功能显示清理中且暂不可重试；下一功能尚未获得初始化资格，已有资格的功能继续推进 |
| ready 后处理抛错或清理回执超时 | 对应 Promise 结束为失败，清理结果决定资源状态；晚到消息不能使失败尝试恢复为成功 |

## 6. 存储与跨标签页一致性

### 6.1 配置规范化

存储边界按 `unknown` 接收，不能仅靠 `Record<string, boolean>` 类型断言信任数据。只读取普通字典的自有字段及布尔值，数组、null、标量和错误类型按缺失处理。

已注册字段缺失或类型错误时采用描述符默认值；有效的未知布尔字段保留以兼容不同版本，但不创建执行记录。整个 key 删除或字段删除时，接纳的是“剩余字段加默认值”的完整快照，不能与旧缓存合并而复活被删除的值。

规范化本身不主动写回存储。格式修正只随用户明确的本地写入发生，避免远程通知形成写入回声。

### 6.2 本地提交顺序

持久化环境中的每次本地设置操作按以下步骤处理：

1. 校验已注册 ID，进入提交边界；读取当前可见的存储值并规范化，获得此次写入的基础快照。
2. 在局部候选快照中仅覆盖本次目标字段。该字段与基础快照相同时跳过写入，仍按最终运行记录决定等待或显式重试。
3. 需要写入时同步调用 StorageUtil；成功返回后选定候选快照。无需写入时选定基础快照。成功读取的其他 feature 配置随选定快照一并接纳。
4. 读取抛错时保留此前已接纳快照；读取成功而写入抛错时选定基础快照，保留本次实际观测到的外部配置，并记录存储错误。未成功写入的本次目标不进入生命周期。
5. 一次性提交选定快照与结果，退出边界后发布订阅并安排调和。每个功能只根据最终目标更新版本、请求归属与尝试资格；中间基础值不单独触发转换。

步骤之间不 await，步骤完成之前不启动任何新 hook。写入失败仍可能因实际读到的外部变化而调和其他功能或当前功能，其依据是基础快照，不是失败的本地目标。已有缓存不作为覆盖存储其他字段的优先来源，也不保存用于异步失败回写的整份旧快照。

一次 feature 的装配失败不能证明已保存的用户选择无效。因此 setup／teardown 失败保留目标配置，只记录本页运行错误并执行资源清理。这个契约同时适用于初始化、本地和远程来源。

### 6.3 远程通知与同步边界

远程通知作为存储刷新信号处理：从 StorageUtil 重新读取当前可见的完整值，经同一规范化和接纳函数推进状态。通知中的 oldValue／newValue 不作为待排队执行的历史命令。这样晚处理的通知不会直接重放其携带的旧目标；行为仍受管理器当前读值的可见性限制。

本 registry 的本地写入已经直接发布状态，`remote=false` 回声不重复驱动生命周期。该存储 key 的生产写入口统一属于 registry；需要修改它的其他代码通过 setEnabled 接入。

GM 读写及变更监听接口提供键值操作和跨脚本实例通知；`remote` 表示变化来自另一脚本实例。[Tampermonkey 官方文档](https://www.tampermonkey.net/documentation.php?q=GM_values)没有为这些接口声明“读取—修改—写回”的比较交换事务，本方案据此只承诺当前标签页内部的顺序与观测到配置后的调和。

多个标签页同时对同一个字典 key 做读改写，仍可能覆盖对方对不同字段的更新。写前重读缩小陈旧窗口，不能消除这一平台边界。本方案保留存储格式，不承诺跨标签页无丢失写入、全局请求顺序或有时限的同步。

当写入停止、管理器最终提供一致读值并交付通知、生命周期正常结束时，各页向该可见配置收敛。远程读取失败保留最后已接纳快照并报告同步诊断，等待下一通知、用户提交或显式刷新；不增加自动轮询。

### 6.4 环境能力与缓存刷新

StorageUtil 补充一个窄能力查询 `isPersistenceAvailable(): boolean`，同时检查实际使用的 GM_getValue 与 GM_setValue 是否存在。写入抛错仍由调用方处理，能力查询不替代错误处理，也不改动现有调用方的默认值／空操作行为。

缺少完整读写能力时 registry 使用会话模式：初次可读取的已有值作为种子，其后本地配置以会话内存为准，设置面板明确提示仅当前页面有效。此模式不注册持久化同步监听，不把 StorageUtil 默认值反复读取成配置重置。

具备读写能力但 listener 返回 null 时仍可保存设置；当前页通过本地操作与显式刷新接纳外部值，不能宣称实时跨页同步。listener 注册单独记录是否尝试过，避免把返回 null 当作反复初始化的理由。

保留 `invalidateCache(): void` 作为显式刷新门面：持久化模式下立即重新读取并接纳快照，运行中的 feature 也走共同执行器；会话模式保留当前目标。刷新失败保留已有快照并记录诊断。该方法不清空描述符、初始化结果或执行器，不作为测试实例重置入口。

首次配置读取完成后，稳定的 isEnabled／getState 查询不访问 GM；初始化建立监听后的同步读取、本地操作、外部通知与显式刷新按各自契约触发存储读取。

## 7. 失败恢复与描述符契约

### 7.1 失败结果与重试资格

| 失败位置 | 运行记录 | 恢复路径 |
| --- | --- | --- |
| 存储写入 | 接纳本次成功读到的基础快照，保留当前 applied，附加 storage 错误 | 用户再次提交；生命周期只调和已接纳配置 |
| setup 失败，有 teardown | 在同一执行器中尝试一次 teardown 清理 | 清理成功则 applied=false，可显式重试；当前关闭目标可直接收敛 |
| setup 失败，缺少 teardown | applied=null，记录无法确认的资源状态 | 刷新恢复 |
| 失败后的清理也失败 | applied=null，保留装配及清理诊断 | 刷新恢复，停止继续装配 |
| 正常 teardown 失败 | applied=null | 刷新恢复，避免在残留资源上再次 setup |
| 页面端清理失败、回执缺失或回执等待超时 | 本地释放仍执行，整体释放结果为失败，applied=null | 刷新恢复；迟到回执不能恢复普通重试资格 |
| listener 或订阅者抛错 | 隔离当前回调 | 其他功能、订阅和后续输入继续推进 |

失败重试必须来自显式同值提交，或清理成功后真正发生的目标变化。相同远程快照不触发重复重试。失败清理属于正在执行的尝试，清理完成前同值提交只等待该尝试；`applied=null` 的状态持续到页面重新初始化，普通重试按钮不得绕过它。

### 7.2 资源所有权与清理完成

可热切换的描述符必须满足以下契约：

1. setup 成功表示该功能所需的注册、监听和异步准备已经完成；返回的 Promise 覆盖这些工作。功能对后续路由的按需挂载继续由其领域模块负责。
2. 资源取得后立即进入该功能的所有权记录。内部启用标记只表示启用状态，不能替代资源记录，也不能作为部分失败后跳过 teardown 的依据。
3. teardown 首先使该次装配的后续异步回调失效，再按资源依赖顺序释放已取得资源。单项释放失败时继续尝试其他项，结束后使用 `AggregateError` 或等价的类型化聚合结果上报全部必要释放失败。
4. 只有确认释放成功才删除对应资源记录。释放状态无法确认时保留失败记录；再次调用 teardown 不得因启用标记为关闭或清理数组为空而返回成功。setup 内部已经尝试回收的资源也遵守这一规则。
5. teardown 成功表示全部已取得资源已确认释放，且本次装配的晚到回调不会再产生副作用。重复释放已经成功的资源应安全；仅记录日志不能替代失败传播。

这些保证必须贯穿描述符依赖的释放链。Toolbar 的状态订阅释放、播放器视图卸载、Tabview 页面协调器及其子资源的必要释放错误，都应传回所属 feature；registry 不检查 DOM 或猜测底层资源状态。端点内部诊断保留原始 `unknown` 错误，设置面板只接收规定的失败分类。

### 7.3 生命周期 Promise 的结束路径

每个异步端点由一次尝试持有完成处理器、会话或代次标识、资源记录及有界等待的定时器。成功、同步异常、异步拒绝、装配期关闭和外部等待超时都进入统一的完成处理，Promise 只结束一次。调用方请求被替代不影响领域端点继续收尾。

Tabview 的 ready 通知只确认页面端已就绪，沙箱仍需完成样式等本地装配。ready 回调必须显式捕获后处理异常：全部必要工作成功后才 resolve；失败时 reject 并保留可清理的资源记录。READY 等待定时器在该操作已有明确成功或失败结果时清除，不能先移除唯一的结束保障再执行可能抛错的后处理。

会话层继续隔离普通通知回调异常。负责装配、清理回执及 Promise 完成的领域处理器必须自行把异常转换为操作失败，不能依赖异常穿过通知层来 reject。装配期关闭也必须结束待定 setup；重复关闭、重复 ready 和过期会话消息不得再次完成 Promise 或修改当前尝试。

领域模块为外部就绪和清理回执分别设置单次有界等待，时限及失败代码归入 Tabview constants。超时后使本端后续回调失效，结束该次等待并执行规定的清理；只有释放已确认才允许后续装配。对端是否停止无法确认时以资源未知结束并等待刷新。定时器随对应操作完成立即释放，空闲时不保留定时任务。

### 7.4 Tabview 跨上下文清理结果

`Tabview.destroy()` 返回 `Promise<void>`，覆盖沙箱资源释放和页面端释放确认；同一会话内的重复销毁共享同一次清理工作和结果。仅关闭 RuntimeChannel 或发送 close 消息不能作为清理成功依据。

Tabview 协议增加会话内的清理请求与清理结果控制消息。消息复用当前会话的身份、方向、协议版本及序列校验，结果为“全部释放完成”或“释放失败及可序列化的失败分类”。协议类型、验证器、两端处理器与协议版本同步交付，原始 Error 对象留在产生错误的上下文记录。

清理顺序如下：

1. 沙箱阻止该次装配再处理普通业务消息，并执行本地资源释放。已开始页面注入的尝试必须取得可信的页面释放结果；尚无该会话已确认结果时，在发送清理请求前建立回执等待和单次超时。本地释放失败不阻止请求页面清理。从未开始页面注入的尝试只清理本地已取得资源。
2. 清理控制消息可在 awaiting-ready、ready 和 closing 阶段处理，不进入等待 ready 的普通业务队列。页面端在开始装配之前就建立控制消息接收能力，保证部分装配也有清理入口。
3. 页面端先使初始化与路由代次失效，再完成协调器及已取得子资源的释放。单项失败不阻止剩余清理；全部必要步骤结束后才发送成功或失败回执，正常停用时的成功结果必须包含业务资源及生命周期监听的释放确认。同一会话内重复请求共享正在进行的清理，已完成时在通道仍可用期间返回同一结果。
4. 页面端尝试发送回执后再结束传输；沙箱收到该会话的有效回执后，结合本地清理结果结束 destroy 并释放回执监听、定时器和通道。只有两端释放都成功才 resolve。
5. 发送异常、对端提前关闭、失败回执或回执等待超时都结束为清理失败。沙箱仍完成能够执行的本地释放，并保留资源未知诊断；原有 close 继续作为终止传输的边界，不被解释成页面释放完成。

setup 失败后的部分资源清理复用这一流程，包括 ready 后处理失败、注入后就绪超时及页面初始化失败。页面初始化失败时主动完成页面清理，发送同时携带装配失败分类与释放结果的控制消息，再结束传输；沙箱在当前会话仍处于装配中时接纳该消息、结束 setup，并保存释放结果供同一会话的 destroy 使用。这样页面端的提前失败也有明确的释放证据，单独的关闭通知仍表示释放结果无法确认。旧会话的迟到回执不能满足新会话的等待，也不能使已锁定的资源未知状态恢复为可装配。

### 7.5 端点整改与接入门槛

| 端点 | 必须交付的行为 |
| --- | --- |
| [播放器特性工厂](../src/features/player/feature-factory.ts)与[倍速特性](../src/features/player/speed-feature.ts) | 部分装配也登记资源；失败回收与正常停用都聚合释放结果；关闭标记不阻断残留资源清理 |
| [Toolbar](../src/ui/toolbar/toolbar.ts)与[倍速视图](../src/features/player/speed-button-view.ts) | 必要的订阅释放和视图卸载失败向所属 feature 传播，已移除注册与待释放资源的记录分别维护 |
| [Tabview 沙箱入口](../src/features/tabview/index.ts) | ready 后处理异常结束 setup；destroy 返回覆盖两端清理的 Promise；全部完成路径清除等待资源 |
| [Tabview 页面入口](../src/features/tabview/page/index.ts)与[协调器](../src/features/tabview/page/coordinator.ts) | 先使异步回调失效，再尝试全部必要清理；页面初始化失败与销毁结果可经控制消息确认 |
| [Tabview 会话](../src/features/tabview/session.ts)、[协议](../src/features/tabview/protocol.ts)与[类型](../src/features/tabview/types.ts) | 清理请求与结果具备类型验证、就绪前可达性、会话归属与幂等完成，传输关闭和资源释放结果分别处理 |

全部描述符都必须通过完成与部分失败清理的契约检查；表中端点是已确认需要整改的接入项。依赖链上存在吞掉必要释放错误的模块时，修复纳入所属 feature 的同一交付，并覆盖成功及故障注入测试。端点契约测试通过后，registry 才能据其结果确认 applied，不能仅用永远成功的 mock teardown 作为接入证明。

## 8. 设置面板接入

SettingsModalView 只消费描述符、快照和操作结果，不持有第二份“是否应用成功”的状态机。

- 开关 checked 显示目标配置；运行状态显示应用中、已生效或本页失败。应用中仍允许用户改变目标，以便接纳最新选择。
- 附加字段依据快照统一更新，仅在目标开启且本页 runtime=enabled 时可交互；不在旧 change 回调完成后使用捕获的 isChecked 覆盖当前显示。
- change handler 捕获 Promise 错误。superseded 只结束旧操作；存储失败恢复为 registry 当前值；生命周期失败展示对应错误，不伪装为保存失败。
- 可恢复的装配错误提供重试，调用同值 setEnabled；资源状态无法确认或缺少 teardown 时提供刷新入口。
- 新文案在现有国际化字典注册，使用项目统一翻译入口；进度使用 aria-busy，错误使用可访问的状态提示。样式常量归入 registry constants 与现有 CSS。
- 每次打开建立自己的订阅和视图存活标记，Modal.onClose 立即取消订阅。关闭后到达的操作结果不修改已移除 DOM。

保留 requiresReload 描述符的关闭弹窗刷新语义，Tabview 仍执行已有热切换并按配置变化决定刷新。判断使用打开时与关闭时的已接纳配置，覆盖远程变化；持久化失败未改变配置时不触发刷新。

关闭时若存在需要刷新的配置变化，可直接刷新，以已保存配置完成下一次初始化，不等待正在执行的 hook。会话模式中的自动关闭刷新不触发，避免丢失刚刚选择的会话配置；面板持续显示此模式的保存范围。

Modal 已提供幂等 close 与 onClose，本方案复用该边界，不改动通用弹窗的关闭实现。存储 listener 则属于 registry 所在页面实例，跨 SPA 路由保留，并且与面板订阅分别计数和验收。

## 9. 文件落位与实施顺序

| 文件 | 计划改动 |
| --- | --- |
| [feature-registry.ts](../src/registry/feature-registry.ts) | 统一状态接纳、逐功能执行记录、初始化去重、快照订阅与失败归属 |
| `src/registry/types.ts`（新增） | 只读快照、错误分类、内部阶段与操作结果的判别联合，明确导出边界 |
| `src/registry/constants.ts`（新增） | 排序默认值、错误分类和状态文案键等集中常量 |
| [registry/index.ts](../src/registry/index.ts) | 导出调用方需要的状态类型 |
| [storage.ts](../src/core/storage.ts) | 增加窄持久化能力查询，保留既有 API 兼容行为 |
| [settings-view.ts](../src/registry/settings-view.ts) 与 [settings.css](../src/registry/settings.css) | 订阅快照、处理操作结果、重试与关闭释放 |
| [main.ts](../src/main.ts) | 捕获 registry 启动失败，保持基础控制器和注册的现有顺序 |
| [locales.ts](../src/i18n/locales.ts) | 设置进度、失败、重试、刷新及会话模式文案 |
| [types/index.ts](../src/types/index.ts) 与 [descriptors.ts](../src/registry/descriptors.ts) | 对齐生命周期契约，维持现有 feature 能力拆分 |
| [feature-factory.ts](../src/features/player/feature-factory.ts)、[speed-feature.ts](../src/features/player/speed-feature.ts)、[speed-button-view.ts](../src/features/player/speed-button-view.ts) 与 [toolbar.ts](../src/ui/toolbar/toolbar.ts) | 资源所有权记录、部分失败清理和聚合错误传播 |
| [Tabview 沙箱入口](../src/features/tabview/index.ts)与 [constants.ts](../src/features/tabview/constants.ts) | setup 的完整结束路径、异步 destroy、回执等待及领域常量 |
| [Tabview 页面入口](../src/features/tabview/page/index.ts)与 [coordinator.ts](../src/features/tabview/page/coordinator.ts) | 装配失效与页面资源释放结果，按实际释放链同步对齐子资源端点 |
| [Tabview session.ts](../src/features/tabview/session.ts)、[protocol.ts](../src/features/tabview/protocol.ts) 与 [types.ts](../src/features/tabview/types.ts) | 清理控制消息、结果验证、协议版本和传输结束顺序 |
| [registry 测试](../src/registry/__tests__/feature-registry.test.ts) | 实例隔离、状态转换与交错验收 |
| [storage 测试](../src/core/__tests__/storage.test.ts) | API 能力组合及抛错传播 |
| `src/registry/__tests__/settings-view.test.ts`（新增） | 远程呈现、失败交互、关闭释放与刷新判断 |
| [播放器特性测试](../src/features/player/__tests__/player-features-decoupling.test.ts)、[倍速测试](../src/features/player/__tests__/speed-feature.test.ts) 与 [Toolbar 测试](../src/ui/toolbar/__tests__/toolbar-actions.test.ts) | 释放故障注入、剩余资源继续清理和失败结果传递 |
| [Tabview setup 测试](../src/features/tabview/__tests__/setup.test.ts)、[session 测试](../src/features/tabview/__tests__/session.test.ts)、[protocol 测试](../src/features/tabview/__tests__/protocol.test.ts)、[会话集成测试](../src/features/tabview/__tests__/session-ownership.integration.test.ts) 与 [coordinator 测试](../src/features/tabview/page/__tests__/coordinator.test.ts) | ready 异常、就绪前清理、回执归属、聚合失败和超时结束路径 |

实施按以下顺序推进，每步形成可检查的行为结果：

1. **固定契约与测试接缝**：建立每例独立 registry／模块实例、内存 GM adapter、受控 Promise 与局部故障注入，固定提交边界和初始化清理完成条件。
2. **交付描述符完成契约**：完成第 7.5 节的端点整改，先验证播放器和 Toolbar 的释放链，再验证 Tabview 两端的装配结束、清理回执与超时归属。核对其余描述符并完成相应契约测试。
3. **收敛内核**：实现配置与 applied 分离、逐功能执行器、目标与尝试归属、初始化去重及失败清理等待；各入口通过提交边界统一接入。
4. **接入存储规则**：规范化、一次性提交发布、完整刷新、会话模式及失败策略。将现有“setup 失败回写旧配置”测试改为验证保留目标与本页错误，并增加跨 feature 保护及基础快照覆盖用例。
5. **接入设置视图**：状态订阅、异常捕获、清理进度、可恢复重试、刷新和订阅释放同步交付，确保用户能够观察并处理失败。
6. **整体验收与文档对齐**：完成端点和 registry 集成测试、完整自动化及油猴实际验证，更新相关方案中已落地的接口说明；[CONTEXT](../CONTEXT.md)仅维护领域含义。

描述符完成契约、内核、失败语义和设置视图作为同一可用交付完成。Tabview 协议两端同步构建和验证，清理结果可信是确认运行状态及开放重试的交付前提。

## 10. 验收计划

### 10.1 自动化验收矩阵

测试通过描述符回调、存储接缝和公开状态 interface 验证行为，不断言私有队列形状。生命周期使用受控 Promise，逐步释放以构造交错，不用真实睡眠猜测执行时机。领域端点的 READY 与清理回执超时使用 fake timers 推进对应常量；registry 调和测试显式推进微任务，并检查提交边界内的同步调用轨迹。

| 场景 | 主要断言 |
| --- | --- |
| 缓存查询与快照隔离 | 首次加载后查询免存储读取，外部修改返回对象不污染内存 |
| 配置规范化 | 缺失、删除、null、数组和错误类型使用默认值；有效未知字段保留 |
| 本地存储读取／写入抛错 | 读取失败保留快照；写入失败接纳成功读到的基础配置，失败的本地目标不驱动 hook，错误不会伪造 applied |
| 基础快照被本地目标覆盖 | 本页 disabled、存储开启、本次关闭且写入成功时，setup 调用次数为零；订阅和目标归属只观察最终关闭值 |
| 提交期间同步重入 | GM 回调、订阅者及 hook 引起的新输入按序处理；提交与同步发布结束前不启动新 hook，多个输入共享待执行调和任务 |
| 同值提交 | 稳态不写入不装配；执行中等待同一结果；可恢复错误只重试一次 |
| 目标版本与显式重试 | 开关往返后复用成功 hook；旧 hook 失败只允许最新目标的有效尝试；显式同值重试分配新尝试，重复通知不增加次数 |
| setup 中关闭／连续切换 | 最大同时活动 hook 数为一，最终应用最新目标，旧请求明确结束 |
| teardown 中开启 | teardown 完成之后才发生 setup |
| 初始化期间本地及远程更新 | 已轮到的功能可调和，未轮到的功能使用最新目标 |
| 重复 initAll | 同一初始化工作、一次监听、每项首次 setup 只执行一次 |
| 初次读取失败后重试初始化 | 首次不执行 feature 并移除 listener，下一次可成功启动，入口与面板处理拒绝 |
| 初始化前已有缓存 | 建立监听后重新读取持久化值，监听建立前发生的变化进入首次初始化；会话模式保留当前选择 |
| 首次失败清理仍在进行 | 清理 Promise 结束前不开放下一项初始化资格、不结束 initAll，也不开放同功能重试；已有资格的其他功能仍能切换 |
| setup 失败及清理 | 成功清理可重试；清理失败 applied=null，后续普通切换不能重复装配 |
| 播放器部分装配与释放失败 | 启用标记关闭后仍尝试释放已取得资源；一项释放抛错时其余释放继续，失败不会被空 teardown 变成成功 |
| Toolbar 释放链故障 | 状态订阅或视图释放失败传回 feature，再传回 registry；结合真实 feature 端点验证 applied=null 及重试锁定 |
| Tabview ready 后处理异常 | 注入样式抛错后 setup reject，必要清理结束后初始化继续；重复 ready 不再次完成操作，定时器及等待资源已释放 |
| Tabview 装配等待结束路径 | 同步注入异常、页面初始化失败、装配期关闭及 READY 超时均结束 setup；已经确认的页面清理结果被同会话 teardown 复用 |
| Tabview 就绪前清理与成功回执 | 清理控制消息不被 ready 队列阻塞；页面先完成必要清理再发送结果，两端清理都成功后 destroy 才 resolve |
| Tabview 页面清理异常 | 一项清理失败后仍执行其他项，失败分类通过协议到达沙箱并使 destroy reject，registry 保持资源未知 |
| Tabview 清理等待失败 | 发送异常、对端提前关闭及回执超时使 destroy reject，本地释放继续且等待资源清空；重复销毁共享结果 |
| Tabview 回执归属与验证 | 重复回执只结束一次；错误版本、方向、结构及旧会话结果不能完成当前清理；超时后的回执不解除资源未知状态 |
| teardown 失败 | 保持未知资源状态并要求刷新，不错误报告 disabled |
| A 失败同时 B 更新 | B 的新配置和生命周期保留，没有异步整字典回滚写入 |
| 多次远程通知 | 刷新当前可见存储，重复值不重复 hook，远程处理不写共享配置 |
| 远程读取失败 | 保留快照，后续成功通知可继续接纳，无自动重试循环 |
| 相同存储 key 并发写入 | fake adapter 展示覆盖边界，不把本地串行测试当作跨标签页事务证明 |
| 会话模式与 listener 缺失 | 显示正确保存范围，读取不重置会话目标，初始化不反复注册 |
| 注册边界 | 批量冲突不部分接纳，启动后拒绝替换描述符 |
| 面板快速操作与远程变化 | 以最新快照呈现，旧 Promise 不覆盖新状态，所有拒绝被处理 |
| 面板关闭与重新打开 | 关闭立即取消订阅，晚结果不更新旧 DOM，新面板获得当前快照 |
| requiresReload | 配置确实变化时刷新，存储失败及会话模式按定义处理 |
| 空闲与订阅异常 | 无常驻计时器、无自续任务；异常订阅不阻塞其他订阅 |

每个测试建立独立实例或隔离模块，显式收尾全部受控 Promise、fake listener 和领域定时器。端点契约集成测试使用真实 feature 端点，在其资源取得、释放或消息传递接缝注入失败；不能把全部清理替换为成功 mock 后据此断言资源已释放。`invalidateCache()` 只测试刷新契约，不承担清除 singleton 的职责；测试不得读取或强写私有字段，也不新增仅服务测试的生产重置 API。

内核测试优先使用 Node 环境与局部 fake 存储，避免默认 jsdom 的全局 setup 成为无头测试依赖。若按测试项目分组，Node 项目不加载 [DOM 测试 setup](../src/test/setup.ts)；SettingsModalView 保留 jsdom 和现有 DOM 资源检查。

实施后运行针对性测试和类型检查，集成完成后运行完整测试及构建：

```powershell
pnpm exec vitest run src/registry/__tests__/feature-registry.test.ts src/registry/__tests__/settings-view.test.ts src/core/__tests__/storage.test.ts
pnpm exec vitest run src/features/player/__tests__/player-features-decoupling.test.ts src/features/player/__tests__/speed-feature.test.ts src/ui/toolbar/__tests__/toolbar-actions.test.ts
pnpm exec vitest run src/features/tabview/__tests__/setup.test.ts src/features/tabview/__tests__/session.test.ts src/features/tabview/__tests__/protocol.test.ts src/features/tabview/__tests__/session-ownership.integration.test.ts src/features/tabview/page/__tests__/coordinator.test.ts
pnpm check
pnpm test
pnpm build
```

### 10.2 浏览器验收

将构建产物加载到 Tampermonkey／Violentmonkey，在 YouTube 完成以下行为检查，并记录管理器版本和浏览器环境：

1. 两个标签页同时打开设置，任一页切换功能，另一页开关和运行状态最终更新；本页应用失败不改写另一页已保存配置。
2. 连续切换 Tabview，并在初始化进行时更改开关，检查成功后资源与最终目标一致，失败时有对应反馈。
3. 分别停用截图、画中画、循环和倍速，确认按钮与快捷键保持各自成对启停；字幕附加字段与实际启用状态一致。
4. 操作期间关闭和重新打开面板，检查状态正确、无未处理拒绝、无重复订阅；需要刷新时加载已保存目标。
5. 跨 SPA 路由后继续切换，确认 registry listener 未重复创建，功能自身路由资源仍按各自约定释放。
6. 在受控浏览器测试环境分别注入 ready 后处理异常、页面清理失败和清理结果丢失，确认 Promise 结束、清理中反馈正确、后续初始化可推进。装配失败且清理成功时可显式重试；清理失败或结果无法确认时提示刷新，禁止再次装配。

多标签页检查验证真实管理器的通知和读值行为，不将单元测试模拟的同步顺序当作浏览器平台保证。若尚未完成该验证，交付记录明确标注环境与未验证项目。

## 11. 完成标准

初始化、本地设置、远程刷新与显式刷新通过同一状态入口和逐功能执行器；调用方能够区分配置、应用中与本页失败。连续切换保持同功能互斥，旧操作不会覆盖新目标，生命周期错误不会回写旧共享配置。

单次本地提交只发布最终选定快照，生命周期在提交及同步发布结束后依据最新目标启动。首次初始化失败包含必要清理的结束结果，目标版本与执行尝试的重试资格明确。

全部描述符的成功、失败和关闭路径能够结束操作，必要释放错误沿资源所有权链传播。Tabview 以会话归属明确的两端释放结果完成 destroy；清理失败、结果缺失或无法确认时进入资源未知状态并锁定再次装配。上述保证必须通过端点故障注入及 registry 集成测试验证。

设置视图具备可观察的失败与恢复路径，静态注册及启动顺序明确，稳定查询保持内存访问，空闲时不产生调度活动。跨标签页保证严格限制在平台实际提供的读写和通知能力之内。

本文定义实施契约与验收要求；运行代码、测试和构建验证在实施阶段完成。
