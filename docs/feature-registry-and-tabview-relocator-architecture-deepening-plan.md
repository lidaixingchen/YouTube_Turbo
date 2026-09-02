# YouTube Turbo – 特性注册表与标签页重排器架构深化方案

本方案基于 **Codebase Design** 哲学（深模块 Deep Modules、清晰 Seam、高杠杆 Leverage、局部性 Locality 与删除测试 Deletion Test），针对架构设计中提出的 **Candidate 3（剥离设置弹窗视图并深化 FeatureRegistry 注册表）** 与 **Candidate 4（从 DOMRelocator 剥离高亮评论变异逻辑）** 制定严谨、完备且高度协同的深化重构方案。

---

## 1. 架构目标与设计原则

- **关注点分离与纯化领域核心（Separation of Concerns & Headless Core）**：
  - 将 `FeatureRegistry` 的“无头状态管理与特性生命周期调度”同“120+ 行的具体设置弹窗 DOM 组装”彻底拆开，提炼专用的 `SettingsModalView` 视图适配器；
  - 根除控制器反向拼接 HTML 的 Seam 泄漏，消除 `CaptionController.renderSettingsConfig()`，采用声明式配置替代命令式 DOM 侵入。
- **物理拓扑与数据修补物理隔离（Physical Placement vs. Polymer Data Mutation）**：
  - `DOMRelocator` 严格收敛于 DOM 容器的物理创建与插槽节点重排，剥离内嵌的 Polymer 内部评论对象深层篡改与神秘函数（`lcSwapFuncA` / `lcSwapFuncB`）；
  - 提炼专用的 `LinkedCommentAdapter`，将评论对象重组与徽标转移收拢为具备完备领域语义的数据适配器。
- **提升局部性与高杠杆测试面（Locality & Leverage for Testing）**：
  - `FeatureRegistry` 成为完全可脱离浏览器 DOM 环境执行自动化单测的无头状态机；
  - `DOMRelocator` 与 `LinkedCommentAdapter` 拥有独立且清晰的 Seam，消除跨模块间的隐式副作用与乒乓调用。

---

## 2. 领域模型与术语对齐

- **`FeatureRegistry`**：特性状态与生命周期统管深模块。负责特性描述符注册、持久化状态同步（`StorageUtil`）、开闭切换调度（`setup` / `teardown`）与路由统一初始化。
- **`SettingsModalView`**：设置中心交互视图适配器。负责读取特性状态、生成原生质感的 MD3 开关表单、布局渲染以及调用通用 `Modal` 呈现。
- **`DOMRelocator`**：详情页物理插槽重排深模块。统管 `#right-tabs` 容器装配、`#secondary-inner-wrapper` 节点包裹、原生视频推荐与评论区 DOM 节点的挂载、迁移与重排。
- **`LinkedCommentAdapter`**：高亮锚点评论数据对齐与视图适配器。负责解析 URL `&lc=` 标识、在 Polymer 数据树中执行评论线程重排序（`reorderLinkedCommentThread`）以及徽标数据无感转移（`transferLinkedCommentBadge`）。
- **`TabviewLifecycleCoordinator`**：详情页纯事件驱动生命周期调度器，统筹物理重排与数据对齐。

---

## 3. Part 1: 特性注册表与设置视图深度分离 (`FeatureRegistry` & `SettingsModalView`)

### 3.1 现状分析与架构摩擦点 (Friction)

当前 `src/registry/feature-registry.ts` 承担了过多异质职责，导致接口与实现极度臃肿：

```
【当前架构：生命周期核心与 DOM 界面强耦合】

      descriptors.ts (特性定义列表)
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│ FeatureRegistry (src/registry/feature-registry.ts)          │
│                                                             │
│  [无头状态管理职责]                                          │
│  - getStoredStates / saveStoredStates (持久化)              │
│  - isEnabled / setEnabled (状态切换)                         │
│  - initAll (有序初始化)                                      │
│                                                             │
│  [界面 DOM 构造职责 (120+ 行)]                              │
│  - 注入 settings.css                                        │
│  - 循环创建 .row-item, .setting-switch, input[type=checkbox]│
│  - 侵入式调用 feature.renderExtraConfig(...)                │
│  - 装配并打开 Modal.open                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ leak: 强制下游控制器拼接 HTML
                       ▼
            CaptionController.renderSettingsConfig(...)
            (领域控制器被迫直接写 input / button DOM 节点)
```

1. **状态机与 DOM 构建混合**：
   - `FeatureRegistry` 既要管理持久化存储与特性激活，又充斥着 `document.createElement("div")`、Switch 开关组装和 CSS 注入；
   - 导致该模块无法在纯 Node.js 或无 DOM 环境下进行单元测试。
2. **控制器反向泄漏界面实现**：
   - 为了在设置面板展示字幕基准偏移调节，`FeatureDescriptor` 开辟了 `renderExtraConfig` 钩子；
   - `CaptionController` 不得不引入 98 行的 `renderSettingsConfig`，在领域模块中硬编码输入框、加减按钮和描述文案。这彻底打破了领域控制器只提供纯业务逻辑的边界。
3. **空壳外围模块割裂**：
   - `VideoDownloadService` 与 `MarkOrRemoveAd` 接口形式各异（一个是静态 Service 类，一个是纯对象字面量），在 `main.ts` 与 `descriptors.ts` 中多次重复调用。

### 3.2 演进架构与重构设计

#### 深度分层拓扑

```
【重构后架构：清晰 Seam、无头核心与声明式扩展】

               FeatureRegistry (无头深模块)
                     ▲               │
     dispatches      │               │ provides feature state
     setEnabled(...) │               │ & descriptors
                     │               ▼
            SettingsModalView (独立纯视图适配器)
                     │
                     ├─► 渲染标准 Switch 列表 (MD3 样式)
                     └─► 消费声明式配置项 (无需控制器拼接 DOM)
                             │
                             ▼ [纯领域方法读取与写入]
                     CaptionController.getGlobalDefaultOffsetMs()
                     CaptionController.setGlobalDefaultOffset(ms)
```

#### 具体改动明细

1. **抽离 `src/registry/settings-view.ts` (`SettingsModalView`)**：
   - 将 `openSettingsModal` 完整迁移至专用的 `SettingsModalView` 单例或纯函数中；
   - 负责注入 `settings.css`、构建表单 DOM 节点、绑定交互事件与呼出 `Modal`；
   - 保持极简公共 Seam：`SettingsModalView.show(): void`。

2. **纯化 `src/registry/feature-registry.ts`**：
   - 移除所有对 `settingsCss`、`Modal` 以及 DOM 构造的直接引用；
   - 专注提供纯净且强类型的领域接口：
     - `register(descriptor: FeatureDescriptor): void`
     - `registerAll(descList: FeatureDescriptor[]): void`
     - `isEnabled(id: string): boolean`
     - `setEnabled(id: string, enabled: boolean): Promise<void>`
     - `initAll(): Promise<void>`
     - `getAllDescriptors(): readonly FeatureDescriptor[]`

3. **终结 `renderExtraConfig` 的 HTML 泄漏**：
   - 废除 `renderExtraConfig` 中的裸 DOM 操作；
   - 在 `FeatureDescriptor` 中改为基于声明式类型或轻量组件描述：
     ```typescript
     export interface FeatureDescriptor {
       id: string;
       i18nKey: string;
       titleI18nKey?: string;
       descI18nKey?: string;
       defaultValue: boolean;
       order?: number;
       requiresReload?: boolean;
       extraControl?: "subtitle-offset"; // 声明式控件标识
       setup: () => void | Promise<void>;
       teardown?: () => void | Promise<void>;
     }
     ```
   - `SettingsModalView` 针对 `extraControl === "subtitle-offset"` 自行渲染调节控件，直接调用 `CaptionController.getInstance().getGlobalDefaultOffsetMs()` 与 `setGlobalDefaultOffset(offsetMs)`。领域控制器内彻底删除 98 行的 `renderSettingsConfig`。

---

## 4. Part 2: 标签页重排器与高亮评论数据逻辑解耦 (`DOMRelocator` & `LinkedCommentAdapter`)

### 4.1 现状分析与架构摩擦点 (Friction)

`src/features/tabview/page/relocator.ts`（462 行）将 DOM 挂载重排与深层 Polymer 评论数据篡改混杂在一起：

```
【当前架构：物理重排器混杂 Polymer 数据篡改】

┌─────────────────────────────────────────────────────────────┐
│ DOMRelocator.ts                                             │
│                                                             │
│  [物理 DOM 插槽移动职责]                                    │
│  - mountTabsContainer (挂载 #right-tabs)                    │
│  - bindSlot / registerDefaultSlots (绑定视频/评论插槽)      │
│  - relocateSlot (DOM 节点物理 insertBefore / appendChild)    │
│                                                             │
│  [Polymer 评论区数据深度篡改职责 (170+ 行)]                 │
│  - findLcComment (从 DOM 提取 lc 参数)                      │
│  - findContentsRenderer (深入 Polymer insp 提取 contents)   │
│  - lcSwapFuncA (模糊命名：篡改 contents 数组次序)           │
│  - lcSwapFuncB (模糊命名：转移 linkedCommentBadge 并删追踪参数)│
│  - checkAndHandleLinkedComment (兼职做路由检查与超时调度)   │
└─────────────────────────────────────────────────────────────┘
```

1. **异质复杂度聚集与职责越权**：
   - `DOMRelocator` 顾名思义应当负责 DOM 节点的物理位置迁移（Relocation）。
   - 但内部包含了直接通过 `PolymerHelper.insp(...)` 读取和重构 Polymer 内部 `contents` 数组、强制剔除 `trackingParams`、重新赋值 `v2pCnt.data = { ... }` 等高风险的底层数据补丁逻辑。
2. **具有坏味道的模糊命名**：
   - 模块导出了 `lcSwapFuncA` 与 `lcSwapFuncB`，命名缺乏领域语义，掩盖了真实的业务意图（线程重排序与徽标数据置换）。
3. **破坏面外溢导致难以验证**：
   - 当 YouTube 评论区的数据结构发生变化时，开发者不得不排查并修改“重排器（Relocator）”，这严重违背了“单一职责”与“基于深模块测试”的准则。

### 4.2 演进架构与重构设计

#### 深度分层拓扑

```
【重构后架构：物理层与数据层物理隔离】

             TabviewLifecycleCoordinator (调度中心)
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   DOMRelocator         LinkedCommentAdapter (新建独立深模块)
  (纯物理插槽重排)         (Polymer 评论数据对齐与高亮定位)
         │                       │
         ├─► mountTabsContainer  ├─► parseLinkedCommentId
         ├─► registerDefaultSlots├─► reorderCommentThread (原 lcSwapFuncA)
         └─► relocateSlot        ├─► transferCommentBadge (原 lcSwapFuncB)
                                 └─► scrollToComment
```

#### 具体改动明细

1. **提炼 `src/features/tabview/page/linked-comment-adapter.ts`**：
   - 创建 `LinkedCommentAdapter` 专门承载高亮评论全生命周期；
   - 赋予明确的领域命名：
     - `reorderCommentThread(parent: HTMLElement, targetIndex: number): boolean`（彻底替代 `lcSwapFuncA`）
     - `transferCommentBadge(sourceEl: HTMLElement, targetEl: HTMLElement, badgeData: Record<string, unknown>): boolean`（彻底替代 `lcSwapFuncB`）
     - `syncLinkedComment(specifiedLcId?: string): boolean`（统管查找、对齐与定位）
     - `destroy(): void`（清理高亮超时定时器）
   - 将所有涉及 `PolymerHelper.insp` 与 `contents` 变异的逻辑严格封闭在 `LinkedCommentAdapter` 内部。

2. **纯化 `src/features/tabview/page/relocator.ts` (`DOMRelocator`)**：
   - 彻底删除 `findLcComment`、`findContentsRenderer`、`lcSwapFuncA`、`lcSwapFuncB` 以及 `checkAndHandleLinkedComment`；
   - `DOMRelocator` 专注于：
     - `mountTabsContainer(secondaryInner: HTMLElement, options: TabsViewOptions): HTMLElement`
     - `registerDefaultSlots(): void`
     - `relocateSlot(slotKey: TabKey): boolean`
     - `sweepSecondary(): void`
     - `destroy(): void`
   - 去除与 `ObserverRegistry` 高亮评论观察器的偶发耦合，使重排器保持高度的确定性与纯粹性。

3. **协调器统一编排 (`TabviewLifecycleCoordinator`)**：
   - 由 `TabviewLifecycleCoordinator` 在切页或评论容器挂载时，先调度 `DOMRelocator` 完成物理容器装配，再调度 `LinkedCommentAdapter` 检查并对齐高亮评论。

---

## 5. 关键接口与代码模型设计

### 5.1 纯化后的 `FeatureRegistry` (`src/registry/feature-registry.ts`)

```typescript
import { StorageUtil } from "../core/storage";
import type { FeatureDescriptor } from "../types";

export class FeatureRegistry {
  private static instance: FeatureRegistry | null = null;
  private readonly descriptors = new Map<string, FeatureDescriptor>();
  private isInitialized = false;

  public static getInstance(): FeatureRegistry {
    if (!this.instance) {
      this.instance = new FeatureRegistry();
    }
    return this.instance;
  }

  public register(descriptor: FeatureDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
  }

  public registerAll(descList: FeatureDescriptor[]): void {
    descList.forEach((d) => this.descriptors.set(d.id, d));
  }

  public getAllDescriptors(): readonly FeatureDescriptor[] {
    return Array.from(this.descriptors.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  public isEnabled(id: string): boolean {
    const states = this.getStoredStates();
    return typeof states[id] === "boolean" ? states[id] : (this.descriptors.get(id)?.defaultValue ?? true);
  }

  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    const states = this.getStoredStates();
    const prev = states[id];
    states[id] = enabled;
    this.saveStoredStates(states);

    const desc = this.descriptors.get(id);
    if (desc && this.isInitialized && prev !== enabled) {
      if (enabled) {
        await desc.setup();
      } else if (desc.teardown) {
        await desc.teardown();
      }
    }
  }

  public async initAll(): Promise<void> {
    if (!/youtube\.com/.test(window.location.host)) return;
    const states = this.getStoredStates();
    for (const feature of this.getAllDescriptors()) {
      const enabled = typeof states[feature.id] === "boolean" ? states[feature.id] : feature.defaultValue;
      if (enabled) {
        try {
          await feature.setup();
        } catch (err) {
          console.error(`[FeatureRegistry] Failed to initialize ${feature.id}:`, err);
        }
      }
    }
    this.isInitialized = true;
  }

  private getStoredStates(): Record<string, boolean> {
    const defaultState: Record<string, boolean> = {};
    this.descriptors.forEach((desc, id) => {
      defaultState[id] = desc.defaultValue;
    });
    return StorageUtil.getValue<Record<string, boolean>>(StorageUtil.keys.youtube.functionState, defaultState);
  }

  private saveStoredStates(states: Record<string, boolean>): void {
    StorageUtil.setValue(StorageUtil.keys.youtube.functionState, states);
  }
}
```

### 5.2 独立的高亮评论适配器 (`src/features/tabview/page/linked-comment-adapter.ts`)

```typescript
import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { ObserverRegistry } from "./observer-registry";
import type { LcCommentResult, ContentsRendererLocation } from "./types";

export class LinkedCommentAdapter {
  private static instance: LinkedCommentAdapter | null = null;

  public static getInstance(): LinkedCommentAdapter {
    if (!LinkedCommentAdapter.instance) {
      LinkedCommentAdapter.instance = new LinkedCommentAdapter();
    }
    return LinkedCommentAdapter.instance;
  }

  public syncLinkedComment(specifiedLcId?: string): boolean {
    const searchParams = new URLSearchParams(window.location.search);
    const lcParam = specifiedLcId || searchParams.get("lc");
    if (!lcParam) {
      ObserverRegistry.getInstance().disconnectLinkedCommentSupervisor();
      return false;
    }

    const currentTarget = this.findLcComment();
    if (currentTarget && currentTarget.lc !== lcParam) {
      const isSuccess = this.reorderLinkedComment(lcParam, currentTarget.lc);
      if (isSuccess) {
        this.scrollToComment(currentTarget.commentRendererElm);
        return true;
      }
    }

    const target = this.findLcComment(lcParam);
    if (target) {
      this.scrollToComment(target.commentRendererElm);
      return true;
    }

    ObserverRegistry.getInstance().observeLinkedComment(lcParam, () => {
      return this.syncLinkedComment(lcParam);
    });
    return false;
  }

  private reorderLinkedComment(targetLcId: string, currentLcId: string): boolean {
    const r1 = this.findLcComment(currentLcId)?.commentRendererElm;
    const r2 = this.findLcComment(targetLcId)?.commentRendererElm;
    if (!r1 || !r2) return false;

    const r1cnt = PolymerHelper.insp(r1);
    const r2cnt = PolymerHelper.insp(r2);
    const r1Badge = (r1cnt?.data as Record<string, unknown> | undefined)?.linkedCommentBadge;
    if (typeof r1Badge !== "object" || !r1Badge) return false;

    const badgeCopy = { ...r1Badge as Record<string, unknown> };
    delete (badgeCopy.metadataBadgeRenderer as Record<string, unknown> | undefined)?.trackingParams;

    const v1 = this.findContentsRenderer(r1);
    const v2 = this.findContentsRenderer(r2);
    if (!v1 || !v2 || v1.parent !== v2.parent || v2.index < 0) return false;

    if (v2.parent.nodeName !== "YTD-COMMENT-REPLIES-RENDERER") {
      const v2pCnt = PolymerHelper.insp(v2.parent);
      const v2Contents = (v2pCnt?.data as { contents?: unknown[] } | undefined)?.contents;
      if (Array.isArray(v2Contents)) {
        const targetItem = v2Contents[v2.index];
        v2pCnt.data = {
          ...(v2pCnt.data as Record<string, unknown>),
          contents: [targetItem, ...v2Contents.slice(0, v2.index), ...v2Contents.slice(v2.index + 1)]
        };
      }
    }

    return this.transferCommentBadge(r1, r2, badgeCopy);
  }

  private transferCommentBadge(
    fromEl: HTMLElement,
    toEl: HTMLElement,
    badgeData: Record<string, unknown>
  ): boolean {
    const r1cnt = PolymerHelper.insp(fromEl);
    const r2cnt = PolymerHelper.insp(toEl);
    if (!r1cnt?.data || !r2cnt?.data) return false;

    const r1d = r1cnt.data as Record<string, unknown>;
    delete r1d.linkedCommentBadge;
    r1cnt.data = { ...r1d };

    const r2d = r2cnt.data as Record<string, unknown>;
    r2cnt.data = { ...r2d, linkedCommentBadge: { ...badgeData } };
    return true;
  }

  private scrollToComment(element: HTMLElement): void {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  private findLcComment(targetLc?: string): LcCommentResult | null {
    // 聚焦查找特定 anchor 与 badge 的标准逻辑
    if (targetLc) {
      const el = document.querySelector<HTMLElement>(
        `#tab-comments ytd-comments ytd-comment-renderer #header-author a[href*="lc=${targetLc}"]`
      );
      if (el) {
        const commentRenderer = el.closest<HTMLElement>("ytd-comment-renderer");
        if (commentRenderer) return { lc: targetLc, commentRendererElm: commentRenderer };
      }
    } else {
      const el = document.querySelector<HTMLElement>(
        `#tab-comments ytd-comments ytd-comment-renderer > #linked-comment-badge span:not(:empty)`
      );
      if (el) {
        const commentRenderer = el.closest<HTMLElement>("ytd-comment-renderer");
        if (commentRenderer) {
          const anchor = commentRenderer.querySelector<HTMLAnchorElement>("#header-author a[href*='lc=']");
          const match = /[&?]lc=([\w_.-]+)/.exec(anchor?.getAttribute("href") || "");
          if (match && match[1]) {
            return { lc: match[1], commentRendererElm: commentRenderer };
          }
        }
      }
    }
    return null;
  }

  private findContentsRenderer(commentRendererElm: HTMLElement): ContentsRendererLocation | null {
    const parent = commentRendererElm.closest<HTMLElement>(
      "ytd-comments, ytd-item-section-renderer, ytd-comment-thread-renderer, ytd-comment-replies-renderer"
    );
    if (!parent) return null;

    const parentCnt = PolymerHelper.insp(parent);
    const contents = (parentCnt?.data as { contents?: unknown[] } | undefined)?.contents;
    let index = -1;
    if (Array.isArray(contents)) {
      const commentData = PolymerHelper.insp(commentRendererElm)?.data;
      for (let i = 0; i < contents.length; i++) {
        const item = contents[i] as Record<string, unknown> | undefined;
        const threadComment = (item?.commentThreadRenderer as Record<string, unknown> | undefined)?.comment as Record<string, unknown> | undefined;
        if (item === commentData || threadComment?.commentRenderer === commentData || item?.commentRenderer === commentData) {
          index = i;
          break;
        }
      }
    }
    return { parent, index };
  }

  public destroy(): void {
    ObserverRegistry.getInstance().disconnectLinkedCommentSupervisor();
  }
}
```

---

## 6. 架构收益评估 (Benefits & Wins)

| 评估维度 | 重构前现状 | 深模块化重构后 |
| :--- | :--- | :--- |
| **Locality (局部性)** | `FeatureRegistry` 混合持久化与 DOM 构建；`DOMRelocator` 混入 Polymer 数据变异与神秘函数 `funcA`/`funcB`。 | 设置表单 UI 完全隔离在 `SettingsModalView`；Polymer 评论数据重构完全收敛于 `LinkedCommentAdapter`。 |
| **Seam 严密性** | `CaptionController` 被迫暴露 `renderSettingsConfig` 拼接原生 HTML；重排器接口充斥数据私有逻辑。 | 领域控制器仅暴露纯数值与领域方法；`DOMRelocator` 仅暴露标准的物理挂载与重排接口。 |
| **Leverage (高杠杆)** | 新增特性需要修改注册表的表单拼接逻辑；排查评论定位缺陷需要逆向阅读整个 DOM 搬运代码。 | 新增特性只需声明 `FeatureDescriptor`；评论数据与视图定位形成独立可测试的深层适配器。 |
| **可测试性 (Testability)** | `FeatureRegistry` 强依赖 DOM 与 CSS，无法在纯逻辑环境中单测；高亮评论置换函数混在 DOM 实例中。 | `FeatureRegistry` 成为可在零 DOM 环境秒级测试的无头状态机；高亮评论置换逻辑可纯对 mock 数据对象测试。 |

---

## 7. 破坏面分析与实施步骤

### 7.1 破坏面排查
- **设置按钮与菜单绑定**：`main.ts` 与油猴菜单调用 `FeatureRegistry.openSettingsModal()`，重构后对齐为调用 `SettingsModalView.show()` 或通过门面转调，保持对外调用平滑；
- **字幕设置项功能对齐**：声明式控件直接复用原有的步进加减逻辑，样式完全继承 `settings.css`，用户视觉感知零变化；
- **评论高亮交互**：`LinkedCommentAdapter` 完整保留现存的平滑滚动与徽标置换算法，不破坏从外部链接携带 `&lc=` 进入视频的体验。

### 7.2 实施步骤
1. **构建 `SettingsModalView` 并纯化 `FeatureRegistry`**：
   - 创建 `src/registry/settings-view.ts`，迁出全部 DOM 构建代码；
   - 清理 `src/registry/feature-registry.ts`，彻底剔除 DOM 依赖；
   - 移除 `CaptionController.renderSettingsConfig`，转由 `SettingsModalView` 对声明式标识进行自闭合渲染；
2. **构建 `LinkedCommentAdapter` 并纯化 `DOMRelocator`**：
   - 创建 `src/features/tabview/page/linked-comment-adapter.ts`，迁入评论查找、重排与徽标置换算法，消除 `lcSwapFuncA` 与 `lcSwapFuncB`；
   - 清理 `src/features/tabview/page/relocator.ts`，消除所有对 Polymer 数据的篡改行为，使其聚焦物理插槽；
   - 在 `TabviewLifecycleCoordinator` 中串联生命周期；
3. **运行类型检查与构建验证**：
   - 运行 `pnpm check` 与 `pnpm build` 确保零类型错误与产物构建正常。
