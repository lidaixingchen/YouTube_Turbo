# 观察边界收敛方案实施审计报告

> 审查对象：[observation-boundary-hardening-plan.md](observation-boundary-hardening-plan.md)  
> 审查基准：TypeScript 严格模式、架构红线、终态无痕原则、验收矩阵全项覆盖。  
> 审查结论：**审查通过**。五项遗留边界全部按方案完成收敛落地，架构红线与对外契约严格保持，全量 28 个测试文件、237 项测试通过，严格模式类型检查零报错，生产打包构建一致。

---

## 1. 五项边界收敛实施对齐审查

### 1.1 第 1 项：`ReactiveDOMRegistry.waitForVideoElement` 发现根有界化与共享抽取

- **实现对齐**：
  - 新建 [scoped-discovery.ts](../src/core/scoped-discovery.ts)，统一收敛 `detectRouteKind`、`resolveRoutePageRoot`、`resolveActiveMiniplayerHost`、`resolveRouteScope`，彻底杜绝路由解析和保留页过滤逻辑的双份维护；
  - 路由与页面容器常量由 `src/ui/toolbar/constants.ts` 迁入 [core/constants.ts](../src/core/constants.ts)，总线与注册表共用；
  - [dom-registry.ts](../src/core/dom-registry.ts) 彻底移除了原先落在 `getPlayerContainer()`、`document.body`、`document.documentElement` 与 `#content` 的宽泛回退链，严格对齐有限发现根表（路由页面容器 → 活跃迷你播放器宿主 → `#page-manager` 直子加 `hidden` 属性观察）；
  - 选择器拆解为优先级列表 `SELECTORS.VIDEO_ALTERNATIVES`，作用域命中 `scopedHit` 与全局 `getVideoElement()` 以及超时收敛共用 `queryVideoElement` 单步遍历求值，Shorts 下激活 reel 具有绝对优先级，避开原生 `querySelector` 文档序缺陷；
  - 支持两阶段收缩：在 `#page-manager` 发现页面容器后，在同一等待窗口内将观察根无缝收窄至页面容器，沿用原截止时间；
  - 在非视频路由（`kind === "other"`）且无活跃迷你播放器时，不建立任何观察器，直接等待超时后安全收敛。
- **审查判定**：**符合设计**。

### 1.2 第 2 项：`isSelfOwnedMutation` 自写突变过滤精化

- **实现对齐**：
  - [slot-mount-bus.ts](../src/ui/toolbar/slot-mount-bus.ts) 中 `ownedElements` 存储结构由 `WeakSet<HTMLElement>` 升级为 `WeakMap<HTMLElement, SlotRecord>`，保存自有节点到归属插槽记录的引用；
  - 过滤判定升级为双重严格约束：
    1. 全部 `movedNodes` 均归属于总线；
    2. 突变目标节点 `mutation.target` 必须位于所有移动节点所属记录的容器作用域并集内（`scope.contains(mutation.target)`）；
  - 任一节点无归属或其 `record.container` 为 `null` 时直接返回 `false`（保守唤醒，宁可空转一次，绝不漏唤醒）；
  - 宿主外迁移（如元素被意外搬移出原本容器）不再被判定为自写，等待中的插槽被即刻唤醒并重新协调。
- **审查判定**：**符合设计**。

### 1.3 第 3 项：`resolveExposedElement` 防御纵深

- **实现对齐**：
  - [slot-mount-bus.ts](../src/ui/toolbar/slot-mount-bus.ts) 的 `resolveExposedElement` 在原有校验基础上追加 `record.element.isConnected` 判断；
  - 处于游离状态（已断连）的元素一律返回 `null`，使“返回当前挂载的 `HTMLElement`”契约在字面意义上恒真，补齐了状态已清理但未及时重挂窗口下的防御纵深。
- **审查判定**：**符合设计**。

### 1.4 第 4 项：`#page-manager` 属性观察与选项并集

- **实现对齐**：
  - 观察描述由简单布尔重构为结构化规格 `ObservationRootSpec` 与内部汇总记录 `ObservationRootInfo`，支持 `subtree`、`attributes` 与 `attributeFilter`（`ReadonlySet<string>`）；
  - 多插槽同根合并时，`subtree` 取或、`attributes` 取或、`attributeFilter` 取并集；
  - 签名计算函数 `computeObservationSignature` 纳入 `attributes` 与排好序的属性过滤指纹，确保选项增减能准确破坏签名并触发换绑；
  - `#page-manager` 根启用 `{ childList: true, subtree: false, attributes: true, attributeFilter: ["hidden"] }`，保留页揭示时准确触发唤醒；
  - 保留并测试了迷你播放器宿主优先时的残余边界（保留页解除 `hidden` 不可见，由后续路由或数据事件按恢复时机兜底）。
- **审查判定**：**符合设计**。

### 1.5 第 5 项：目标选择器优先级解析

- **实现对齐**：
  - [slot-mount-bus.ts](../src/ui/toolbar/slot-mount-bus.ts) 的 `resolveTarget` 将 `definition.targetSelector` 按逗号切分，剔除空白与空项，依次在容器内执行 `querySelector`；
  - 命中即返回，确保书写在前面的目标选择器（如 `#top-level-buttons-computed`）在文档序劣后时也能优先被选中，彻底解除了插槽挂载位置对 DOM 排列顺序的脆弱依赖。
- **审查判定**：**符合设计**。

---

## 2. 架构红线与代码规范审查

| 审查维度 | 规范要求 | 审查结果 |
| --- | --- | --- |
| 禁用根红线 | 严禁向 `document.body`、`document.documentElement` 建立全局无边界 MutationObserver，禁止使用 `#content` | **通过**。全仓静态 grep 无任何违反；`waitForVideoElement` 回退链已收敛至受限发现根表。 |
| 停机与零轮询 | 挂载就绪即停机，无常驻守护定时器，无合法根不建观察器 | **通过**。发现根缺失时 observer 置 null；两阶段收缩重用截止定时器；插槽就绪后 observer 完全断开。 |
| 作用域隔离与静默锁 | 监听收敛于局部，写 DOM 过程避免自触发突变风暴 | **通过**。`isSelfOwnedMutation` 精确覆盖单写与并集多写；观察全部绑定在具体容器或 page-manager 直子。 |
| 终态无痕原则 | 严禁体现试错痕迹，严禁包含版本演进/历史修改/修复注释，严禁负向命名 | **通过**。代码注释仅解释业务逻辑与边界条件，无任何沟通与试错残留。 |
| TypeScript 严格模式 | 显式标注所有变量、入参及返回值类型，严禁隐式 any，禁止魔法数字与硬编码 | **通过**。严格模式检查 0 错误，所有局部变量与函数入参均具备显式类型声明；常量统一收敛至 `constants.ts`。 |
| 相对路径引用 | 模块导入严禁使用绝对路径，文档链接使用相对路径 | **通过**。全量使用相对路径，无绝对路径硬编码。 |

---

## 3. 验收矩阵对照复核

对照方案 §6 验收矩阵，复核结果如下：

| 序号 | 类别 | 场景与预期 | 验证状态 | 测试用例/覆盖落位 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 有界根选取 | `/watch` 且存在保留页，仅命中非隐藏页面容器 | 已通过 | `src/core/__tests__/scoped-discovery.test.ts` / `src/core/__tests__/dom-registry.test.ts` |
| 2 | 作用域命中 | 根子树内插入视频，按优先级命中、写入 WeakRef 缓存并 resolve | 已通过 | `src/core/__tests__/dom-registry.test.ts` (`observes the route page root...`) |
| 3 | 相邻 reel | Shorts 树内存在未激活 reel 视频，优先命中 `[is-active]` reel | 已通过 | `src/core/__tests__/dom-registry.test.ts` (`prefers the active reel video...`) |
| 4 | 根收缩 | page-manager 发现页面容器，观察根收窄至容器，截止时间不变 | 已通过 | `src/core/__tests__/dom-registry.test.ts` (`discovers the page container from page-manager...`) |
| 5 | 属性唤醒 | 保留页容器解除 `hidden`，属性突变唤醒等待槽并完成挂载 | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` (`wakes attribute-driven waits...`) |
| 6 | 迷你播放器并存 | 容器缺失但迷你播放器存在，保留页解除不唤醒，由路由事件兜底 | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` (`leaves hidden reveal unobserved...`) |
| 7 | 选项并集 | 多插槽共用 page-manager，合并为一个 observer 且选项与签名取并集 | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` (`merges concurrent page-manager waiters...`) |
| 8 | 自写过滤 | 插槽 mount 写入自有容器，不产生自维持微任务链 | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` 既有与新增过滤套件 |
| 9 | 重建唤醒 | 宿主重建伴随非自有节点增删，等待槽正常唤醒并挂载 | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` 既有宿主重建用例 |
| 10 | 搬移边界 | 仅搬移自有元素且落在归属作用域内，不触发冗余唤醒 | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` (`does not wake waiters when a mounted own element is merely moved...`) |
| 11 | 搬移出界 | 等待窗口内自有元素被搬移至归属作用域外，正确唤醒重新协调 | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` (`wakes pending waiters when a mounted own element is migrated...`) |
| 12 | 返回防线 | 空闲期宿主拆除后调用 `refreshSlot`，返回重挂新节点，无法就绪返回 `null` | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` (`never exposes a detached element...`) |
| 13 | 目标优先级 | `#owner` 在 DOM 序先于按钮容器，依然命中书写顺序首位的按钮容器 | 已通过 | `src/ui/toolbar/__tests__/slot-mount-bus.test.ts` (`resolves metadata targets by selector priority...`) |
| 14 | 禁用根 | 全局搜索 MutationObserver 观察目标，无 body/documentElement/#content | 已通过 | 全仓静态 grep 确认 |
| 15 | 回归保障 | 既有核心特性（播放器解耦、倍速弹窗、工具栏动作集成等）零回归 | 已通过 | 全量 28 个测试文件（237 个测试用例）全部通过 |

---

## 4. 自动化验证记录

### 4.1 TypeScript 严格模式检查

```powershell
pnpm check
$ tsc --noEmit
# 退出代码：0，无任何类型错误
```

### 4.2 单元与集成测试运行

```powershell
pnpm exec vitest run
# Test Files  28 passed (28)
# Tests       237 passed (237)
# 耗时：约 11 秒，全用例无顺序依赖通过
```

### 4.3 生产构建打包

```powershell
pnpm build
# vite v6.4.3 building for production...
# dist/youtube-turbo.user.js  484.60 kB │ gzip: 110.04 kB
# built in 743ms
```

---

## 5. 架构决策记录同步

在 [ADR-0005](adr/0005-unified-slot-mount-bus.md) 中已补充记录第 6 条决议：
- 将注册表等待观察纳入同源发现根表；
- 明确移除 `document.body` / `document.documentElement` / `#content` 回退；
- 确立 `src/core/scoped-discovery.ts` 作为路由识别与容器解析的统一单源。
