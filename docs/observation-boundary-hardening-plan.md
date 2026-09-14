# 观察边界收敛方案（SlotMountBus 深化的遗留边界处置）

> 状态：设计与实施方案。本文承接 [SlotMountBus 架构深化方案](slot-mount-bus-architecture-deepening-plan.md) 交付时显式记录为"已知边界（未改）"的五项遗留问题，逐项给出根因、解决方案、文件落位与验收标准。

## 1. 目标与适用范围

深化方案交付后，以下五项被判定为可接受的已知边界而暂缓处理：

1. `ReactiveDOMRegistry.waitForVideoElement` 的发现根回退链最终落在 `document.body || document.documentElement` 并以 `subtree: true` 观察，触碰"严禁向 body/documentElement 建立全局无边界 MutationObserver"红线；
2. `isSelfOwnedMutation` 以"全部移动节点均为自有元素"判定自写突变，理论上可把 YouTube 搬移自有元素的突变误判为自写；
3. `resolveExposedElement` 不校验 `isConnected`，返回路径存在游离节点的极端窗口；
4. `#page-manager` 直子观察（`subtree: false`）无法感知保留页容器经 `hidden` 属性切换而"出现"的早载场景；
5. 元数据插槽的 `targetSelector` 多选器经 `querySelector` 按**文档序**而非选择器优先级命中，目标选择依赖真实 DOM 的节点排列。

本方案逐项处置五项边界：第 1 项以共享发现根抽取 + 注册表有界观察根治；第 2、3、5 项以小步精确化修复；第 4 项以受约束的属性观察补齐 page-manager 兜底路径——页面容器缺失但迷你播放器宿主存在时 `hidden` 切换在本等待窗口仍不可见，该残余收敛至深化方案 §6.3 同级的恢复边界（路由事件兜底）并钉入验收矩阵。每一项均配套可观察断言。实施范围限于 `src/core/` 与 `src/ui/toolbar/` 的观察与解析路径；插槽对外契约（状态机、三态语义、预算窗口、恢复时机）保持不变，可观察行为变化仅限两处已声明的边界修复：§3.4 的返回防线把游离边返回值由游离节点收敛为 `null`（向深化方案 §4.1"返回当前挂载的 `HTMLElement`"文字契约对齐），§3.6 的目标命中由文档序改为书写优先级（既有定义的意图行为）。

## 2. 现状事实与影响面

以下结论基于当前 `main` 分支源码的静态核对。

| 事项 | 现状 | 真实影响 |
| --- | --- | --- |
| `waitForVideoElement` 回退 | [dom-registry.ts](../src/core/dom-registry.ts) 的回退链为 `getPlayerContainer()` → `querySelector("ytd-player, #player, #player-container, #player-container-outer, #content")` → `document.body` → `document.documentElement`；观察回调对每批突变执行全局 `getVideoElement()` 重查 | 生产调用方仅 `PlayerController.syncVideoOnNavigate`（controller.ts:184）一处，影响面收敛；触碰红线且 `#content` 在 [ADR-0005](adr/0005-unified-slot-mount-bus.md) §4.2 的禁用清单内 |
| `isSelfOwnedMutation` | [slot-mount-bus.ts](../src/ui/toolbar/slot-mount-bus.ts) 判定条件为"全部 added/removed 节点 ∈ `ownedElements`" | YouTube 宿主重建必然伴随其自有节点增删（非自有），故重建批次不会被整体过滤；纯"仅搬移自有元素"的批次被过滤后，mounted 槽本就不受观察、由下一次协调惰性修复（§6.3 已文档化）。残余风险是意图精度而非功能缺陷 |
| `resolveExposedElement` | 直接返回 `record.element`，不查 `isConnected` | `refreshSlot` / `mountSlot` 的同步协调已具备访问时修复（mounted 校验失败即释放重挂），返回路径的游离窗口近乎不可达；属防御纵深缺口 |
| page-manager 直子观察 | `resolveWaitSpec` 的兜底根为 `{ subtree: false }` 的 childList 观察 | `ytd-watch-flexy` / `ytd-shorts` 是被复用的持久节点，早载场景中页面容器多以 `hidden` 属性**解除**的方式"出现"；childList 不投递属性突变，该窗口完全依赖路由事件兜底 |
| 元数据目标文档序 | `resolveTarget` 以整个 `targetSelector` 做一次 `container.querySelector` | 若 `#owner` 在文档序中先于 `#top-level-buttons-computed` 出现，优先级最高的目标反而落选，插入位置分支随之错位；正确性依赖未经验证的节点排列假设 |

## 3. 解决方案

### 3.1 共享发现根抽取（第 1 项的前置）

路由页面容器、迷你播放器宿主、`hidden` 保留页排除约定与 `#page-manager` 是 YouTube DOM 域事实，目前收敛在 `TOOLBAR_CONSTANTS` 并由 `SlotMountBus` 独占实现。注册表有界化需要同一套策略，不应复制第二份。

新增 `src/core/scoped-discovery.ts`：

```typescript
export type YouTubeRouteKind = "watch" | "shorts" | "other";

export function detectRouteKind(pathname: string): YouTubeRouteKind;
export function resolveRoutePageRoot(): HTMLElement | null;
export function resolveActiveMiniplayerHost(): HTMLElement | null;
export function resolveRouteScope(): HTMLElement | null;
```

- 路由前缀（`/shorts`、`/watch`）、页面容器选择器（`ytd-watch-flexy`、`ytd-shorts`）、迷你播放器宿主选择器、`RETAINED_PAGE_EXCLUSION`、`PAGE_MANAGER_ID` 自 `TOOLBAR_CONSTANTS` 迁移至 [core/constants.ts](../src/core/constants.ts)，`TOOLBAR_CONSTANTS` 中的对应条目删除；总线、[toolbar.ts](../src/ui/toolbar/toolbar.ts) 的插槽定义（`isApplicable` 的路由前缀判断与 Shorts `containerSelector`）及测试同步改引；
- `resolveRoutePageRoot()` 内置既有的一次性诊断告警（路由命中 `/watch`|`/shorts` 但无已连接非隐藏页面容器时 `console.warn` 一次，解析恢复后复位）——总线现有告警语义原样上移，注册表免费获得同等可观测性；
- `SlotMountBus` 的 `resolvePageRoot` / `resolveMiniplayerHost` / `resolveRouteScope` 改为委托共享模块，行为由既有 33 项总线测试守护，不发生可观察变化。

### 3.2 `waitForVideoElement` 有界观察（第 1 项）

注册表的等待观察改为与 ADR-0005 §4.2 一致的有限发现根表，**删除** `document.body`、`document.documentElement` 与 `#content` 回退：

1. 静态命中不变：先 `getVideoElement()`，命中立即 resolve；
2. 发现根选取：当前路由页面容器（watch / shorts，排除 `[hidden]`）→ 活跃迷你播放器宿主 → 若页面容器缺失且 `#page-manager` 存在，观察其直接子节点（`childList: true, subtree: false`，并含 `hidden` 属性观察，见 §3.5），用于发现路由页面容器；
3. 观察回调**作用域化优先级命中**：`SELECTORS.VIDEO` 拆分为选择器列表（`ytd-reel-video-renderer[is-active] video` → `#movie_player video` → `video.video-stream` → `video`），对当前观察根**按书写顺序逐项求值**——`querySelector` 对逗号列表按文档序而非选择器优先级命中，逐项求值才使"`[is-active]` reel 最先"成为真实机制而非文档序巧合；`getVideoElement()` 静态命中与超时收敛共用同一求值路径，三处命中语义一致。命中且已连接时写入既有 `WeakRef` 缓存（保持 O(1) 快路径一致）后 resolve，不再对每批突变执行全局选择器重查。不得退化为裸 `"video"` 或整串 `querySelector`：Shorts 虚拟列表同时保留相邻 reel，文档序首个 `video` 可能是非激活 reel，会把 `PlayerController` 的媒体事件监听绑到错误节点；
4. 两阶段收缩：发现根为 `#page-manager` 且页面容器就绪后，在同一等待窗口内把观察根收窄为页面容器，沿用原截止时间；
5. 无合法发现根时不建立观察，直接等待超时后按既有语义 resolve `getVideoElement()` 结果——这与总线"根全部缺失 → 零 observer、事件恢复"的边界一致，且 `waitForVideoElement` 的生产调用方（播放器快捷同步）只关心 watch / shorts / 迷你播放器三类场景，其余路由正确地以 null 收敛。

现状第一发现根 `getPlayerContainer()`（无作用域全局缓存）被上述根表**有意取代、不保留**：唯一生产调用方 `syncVideoOnNavigate` 在等待前已 `invalidateCache()`，页面容器与迷你播放器宿主子树覆盖其全部有效命中场景，继续引用全局缓存会重新引入与 ADR-0005 §4.2 根表不一致的宽根。

时间预算（`timeoutMs`）保持不变；`Promise` 一次性 resolve 与 cleanup 顺序不变。

### 3.3 自写突变过滤精化（第 2 项）

`ownedElements` 从 `WeakSet<HTMLElement>` 升级为 `WeakMap<HTMLElement, SlotRecord>`，保留节点到归属记录的映射；`isSelfOwnedMutation` 收紧为双重条件：

1. 全部 added/removed 节点均归属总线（既有条件）；
2. 突变目标位于该 MutationRecord 内全部 moved 节点所属记录的插入作用域**并集**内（每个归属记录的 `record.container` 子树，含 `target.after` 兄弟插入落点）；任一归属记录的 `record.container` 为 `null`（已释放）时按不在作用域内处理——过滤方向恒保守，宁可唤醒后由协调空转一次，不可漏唤醒。

由此：

- 总线自身的 mount / 释放写入（落点恒在自有容器内）继续被过滤，无自维持微任务链的既有保证不变；工具箱与倍速插槽共享播放器容器，同批双写落点同属一个容器，并集判定天然覆盖；
- YouTube 宿主重建批次因伴随其自有节点增删，不满足条件 1，照常唤醒等待槽；
- 纯"仅搬移自有元素且落点在归属作用域内"的批次被过滤后，mounted 槽由 `container.contains(element)` 校验在下一次协调惰性修复；落点在作用域外的搬移（宿主迁移）不再被过滤，等待窗口内的 pending 槽照常唤醒——该残余场景与 §6.3 恢复边界一致，本方案补测试钉死而非强行消除。

### 3.4 `resolveExposedElement` 防御纵深（第 3 项）

返回前追加 `record.element.isConnected` 校验：断连即返回 `null`，使"返回当前挂载的 `HTMLElement`"契约在字面意义上恒真（已连接或 null）。记录状态不因该防线改变——修复仍由下一次协调的 mounted 校验驱动。

可达性事实：三个返回路径（`mountSlot`、`refreshSlot`、初次注册）均先同步执行 `coordinateSlots`，协调复用与提交路径已校验 `isConnected` 与 `container.contains`，"`mounted` 且元素断连"经公共入口不可构造。该防线是不依赖公共可观察行为的 invariant hardening，保留成本近零；游离边由游离节点收敛为 `null` 是向深化方案 §4.1 契约的对齐（见 §1）。

测试钉死的是既有修复语义（不带防线同样成立）：空闲期宿主拆除后调用 `refreshSlot`，返回的是**重新挂载的新元素**而非游离节点；协调无法就绪时返回 `null` 且 `isSlotPending` 语义不变。防线的游离边收敛本身经公共 API 不可观察，不单列断言，由 §6"返回防线"行守护修复语义。

### 3.5 page-manager 属性观察与选项并集（第 4 项）

观察选项从单一 `subtree` 布尔升级为结构化描述：

```typescript
interface ObservationRootSpec {
  readonly node: Node;
  readonly subtree: boolean;
  readonly attributes: boolean;
  readonly attributeFilter: ReadonlySet<string>;
}
```

- 同节点去重合并时，`subtree` 与 `attributes` 取或，`attributeFilter` 取并集；`computeObservationSignature` 同步纳入 attributes 标志与 filter 指纹，防止"仅选项变化"的换绑被签名短路；
- page-manager 兜底根的选项变为 `{ childList: true, subtree: false, attributes: true, attributeFilter: ["hidden"] }`：保留页容器解除 `hidden` 时投递 attributes 突变，`handleMutations` 按 target 归属照常标 dirty（属性记录无增删节点，天然不满足自写过滤），下一微任务重解析 `resolveRoutePageRoot()` 即完成挂载；
- 其余发现根（自有容器、路由页面容器、迷你播放器宿主）维持纯 childList + subtree，不引入属性观察，观察面不扩大；
- 残余边界（有意接受）：发现根顺序为页面容器 → 迷你播放器宿主 → page-manager，页面容器缺失但迷你播放器宿主存在时，观察根是迷你播放器（纯 childList），保留页 `hidden` 解除在本等待窗口不可见，由路由事件、`yt-page-data-updated` 或显式刷新按既有恢复时机兜底。属性观察仅覆盖 page-manager 兜底路径；该残余与深化方案 §6.3 恢复边界同级，以 §6"迷你播放器并存"行钉死，不为此扩大观察面。

### 3.6 目标选择器优先级解析（第 5 项）

`resolveTarget` 从单次整体 `querySelector` 改为按选择器列表逐项求值：

```typescript
const selectors: string[] = definition.targetSelector
  .split(",")
  .map((part: string): string => part.trim())
  .filter((part: string): boolean => part.length > 0);
for (const selector of selectors) {
  const found: HTMLElement | null = container.querySelector<HTMLElement>(selector);
  if (found) {
    return found;
  }
}
return null;
```

对全部插槽通用化生效：目标命中顺序由定义中的选择器书写顺序决定，不再受文档序支配；`#top-level-buttons-computed → #actions-inner → #actions → #owner` 的既有优先级意图首次成为可测试契约。空选择器段（尾随或连续逗号）过滤后跳过，避免 `querySelector("")` 抛出 `SyntaxError`。真实 DOM 的节点排列核对仍保留在深化方案 §12.2 的端到端清单中，但机制层面不再以其为正确性前提。`containerSelector` 维持整体 `querySelector`——当前定义中容器选择器列表是同一容器的等价拼法（`PLAYER_CONTAINER` 的 `#movie_player` 与 `#player-container-outer .html5-video-player` 在真实 DOM 中命中同一节点）。该等价是 DOM 现状使然而非机制保证：若未来两分支命中不同节点，`containerSelector` 须同样改为逐项求值并补对应契约测试。

## 4. 文件落位

| 文件 | 内容 |
| --- | --- |
| `src/core/scoped-discovery.ts` | 新增：路由识别、页面容器 / 迷你播放器宿主解析、一次性诊断告警 |
| `src/core/constants.ts` | 迁入路由前缀、页面容器选择器、迷你播放器选择器、保留页排除、page-manager id |
| `src/core/dom-registry.ts` | `waitForVideoElement` 有界观察、作用域命中写入缓存、两阶段收缩；`getVideoElement` 与作用域命中共用逐项优先选择器求值 |
| `src/ui/toolbar/slot-mount-bus.ts` | 发现根委托共享模块；观察选项结构化与并集；自写过滤精化；`resolveExposedElement` 防线；`resolveTarget` 优先级解析 |
| `src/ui/toolbar/toolbar.ts` | 插槽定义改引迁移后的 core 常量（`isApplicable` 路由前缀、Shorts `containerSelector`） |
| `src/ui/toolbar/constants.ts` | 删除已迁移条目 |
| `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` | 选项并集、属性观察、过滤精化、返回防线的用例；既有断言改引新常量来源 |
| `src/core/__tests__/scoped-discovery.test.ts` | 新增：路由识别与根解析（含 `[hidden]` 排除、告警一次性） |
| `src/core/__tests__/dom-registry.test.ts` | 新增：有界观察根、作用域命中（含相邻 reel 优先级）、无合法根超时收敛 |
| `docs/adr/0005-unified-slot-mount-bus.md` | 完成时补记注册表等待观察纳入同一发现根表 |

## 5. 实施阶段

| 阶段 | 内容与完成条件 |
| --- | --- |
| A：共享抽取 | `scoped-discovery.ts` 落地，总线委托后既有 33 项总线测试与全量回归零变化 |
| B：注册表有界化 | `waitForVideoElement` 按发现根表观察与作用域命中；`player-features-decoupling` 等既有测试零回归 |
| C：总线精确化 | 选项并集 + 属性观察、自写过滤精化、`resolveExposedElement` 防线、目标优先级解析 |
| D：回归验证 | `pnpm check`、全量 vitest、`pnpm build` 通过；随机顺序运行无顺序依赖 |

阶段内每步运行：

```powershell
pnpm check
pnpm exec vitest run src/core/__tests__/scoped-discovery.test.ts src/core/__tests__/dom-registry.test.ts src/ui/toolbar/__tests__/slot-mount-bus.test.ts src/ui/toolbar/__tests__/toolbar-actions.integration.test.ts src/features/player/__tests__/speed-feature.integration.test.ts src/features/player/__tests__/speed-popover-hover.test.ts
pnpm build
```

## 6. 验收矩阵

| 类别 | 输入场景 | 可观察结果 |
| --- | --- | --- |
| 有界根选取 | `/watch` 且 `ytd-watch-flexy[hidden]` 保留页并存 | 只命中非隐藏页面容器 |
| 作用域命中 | 观察根子树内插入 `video` | 按 `SELECTORS.VIDEO` 优先级命中、写入缓存并 resolve，不发起全局 `querySelector` |
| 相邻 reel | `ytd-shorts` 子树内存在非激活 reel 的 `video` | 命中 `[is-active]` reel 的 video，不误绑相邻节点 |
| 根收缩 | page-manager 兜底发现页面容器 | 观察收窄至页面容器，截止时间不变 |
| 属性唤醒 | 保留页容器解除 `hidden` | attributes 突变唤醒等待槽并完成挂载 |
| 迷你播放器并存 | 页面容器缺失且迷你播放器宿主存在，保留页解除 `hidden` | 本窗口不可见；由路由事件 / `yt-page-data-updated` / 显式刷新按既有恢复时机完成挂载 |
| 选项并集 | 两插槽共享 page-manager 根、需求不同 | 单 observer、选项取并集、签名反映选项 |
| 自写过滤 | mount 写入自有容器 | 不产生自维持微任务链（既有保证不回退） |
| 重建唤醒 | YouTube 重建宿主并搬移自有元素（批次含非自有节点） | 等待槽被唤醒并完成挂载 |
| 搬移边界 | 批次仅含自有元素且落点在归属作用域内 | 不唤醒；mounted 槽由下一次协调惰性修复 |
| 搬移出界 | 等待窗口内批次仅含自有元素但落点在归属作用域外 | 唤醒受影响 pending 槽并重新协调 |
| 返回防线 | 空闲期宿主拆除后 `refreshSlot` | 返回重挂的新元素；无法就绪时返回 `null` |
| 目标优先级 | `#owner` 在文档序中先于 `#top-level-buttons-computed` | 命中书写顺序首位的选择器 |
| 禁用根 | 全局搜索观察根 | `document` / `body` / `documentElement` / `#content` 不出现于任何观察目标 |
| 回归 | 既有 186 项测试 | 全部通过且无顺序依赖 |

## 7. 完成定义

- 五项边界全部按 §3 落地或被可执行断言钉死；`grep` 全仓不再出现以 `document.body` / `document.documentElement` / `#content` 作为 MutationObserver 观察目标的代码路径；
- 插槽对外契约（三态语义、预算窗口、恢复时机）零变化；可观察行为变化仅限 §1 声明的两处边界修复（§3.4 游离边返回值、§3.6 目标命中优先级）；
- `pnpm check`、全量 vitest、`pnpm build` 通过，随机顺序运行稳定；
- 真实 DOM 的元数据节点排列与保留页 `hidden` 行为按深化方案 §12.2 在 YouTube 桌面端完成最终核对并记录。
