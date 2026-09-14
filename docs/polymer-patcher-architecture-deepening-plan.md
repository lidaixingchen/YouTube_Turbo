# PolymerPatcher 异步安装与生命周期架构深化方案

## 1. 目标与范围

本方案深化 [PolymerPatcher](../src/features/tabview/page/polymer-patcher.ts)，使一次 Tabview 启用期间的原型发现、安装、语义重放、异步 hook 与恢复具有明确的共同归属。TabviewLifecycleCoordinator 通过小 interface 获得生命周期保障，不需要等待每个 Custom Element，也不需要管理各 patch 的 Promise、恢复记录或取消令牌。

本方案遵守 [ADR-0003：事件驱动 Tabview 生命周期](adr/0003-event-driven-tabview-lifecycle.md)，并沿用 [观察者归属方案](tabview-observer-ownership-architecture-deepening-plan.md)与 [TabviewSession 方案](tabview-session-architecture-deepening-plan.md)的职责划分：

- 页面端与油猴沙箱保持隔离，原型、DOM、AbortSignal 与函数引用只留在页面上下文。
- READY 保证当前可见页面状态的同步初始化与重放已经完成，未来 Custom Elements 的注册不属于 READY 的等待条件。
- TabviewSession 继续拥有握手、消息顺序和会话关闭；patch 安装状态不成为新的跨上下文协议。
- 路由生命周期由 coordinator 管理，原型安装生命周期由 patcher 管理。
- 不增加常驻轮询、全局 MutationObserver 或按时间重复扫描。

实施聚焦于 patcher、PolymerHelper 的 CE 等待、coordinator 接入、页面入口的启动失败清理与沙箱 setup 的 Promise 返回稳定性。DOMRelocator、TabviewPanelState、InfoMirrorEngine 与 ExpanderFixer 继续拥有各自领域行为；本方案负责停止向它们发送失效的调用，不重构其内部算法。

本方案修订两份已实施方案的页面端契约：`replayConnected()` 由无参签名改为 `replayConnected(context: WatchRouteContext)`，READY barrier 中“`replayConnected()` 已同步重放”的表述同步更新为“当前 route context 的同步重放”。[观察者归属方案](tabview-observer-ownership-architecture-deepening-plan.md)与 [TabviewSession 方案](tabview-session-architecture-deepening-plan.md)中与本签名及 READY barrier 表述相关的段落，以本方案为准；完整修订清单见 4.3 节。

## 2. 当前实现与可验证差距

基准提交为 `f66c577`。以下是源码事实及其时序风险，运行时故障需通过后续定向测试复现。

| 位置 | 当前行为 | 生命周期差距 |
| --- | --- | --- |
| `applyPatches()` | 设置 `isPatched` 后启动 11 项异步安装，不收集任务结果 | 布尔值表示任务已启动，不能证明安装已完成或任务仍归当前启用周期所有 |
| 11 个 `patch*()` | `await retrieveCE()` 后直接继续写原型 | 等待期间发生恢复或再次启用时，旧任务仍可写入原型并使用 singleton 上的新 hooks |
| `PolymerHelper.retrieveCE()` | 等待 `customElements.whenDefined()` 后查找元素或构造临时实例 | 取消尚未就绪的等待与释放功能闭包没有统一入口 |
| `hookMethod()` | 保存原函数后赋值；恢复记录没有已安装函数身份与原始属性描述符 | 无法精确处理继承方法、属性标志、部分写入失败和后续第三方替换 |
| `restorePatches()` | 清理 disposer 后逐项赋回方法，结束时才清除 `isPatched` | 清理回调执行期间旧安装仍被视为有效；单次恢复异常可中断后续恢复；hooks 引用未清空 |
| `patchComments()` | 直接注册 `_createPropertyObserver` 并写 `_dataChanged498` | 属性 effect 及回调未被现有方法恢复清单完整管理，重复启用存在重复注册风险 |
| `patchLiveChatFrame()` | `urlChanged` 内创建 timer 与 IntersectionObserver | observer 仅在异步等待结束时断开，timer 未在其他分支胜出后清除，detach／销毁未统一取消等待 |
| semantic attached 与 replay | attached 可重复创建 disposer；replay 另行检查已有记录 | 重复 attached、同步重入与晚返回 disposer 的 ownership 没有共同判定 |
| 页面 `main()` | coordinator 初始化抛错后仍继续发送 READY | 初始化失败也可能向沙箱声明启动成功 |
| 沙箱 `Tabview.setup()` | 每次新 setup 都执行 page bundle，最后返回可被关闭回调清空的 `inFlightSetupPromise` | module 内静态缓存不能自动跨 IIFE 去重；同步启动失败时返回值可能丢失原 Promise |

相关源码：[PolymerPatcher](../src/features/tabview/page/polymer-patcher.ts)、[PolymerHelper](../src/features/tabview/page/polymer-helper.ts)、[coordinator](../src/features/tabview/page/coordinator.ts)、[页面入口](../src/features/tabview/page/index.ts)。

## 3. 深化设计

### 3.1 一个安装周期，逐项完成

保留 PolymerPatcher 为独立 deep module，在其内部引入一次启用对应的安装周期。周期拥有固定 patch 清单、可取消发现请求、方法恢复记录、当前语义 hooks、有效 route context 和活动异步操作。

每个 tag 独立完成发现、可逆方法安装与局部重放。一个尚未定义的 tag 不阻塞其他 tag，也不阻塞同步页面初始化。

收益来自以下收敛：

- **locality**：安装、取消、失效检查和恢复在同一个 module 中验证。
- **leverage**：所有 patch 共用生命周期保障，coordinator 不再承担它们的完成顺序知识。
- **depth**：interface 描述启用、当前路由重放与释放，implementation 隐藏异步任务和原型恢复的复杂性。

删除测试支持保留 patcher：移除它会把原型操作、disposer 配对和取消规则散回页面入口与领域 module。应集中的是各 patch 重复且缺失的生命周期管理，不是将每个 patch 拆成新的公开 module。

### 3.2 三种资源归属

| 归属 | 内容 | 结束时机 |
| --- | --- | --- |
| 安装周期 | hooks、CE 等待订阅、可逆方法安装、安装任务记录 | `restorePatches()` |
| 当前路由与 exact element | semantic attachment、聊天等待操作、局部 replay 请求 | 路由停用、元素 detach／断连、实例请求被替换或安装周期结束 |
| 页面生命周期 | 去重后的原生 CE 等待入口；评论属性 effect 的稳定 adapter | 对应 registry／prototype 被回收或页面卸载；功能停用时其功能订阅为零 |

页面生命周期资源不持有已销毁周期的 hooks、coordinator、DOM 或 disposer，不安排 timer 或轮询。它们与可以立即撤销的功能资源分别验收。

### 3.3 页面生命周期状态的跨 IIFE 存续

现有 Tabview.setup 会在再次启用时重新执行页面端 bundle，因此页面生命周期状态不能仅存放在本次 IIFE 的 module 静态变量中。两类状态的存续策略不同：

- **评论属性 effect adapter**：effect 注册在真实 Polymer 行为下无法逐周期撤销，一旦安装即跨 IIFE 存续。adapter 通过 prototype 上一个不可枚举 Symbol 键（键名收敛至 PAGE_CONSTANTS）保存唯一记录：稳定回调属性读取该记录，记录内的订阅集合接纳当前 IIFE 的周期订阅；旧 IIFE 清理时只移除自己的订阅，不能清空新订阅。同一 prototype 的记录全局唯一，重复 bundle 求值不会叠加 effect。
- **CE 等待去重**：单个页面端只有一份 `CustomElementRegistry`，等待去重入口按 tag 保存在本 IIFE 的 module 静态变量中即可。旧 IIFE 的订阅在恢复时已取消，跨 IIFE 不共享等待入口，也不建立任何跨 bundle 可变注册表。

不使用 `Symbol.for` 中央记录、schema 协商或 RuntimeChannel 传输。prototype 上的 adapter 记录只含回调身份与订阅集合，不保存 page session、coordinator、当前 patcher singleton、DOM 或 hooks。功能周期与订阅保持独立，adapter 记录的形状由本 feature 独有 Symbol 键界定，无需版本核对。

## 4. 对外 interface

### 4.1 生命周期入口

| 入口 | 目标语义 |
| --- | --- |
| `applyPatches(hooks?)` | 创建一个有效安装周期并启动固定清单；活跃周期中的重复调用不重复安装 |
| `patchFlexyInstance(element)` | 在已有周期内，对已知 flexy 的可用方法进行一次幂等核对；不创建新周期或新的全量等待 |
| `replayConnected(context)` | 接受已有 `WatchRouteContext`，同步重放当前 route 中已连接的实例，并更新后续局部 replay 的归属 |
| `suspendRoute()` | 清除当前 route context，暂停 semantic 转发，结算实例级异步操作并逆序释放当前路由 attachment；保留原型安装周期 |
| `pruneDisconnectedDisposers()` | 清理已断连元素的 attachment 与实例操作，不停用仍有效的路由 |
| `restorePatches()` | 先使安装周期失效，再撤销其发现订阅、实例工作、attachment 与可逆原型修改 |
| `runInProtectedContext(callback)` | 保持同步保护及嵌套 finally 恢复语义；执行入口受有效周期检查约束 |

`replayConnected` 使用 [已有 WatchRouteContext](../src/features/tabview/page/types.ts)，包含 generation、state 与 exact flexy。coordinator 在路由 owner 与挂载就绪后提供该 context；无需新增安装状态 getter 或跨上下文 ready 消息。

活跃周期的 hooks 保持该周期的所有权：相同 hooks 的重复绑定为幂等操作；传入不同 hooks 视为调用契约错误，原周期保持有效。更换 owner 时先恢复，再建立新周期。无活跃周期且未提供 hooks 的调用不隐式启动后台安装。

`suspendRoute()` 取代既有 `clearAllDisposers()` 的公开职责；后者收敛为 patcher 内部实现，不再出现在 coordinator 调用面上。

### 4.2 安装周期与路由代次分离

安装周期使用独立身份令牌和关闭状态，不能用 coordinator 的 route generation 代替。Watch → Home → Watch 时，功能仍启用，已安装原型保持有效，尚未定义的 tag 继续等待。

离开 Watch 时清除当前 route context，停止页面标记、镜像调用与 attached 语义转发；native 方法仍按其正常路径执行。返回 Watch 后，coordinator 提供新 context，patcher 重新重放当前实例。

Watch A → Watch B 可以沿用既有可复用的 DOM 与 route generation。实例异步操作额外保存发起时的页面 URL、宿主与请求身份，避免只依赖 generation 而执行旧视频请求。

### 4.3 对既有 interface 的修订与 diagnostic 约定

| 既有契约 | 修订后 |
| --- | --- |
| `replayConnected(): void`（观察者归属方案、session 方案） | `replayConnected(context: WatchRouteContext)`，由 coordinator 在路由 owner 与挂载就绪后调用；无 context 调用属于调用契约错误 |
| READY barrier 第 9 步“`replayConnected()` 已同步重放当前已连接的相关 Custom Elements” | barrier 内执行 `replayConnected(context)`，重放范围限定为当前 route context |
| `patchFlexyInstance(element)` 内部委托 `applyPatches()` | 幂等核对已知 flexy 的可用方法，不创建新周期 |
| `clearAllDisposers()` 公开入口 | 由 `suspendRoute()` 取代，内部实现保留字面义 |
| coordinator hooks 内的 `pageType` 守卫（`currentState.pageType !== "watch"` 提前返回） | 保留为 coordinator 侧防御性默认；route context 有效性的判定权归 patcher，hooks 守卫不承担职责转移 |

页面端 diagnostic 统一使用 `console.warn("[Tabview:Patch] ...")` 前缀，附 tag 与 method 维度；同一 tag/method 的预期能力暂缺只记录一次，恢复冲突按项记录。diagnostic 不进入跨上下文协议，不新增消息类型。

## 5. Custom Elements 发现与取消

### 5.1 标准能力与功能取消

原生 `whenDefined(name)` 返回定义就绪的 Promise，其 interface 不接收 AbortSignal，也不提供取消入口。因此本方案取消的是功能对该等待的订阅与后续操作。原生 Promise 是否继续存在，不能等同于旧功能资源是否仍被持有。依据：[WHATWG HTML：CustomElementRegistry](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-customelementregistry-whendefined)。

PolymerHelper 的内部契约增加可选 `AbortSignal`：`retrieveCE(tagName, signal?)` 仍返回 `Promise<PolymerControllerPrototype | null>`。取消时解除本次订阅并尽快以 `null` 完成；patcher 在 await 之后仍需验证周期身份，不能把 `null` 或一次 signal 检查作为全部生命周期保障。

### 5.2 去重等待与引用释放

在 PolymerHelper 内部按 tag 管理共享等待入口，结构为 module 静态的 `Map<tag, entry>`（页面端只有一份 `CustomElementRegistry`，不引入 registry 维度）：

1. tag 已定义时直接进入 controller prototype 解析。
2. tag 尚未定义时，同一 tag 只向原生 Promise 安装一个完成通知入口。
3. 每次功能等待加入可撤销的订阅集合，AbortSignal 取消时删除订阅并解除 abort listener。
4. 原生完成入口只持有 tag 与共享条目，不闭包捕获 patcher、hooks、coordinator 或 DOM。
5. 最后一个订阅取消后保留空等待入口，避免再次启用时向同一个未完成 Promise 重复追加闭包；tag 最终定义时清除该入口。
6. 完成、取消与异常分支均只能结算订阅一次。

等待入口数量由固定 tag 清单约束，反复启停不会随次数增长。等待入口为 IIFE 内静态资源，不跨 IIFE 共享，不保存 DOM。

### 5.3 CE 就绪与 Polymer controller 可用分别判断

`customElements.get()` 只用于判断定义状态，不能直接将其 constructor.prototype 当作最终 Polymer controller prototype。继续通过 `PolymerHelper.insp()` 解析当前有效实例；需要临时实例时，仅在等待仍有效时构造，且不插入文档。

tag 已定义但 controller 或所需方法尚不可用时，记录一次带 tag/method 的 diagnostic。后续显式 `replayConnected(context)` 或已知实例的 `patchFlexyInstance(element)` 可进行一次针对性核对；不以 timer 反复尝试。

定义完成后的每个 continuation，在 DOM 查询、临时实例构造、prototype 写入与局部 replay 前都验证当前周期。取消后的原生 Promise 即使迟到完成，也不能继续构造实例或启动新工作。

## 6. 固定 patch 清单与安装状态

### 6.1 按 tag 管理完成度

当前源码包含以下 11 项安装，清单保留为内部具名常量与安装函数映射，数量从清单推导：

| tag / 现有 patch | 主要能力 | 就绪后的局部重放 |
| --- | --- | --- |
| `ytd-app` | MinibrowserRouter 导航适配 | 方法适配生效，无 attached 重放 |
| `ytd-watch-flexy` | 页面位置更新保护、聊天位置适配 | 当前 flexy 方法核对 |
| `ytd-expander` | 展开计算、评论条目生命周期 | 当前评论展开器 |
| `ytd-watch-next-secondary-results-renderer` | 推荐列表生命周期 | 当前有效推荐列表，过滤 skeleton |
| `ytd-comments` | 评论区域生命周期与数据状态 | 当前评论区域与现有数据投影 |
| `ytd-comments-header-renderer` | 评论计数通知 | 当前已连接 header 的计数同步 |
| `ytd-live-chat-frame` | 聊天生命周期与 iframe 就绪等待 | 当前聊天实例 |
| engagement panel tag | 互动面板生命周期 | 当前 route 的互动面板 |
| watch metadata tag | 元数据生命周期 | 当前原生元数据 |
| playlist panel tag | 播放列表生命周期 | 当前播放列表 |
| expandable description tag | 简介展开内容适配 | 当前 route 的简介实例 |

已有 tag、selector 与 method 常量优先复用 PAGE_CONSTANTS。安装涉及的字符串与状态值收敛至对应常量和显式类型，避免散落约定。

每项内部状态区分等待定义、等待可用方法、安装完成、能力暂不可用、安装失败与周期已关闭。完成度用于决定是否安装或重放，不增加向 caller 暴露的全局“全部完成”条件。

### 6.2 任务异常

每项异步安装都由周期登记并附带拒绝处理，结束后从活动任务集合移除。一个 tag 失败不终止其他 tag，也不会产生由本模块遗漏处理的 Promise rejection。

周期关闭属于正常结束，不重复输出错误。预期能力暂缺按 tag/method 去重记录；写入或安装函数异常包含所属 patch 信息，便于定向定位。

## 7. 可逆方法安装与恢复

### 7.1 安装记录

对每项方法记录：prototype 身份、property key、安装前的 own property descriptor、解析得到的原函数、实际安装的函数／descriptor、所属周期和提交顺序。

原方法来自 prototype 链时，恢复必须删除本次新增的 own property，使查找重新落到原链；不能通过赋值将继承方法永久复制为 own property。

### 7.2 每个 tag 的可逆方法安装

1. 检查周期有效性、prototype 身份与方法能力。
2. 生成待安装函数并保存完整描述符；仅处理已核实的可写函数属性，缺失方法独立标记为暂不可用。
3. 各方法逐项独立写入，提交过程不跨 await；写入成功才登记可恢复项。
4. 单项写入失败记录 diagnostic 并跳过该 tag 的剩余方法；已写入项保持登记，交由 `restorePatches()` 统一恢复，不做 tag 内即时回滚。其他 tag 保持有效。
5. 同一 prototype/property 在同一周期中只安装一次；重复发现和重放不会再次叠加函数。
6. 安装完成并再次确认周期有效后，触发该 tag 的局部 replay。

方法不应通过未知 accessor 求值或 setter 间接写入。遇到不能安全处理的描述符（含原型被外部冻结）时跳过对应能力并记录，而不是为了安装强行改变属性权限。

### 7.3 已安装函数的有效性检查

每个安装函数闭包捕获自己的周期控制记录，不通过 mutable singleton 的最新 hooks 判断归属。该控制记录关闭后清空功能引用。

- 周期有效时执行该项增强，保留原生调用的 `this`、参数、返回值及异常语义。
- Watch 相关增强还必须具有有效 route context；route 暂停时委托原生方法。`ytd-app` 导航适配按其既有页面导航职责工作，不被错误限制为仅 Watch 可用。
- 周期失效后被外部保留引用再次调用时，透明委托其捕获的原函数，不访问新周期 hooks。
- `calculateCanCollapse`、`updateChatLocation` 等替换型适配也保留原函数供失效分支使用。
- 普通 semantic 通知的异常独立记录，不能使应当执行的原生方法漏调或重复调用。
- `runInProtectedContext` 的节点身份与嵌套计数通过本次调用的 finally 恢复；清理期间发生同步重入也不能使计数变为负数或把旧节点身份写给新节点。

### 7.4 ownership 感知的恢复

恢复之前先比较当前 descriptor 与本周期安装结果：

- 当前仍由本周期拥有时，恢复原 descriptor，或删除本次新增属性。
- 方法已由其他脚本替换时，保留当前第三方修改并记录冲突；本周期函数已失效，若仍位于第三方调用链中只执行原生委托。
- 一项恢复失败时继续处理其余项，最后释放恢复记录与 hooks 引用；错误诊断不持有 DOM 或函数对象。

在没有外部写入干预的情形下，验收要求属性形状和函数身份精确恢复。存在外部修改或原型被外部冻结时，报告实际未恢复项，不宣称可以无条件复原整个 prototype。

## 8. 评论属性 effect 的生命周期

`_createPropertyObserver` 的副作用超出普通方法赋值。现有代码没有对应的 effect 注销入口，因此本方案对评论数据通知采用页面生命周期的幂等 adapter，功能周期只拥有其订阅。

### 8.1 单次注册与功能订阅

- 按 exact prototype 保存 3.3 节所述的 Symbol 键记录；同一 prototype 的评论数据 effect 只安装一次。
- 使用具名、稳定的属性回调作为通知入口。回调只读取当前有效订阅；没有订阅时立即返回，不持有旧功能 hooks 或元素集合。
- 新周期启用时绑定其数据投影处理；恢复时撤销该周期订阅，使 callback 留在可安全调用的空闲状态。
- 回调仅对当前有效 route 的元素处理数据状态，重复数据通知不新增 observer 或方法。
- 稳定回调属性发生命名冲突时保留原有行为并报告能力不可用，不覆盖未知回调。

### 8.2 安装失败与恢复边界

注册前先建立可空闲调用的稳定回调，再调用 effect 注册。若 effect 注册抛错且无法证明其副作用已撤销，将该 adapter 标记为注册结果不确定并保持空闲，禁止自动重复注册以免叠加 effect。

评论的可逆 attached/detached 方法与此 adapter 分别管理。属性 effect 能力失败不撤销已安全安装的其他方法，diagnostic 明确说明该项能力受限。

该稳定 effect 与回调是明确的页面生命周期资源，不纳入“每次 restore 后 prototype 与首次启用前逐字节一致”的承诺。restore 的要求是当前功能订阅、闭包、DOM 引用与活动工作全部释放。

实施前需在真实 YouTube 的 Polymer 行为中核对单次注册及 callback 调用方式；测试不能假定删除回调属性就等于删除已注册的 effect。

## 9. semantic attachment 与局部重放

### 9.1 共同入口

attached hook 与 replay 共用相同的 exact-element/kind 处理：

1. 核对安装周期、当前 WatchRouteContext、元素连接与所属 route。
2. 已有有效 attachment 时直接复用；需要更换时先释放旧 attachment。
3. 在调用 semantic hook 前登记正在建立的身份，防止同步重入重复创建。
4. hook 返回 disposer 后再次核对周期、route 和记录身份；仍有效时登记，否则立即执行该 disposer。
5. disposer 只结算一次；detached、prune、route clear 与 restore 共用释放入口。

清理集合先移除记录再调用其 disposer，避免 disposer 重入后重复清理。完整释放按实际 attachment 建立顺序逆序执行；一项异常不影响其余项。

没有 disposer 的 related/header 通知继续按正常事件或显式 replay 触发，由对应领域 module 保持幂等。不能为了“只执行一次”永久压制之后的评论计数更新或导航同步。

### 9.2 启动重放与迟到重放

`replayConnected(context)` 同步处理调用时已存在的元素，即使某个 tag 的原型安装仍在等待。它不等待 CE Promise，也不将“原型安装完成”作为当前 DOM 语义投影的必要条件。

某个 tag 迟到安装成功时，只针对该 tag 在当前 route 的实例补做局部 replay；已经具有有效 attachment 的实例保持幂等，不能再次创建观察资源。

没有有效 WatchRouteContext 时可以完成原型安装，但暂停局部 DOM 标记、InfoMirrorEngine 调用和 semantic attachment；下一次 route 激活会同步重放。推荐列表继续过滤 skeleton，元数据与简介定位继续区分原生节点与镜像。

实施前核对 `replayExpandableDescriptionConnected` 中直接执行的 `insertBefore` 是否落在 InfoMirrorEngine 与 DOMRelocator 存活观察器的观察边界内；若在边界内，重排须复用对应领域 module 的静默锁或收敛至该 module 执行，避免自触发突变。

## 10. 聊天 iframe 异步操作

### 10.1 实例操作记录

`urlChanged` 的每次增强等待拥有一条记录：所属安装周期、exact host/frame、发起页面 URL、实例请求身份、timer、IntersectionObserver、完成状态及原生委托。

同一实例的新请求先结束旧记录，再开始新等待。所有退出路径通过同一幂等结算函数清除 timer、断开 observer 并移除记录。

继续使用 `PAGE_CONSTANTS.TIMEOUTS.CHAT_FRAME_READY_MS` 的现有等待上限，当前为 700 ms。可见性先满足时立即清除 timer；超时先到时立即断开 observer。等待完成后再核对周期与请求身份。

### 10.2 原生调用与取消语义

- 正常可见或超时结束：若仍为当前请求，原生方法只执行一次，透传 `this` 与原始参数。
- 请求已被新 `urlChanged` 替代、宿主断连、frame 替换或页面 URL 改变：旧请求结算，不补执行旧原生调用。
- 功能或 route 清理发生，但当前实例仍连接、页面 URL 与 frame 未变且该请求仍为最新：清理过程取消增强等待，并立即把尚未执行的最新调用委托给原生方法一次，避免关闭增强功能后原生聊天继续等待。
- 结算标记先于原生委托设置；后续 observer、timer 和 Promise continuation 均不能再调用原生方法。
- 已失效安装函数被再次调用时直接委托原生方法，不创建新的等待资源。

清理不等待网络或原生异步返回值。已开始的原生工作继续由原生播放器拥有；本方案清除增强层的等待与闭包，不尝试取消原生网络请求。

## 11. 初始化、路由与恢复顺序

### 11.1 页面启动

1. page main 创建 TabviewSession 与 coordinator callbacks。
2. coordinator 建立领域 owner，并调用 `applyPatches(hooks)` 开启安装周期。
3. 绑定导航，解析当前 route，完成可用的 route owner 激活与挂载。
4. 当前 Watch route 就绪时，提供 WatchRouteContext 并同步执行 `replayConnected(context)`。
5. coordinator 的同步初始化成功返回，page session 发送唯一 READY，随后按既有 FIFO 交付启动期间排队事件。
6. 未完成的安装按各 tag 的就绪事件继续，并只对当前有效 route 局部 replay。

当前不是 Watch 或页面宿主暂缺时，启动仍可完成；此时 READY 表示同步初始化路径完成，不表示 Tabview DOM 已全部出现。

coordinator 初始化整体失败时，page main 必须完成 coordinator 清理并关闭 session，结束该次启动路径。单个可选 patch 能力暂缺属于局部降级，不作为整体初始化失败。

沙箱 setup 返回本次创建的稳定 `readyPromise` 引用，`inFlightSetupPromise` 只用于去重和状态管理。页面在注入调用栈内同步关闭 session 时，即使 rollback 已清空缓存字段，caller 仍拿到该次已拒绝的 Promise。相应调整限定于 [Tabview.setup](../src/features/tabview/index.ts) 的返回契约。此调整与“初始化失败不发送 READY”的页面门控互不依赖，同属阶段 0，可先行交付与验证。

初始化期间若 semantic callback 同步触发 teardown，coordinator 使用本次初始化身份阻止清理后的初始化栈继续提交 initialized 或重建 owner；page main 也只在 session 仍有效且本次同步初始化成功时发布 READY。

### 11.2 路由切换

路由停用开始时先调用 `suspendRoute()` 暂停 patcher 的 route context 与实例操作，再执行领域 owner 的既有停用顺序。`suspendRoute()` 幂等释放已建立的 attachment，后续 owner 清理可安全重复调用其自身 disposer。

新 route 的 owner 就绪后调用 `replayConnected(context)`。仅更新与 patcher 接入直接相关的 context 传递和暂停顺序，不在本轮重构 coordinator 的完整导航状态机。

### 11.3 功能销毁

1. coordinator 标记正在销毁并移除导航入口。
2. `suspendRoute()` 暂停当前 patcher route 工作，结算实例操作，执行领域 route 清理。
3. `restorePatches()` 首先关闭并从 patcher 摘除当前周期；重入 apply 不得在该恢复栈中开启新周期。
4. 取消全部 CE 功能订阅，撤销评论数据 adapter 的当前订阅，清空 route context。
5. 幂等结算残余实例操作，逆序执行残余 attachment disposer。
6. 按提交逆序恢复仍由该周期拥有的方法。
7. 清空该周期的任务记录、hooks、DOM 引用与恢复记录；旧 Promise continuation 只能观察到已关闭状态。
8. coordinator 完成其余 owner 清理，TabviewSession 按既有关闭流程终止通信。

`restorePatches()` 返回后允许下一次正常启用建立新周期。旧周期的完成、错误处理、disposer 与超时不能修改新周期的注册或原型。

## 12. 实施步骤与文件落位

| 阶段 | 文件 | 工作与完成条件 |
| --- | --- | --- |
| 0：独立缺陷修复 | `page/index.ts`、`index.ts` | page main 在 coordinator 初始化失败时完成 coordinator 清理并关闭 session、不发送 READY；`Tabview.setup()` 返回本次创建的稳定 `readyPromise` 引用。两项互不依赖，先行交付与验证 |
| A：时序证据 | `page/__tests__/polymer-patcher.test.ts` | 使用可控制完成顺序的 CE Promise，覆盖等待中恢复与重新启用；先复现当前差距 |
| B：CE 取消 | `page/polymer-helper.ts`、新增 `page/__tests__/polymer-helper.test.ts` | module 静态去重原生等待、可取消功能订阅、终止后释放引用；prototype 解析保持 Polymer 语义 |
| C：安装周期 | `page/polymer-patcher.ts`、`page/constants.ts`、`page/types.ts` | 固定任务清单、周期令牌、拒绝处理、可逆方法安装及 ownership 感知恢复 |
| D：活动资源 | `page/polymer-patcher.ts` | 评论稳定 adapter（prototype Symbol 键记录）、exact-element attachment、聊天实例操作与统一结算 |
| E：页面接入 | `page/coordinator.ts`、`page/index.ts` | route context 传递、`suspendRoute()` 暂停顺序与 `replayConnected(context)` 接入 |
| F：联合验证 | 现有 coordinator、session 与 setup 测试 | 全链路迟到安装、销毁后重新启用、页面就绪与资源释放 |

表中路径相对于 `src/features/tabview/`。新增内部类型与常量留在该 feature；不增加通用 patch 框架、外部安装状态查询或新的协议消息。

TypeScript 修改保持严格模式，变量、入参、返回值与回调显式标注类型。测试 mock 使用 `unknown`、受约束的函数类型和具体 prototype fixture，不继续扩散 `any`。

本方案可独立于 [SlotMountBus 方案](slot-mount-bus-architecture-deepening-plan.md)实施。

[CONTEXT.md](../CONTEXT.md)登记 PolymerPatcher 的领域含义；安装令牌、共享表与资源状态保留在本方案中，不进入领域词汇表。

## 13. 自动化验收矩阵

测试通过正式生命周期入口、被安装函数的可观察行为、属性描述符、事件顺序与资源记录验证结果，不读取私有安装 Map 来证明自身实现正确。

| 类别 | 场景 | 验收结果 |
| --- | --- | --- |
| 同步启动 | 所有 CE 定义均未完成 | coordinator 同步返回，READY 正常发送一次，当前 DOM 可以完成 semantic 重放 |
| 逐项安装 | 仅聊天 tag 就绪，其他 tag 继续等待 | 聊天方法可用，其余等待不阻塞它 |
| 等待取消 | apply 后立即 restore，再完成 CE Promise | 旧周期不写原型、不创建临时实例、不重放 DOM |
| 周期交叉 | 周期 A 等待 → 恢复 → 周期 B 启用 → A 完成 | 只允许 B 的安装与 hooks 生效 |
| hooks 身份 | 活跃周期重复绑定相同／不同 hooks | 相同绑定幂等；不同 owner 被明确拒绝且原周期不变 |
| 等待去重 | 多轮启停，目标 tag 始终未定义 | 同一 tag 的原生完成入口不随启停次数增长，取消订阅无功能回调残留 |
| IIFE 重执行 | 关闭第一轮后重新求值页面 bundle 并启用 | 评论 effect 不重复安装且旧周期订阅被撤销，CE 等待按 IIFE 独立去重，新旧订阅 ownership 互不干扰 |
| 局部暂缺 | tag 已定义但 controller 方法尚未可用 | 当前能力跳过或等待显式核对，其他 patch 继续，无 timer 重试 |
| 重复安装 | apply、flexy 核对与 replay 重复触发 | 原型函数不多重叠加，原生调用次数保持一次 |
| 写入失败 | 同一 tag 某方法写入抛错 | 该项及后续项跳过并记录 diagnostic，已写入项保持登记并在 restore 时恢复，其他 tag 保留 |
| 描述符 | 原方法为继承方法或有特定属性标志 | 恢复后 own property 形状、属性标志与原函数身份符合安装前状态 |
| 第三方修改 | 安装后同方法被其他脚本替换 | restore 保留第三方修改；旧安装函数被保留引用时只委托原生 |
| 恢复异常 | 某一方法恢复失败 | 后续方法与 disposer 仍处理，diagnostic 说明失败项 |
| 同步重入 | semantic hook 内触发 replay／restore | 同一 attachment 不重复创建，迟到返回的 disposer 立即清理 |
| attached 重复 | 同一元素重复 attached 后再 detached | 有效 attachment 只有一项，其 disposer 只执行一次 |
| 静态与迟到重放 | 启动已重放元素，之后该 tag 安装完成 | 局部 replay 不重复建立已有资源 |
| route 暂停 | 离开 Watch 后 tag 才完成 | 原型可安装，但不创建旧路由 DOM 标记、镜像或 attachment |
| route 恢复 | Home → Watch，复用已连接元素 | 使用新 context 重放，旧 attachment 不越过暂停周期 |
| 数据通知 | 评论反复启停后多次变更 data | 同一 prototype effect 只注册一次，只有当前周期处理通知 |
| effect 失败 | 注册 effect 时抛错，副作用无法确定 | 保持空闲 adapter，不自动重复注册，其他评论方法可继续工作 |
| 聊天可见 | IntersectionObserver 先满足条件 | timer 立即清除，observer 断开，原生调用一次 |
| 聊天超时 | 可见性未满足，到达既有上限 | observer 与 timer 释放，当前原生调用一次 |
| 聊天被替代 | 等待中再次 urlChanged／frame 替换 | 旧记录取消，迟到回调不执行旧原生请求 |
| 功能关闭 | 当前聊天请求仍最新且宿主有效 | 取消增强等待并立即交还原生一次，之后迟到通知不重复执行 |
| 路由变化 | 聊天等待中页面 URL 已变化 | 旧视频请求被丢弃，未留下 observer／timer |
| 原生语义 | hook 被正常调用与被失效引用调用 | `this`、参数、返回值及适用的异常传递保持；增强副作用只发生于有效周期 |
| 启动失败 | coordinator 同步初始化整体抛错 | owner 与 session 完成清理，页面不发送成功 READY |
| 同步关闭 | 页面在注入栈内关闭 session | setup 仍返回稳定 Promise，并向 caller 拒绝，而非返回 null |
| 重复清理 | restore、route clear 与 detach 交叉重复 | disposer／操作幂等结算，不复活任何功能资源 |

### 13.1 测试文件

- [polymer-patcher.test.ts](../src/features/tabview/page/__tests__/polymer-patcher.test.ts)：保留已有 attached/detached、prune、逆序恢复与 skeleton 过滤测试，增加上述时序和描述符行为。
- 新增 `src/features/tabview/page/__tests__/polymer-helper.test.ts`：从 retrieveCE interface 验证取消、共享等待、无效 tag、异常、已定义快速路径与实例解析。
- [coordinator.test.ts](../src/features/tabview/page/__tests__/coordinator.test.ts)：提供符合实际层级的 flexy 与页面 fixture，验证 route context、宿主复用及暂停后的迟到安装。
- [session-ownership.integration.test.ts](../src/features/tabview/__tests__/session-ownership.integration.test.ts)：使用可控 CE 完成顺序驱动真正 page main，验证 READY 与 teardown 的联合行为；至少一项用例重新求值页面 bundle，覆盖新 IIFE 与 prototype 上既有 adapter 记录的共存。
- [setup.test.ts](../src/features/tabview/__tests__/setup.test.ts)与 [session.test.ts](../src/features/tabview/__tests__/session.test.ts)：保留启动失败、关闭和重新启用的协议保护。

### 13.2 测试设施与证据边界

CE 的原型安装单测使用 deferred Promise 控制时序，避免依赖任意次数的 `await Promise.resolve()` 推测安装已经完成。测试可观察安装方法的行为变化，或等待测试自己控制的完成通知，不为此增加 production getter。

PolymerHelper 单测需有一组测试直接覆盖原生等待与取消，不能全部 mock 掉 retrieveCE。真实 CustomElementRegistry 的 tag 定义无法在同一 registry 内撤回，且页面端等待入口为 module 静态、在同一测试文件内共享；fixture 一律使用用例内唯一的测试 tag 隔离状态，不为测试暴露 reset 入口，也不引入可注入 registry 参数。

现有 session 集成 fixture 重复调用同一个导入的 page main，不能单独证明跨 IIFE 去重。新增验证必须使用两个独立求值的页面端实例共享同一个测试 window／registry；重新求值前 stub 掉 `setupConfigHacks` 的全局副作用或确认其幂等，避免双重求值引入测试外的 `window.yt` 变更。用例结束后删除 prototype 上由测试创建的 adapter Symbol 键记录。

FakeIntersectionObserver 不会自动模拟浏览器的布局可见性。测试显式发送 entries，使用 fake timers 验证清理；最终还需实际浏览器验证 iframe 和 Polymer 的行为。

功能引用释放通过订阅取消、回调次数、资源集合与 observer/timer 计数断言。垃圾回收时点不稳定，不以强制 GC 或“立即被回收”作为单测通过条件。

## 14. 性能、资源与端到端验收

### 14.1 可观察资源要求

| 状态 | 资源要求 |
| --- | --- |
| tag 尚未定义 | 固定 tag 数量内的共享原生等待入口；当前周期持有可取消订阅；没有 CE 等待 timer 或轮询 |
| 已安装且页面闲置 | 不因安装管理产生周期性任务；现有领域观察按其自身契约运行 |
| 聊天增强等待 | 每个实例最多一个有效等待，持有至多一个 timer 与一个 IntersectionObserver |
| route 停用 | 当前 route attachment 与聊天等待归零；原型安装周期可继续存在 |
| restore 完成 | 周期 hooks、功能订阅、DOM 引用、attachment 与增强等待归零；可逆方法按 ownership 恢复 |
| 页面生命周期剩余资源 | IIFE 内空订阅 CE 等待入口与 prototype 上的空闲评论 adapter；数量不随功能启停次数增加，不保留失效功能闭包 |

这些指标限定于本方案拥有的资源，不能通过全页面 observer 总数推断 patcher 是否泄漏。

### 14.2 实施阶段命令

```powershell
pnpm check
pnpm exec vitest run src/features/tabview/page/__tests__/polymer-helper.test.ts src/features/tabview/page/__tests__/polymer-patcher.test.ts src/features/tabview/page/__tests__/coordinator.test.ts src/features/tabview/__tests__/session-ownership.integration.test.ts src/features/tabview/__tests__/setup.test.ts src/features/tabview/__tests__/session.test.ts
pnpm build
```

以上是实施后的验收要求，不代表本轮已经执行或通过。

构建后将 userscript 载入 Tampermonkey／Violentmonkey，完成以下真实 YouTube 验证：

1. 普通视频、直播、播放列表与晚出现的评论／互动面板中，检查启动 READY、现存元素重放和迟到 tag 安装。
2. 在目标能力加载前关闭 Tabview，再重新开启，确认旧任务不安装或调用新周期 hooks。
3. Watch → Home → Watch 与 Watch A → Watch B 往返，核对复用宿主、评论计数、推荐列表和聊天请求。
4. 聊天 iframe 等待中切换页面、更新 URL 或关闭功能，核对原生调用次数与 timer／observer 释放。
5. 反复启停后触发评论 data 变化，确认 effect 注册次数稳定，停用时没有功能处理或旧闭包驻留。
6. 验证原型描述符恢复、页面原生操作与其他脚本改写共存，并记录任何实际恢复冲突。

## 15. 完成标准

完成后，coordinator 只负责当前 route 的激活、context 传递和停用，PolymerPatcher 统一保障每项安装及其副作用的有效周期。`suspendRoute()` 与 `replayConnected(context)` 构成 coordinator 与 patcher 之间的完整路由接口，既有文档中的无参 `replayConnected()` 表述视为已按 4.3 节修订。READY 保持同步初始化语义，迟到 tag 通过局部 replay 接入当前页面，恢复后旧周期失去所有增强能力。

交付包括定向测试、类型检查、页面端 IIFE 构建结果、真实 YouTube 验证记录，以及明确区分可逆方法和页面生命周期 adapter 的资源说明。文档与注释只描述最终契约，不记录试错或废弃设计。
