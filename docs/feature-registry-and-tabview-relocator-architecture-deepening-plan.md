# YouTube Turbo – 特性注册表与标签页重排器架构深化方案

本方案基于 **Codebase Design** 哲学（深模块 Deep Modules、清晰 Seam、高杠杆 Leverage、局部性 Locality 与删除测试 Deletion Test），针对特性生命周期管理与详情页 DOM 重排体系，制定严谨、完备且高度内聚的架构深化重构方案。

---

## 1. 架构目标与设计原则

- **关注点分离与无头核心（Separation of Concerns & Headless Core）**：
  - 将 `FeatureRegistry` 彻底纯化为脱离 DOM 树的纯粹“无头状态管理与特性生命周期调度深模块”；
  - 提炼独立的通用设置弹窗表单引擎 `SettingsModalView`，专门承载样式注入、MD3 表单装配与弹窗呈现。
- **通用声明式配置驱动（Declarative Config Schema & Zero Reverse Dependency）**：
  - 杜绝通用设置视图对具体业务控制器（如 `CaptionController`）的反向依赖与硬编码，严格遵循开闭原则（OCP）与依赖倒置原则（DIP）；
  - 引入通用、类型安全的配置字段描述规范（`ConfigField` Schema），由 `SettingsModalView` 作为表单引擎统一解析与渲染。
- **物理拓扑与数据修补物理隔离（Physical Placement vs. Polymer Data Mutation）**：
  - `DOMRelocator` 严格收敛于 DOM 容器的物理创建与插槽节点重排，剥离内嵌的 Polymer 内部评论对象深层篡改与神秘函数（`lcSwapFuncA` / `lcSwapFuncB`）；
  - 提炼专用的 `LinkedCommentAdapter`，统一负责解析 URL 锚点标识、在 Polymer 数据树中执行评论线程重排序以及徽标数据无感转移。
- **自闭合生命周期与高内聚观察（Self-contained Lifecycle & Locality）**：
  - 将评论区专用的短期突变监听与超时熔断逻辑从全局 `ObserverRegistry` 中剥离，完全内聚在 `LinkedCommentAdapter` 内部，消除跨模块的状态渗漏；
  - 完整覆盖双重调用源：切页路由中枢（`TabviewLifecycleCoordinator`）与异步 DOM 挂载钩子（`PolymerPatcher`）。
- **提升局部性与高杠杆测试面（Locality & Leverage for Testing）**：
  - `FeatureRegistry` 与配置字段校验具备完善的环境安全守卫，可在零 DOM 的 Node.js 自动化单测环境中秒级运行；
  - `DOMRelocator` 与 `LinkedCommentAdapter` 拥有独立且清晰的 Seam，消除隐式副作用。

---

## 2. 领域模型与术语对齐

- **`FeatureRegistry`**：特性状态与生命周期统管深模块。负责特性描述符注册、持久化状态同步（`StorageUtil`）、开闭切换调度（`setup` / `teardown`）与系统初始化。
- **`SettingsModalView`**：设置中心交互视图适配器。作为通用的表单引擎，负责读取特性描述符列表与配置 Schema、生成原生质感的 MD3 开关与控件表单、布局渲染以及呼出通用 `Modal`。
- **`ConfigField`**：通用配置字段描述符。采用可判别联合（Discriminated Union）类型表达标准 UI 控件（如数字微调器 `stepper`、下拉选择器 `select` 等），解耦具体特性的 UI 渲染。
- **`DOMRelocator`**：详情页物理插槽重排深模块。统管 `#right-tabs` 容器装配、`#secondary-inner-wrapper` 节点包裹、原生视频推荐与评论区 DOM 节点的挂载、迁移与重排。
- **`LinkedCommentAdapter`**：高亮锚点评论数据对齐与视图适配器。内聚 URL `&lc=` 标识解析、Polymer 数据树评论重排（`reorderCommentThread`）、徽标转移（`transferCommentBadge`）以及专用突变监听与平滑滚动定位。
- **`TabviewLifecycleCoordinator`**：详情页纯事件驱动生命周期调度器，统筹切页路由下的物理重排与数据对齐。
- **`PolymerPatcher`**：Polymer Custom Elements 原型拦截器，负责拦截 `ytd-comments` 等原型的生命周期挂钩。

---

## 3. Part 1: 特性注册表与设置视图深度分离 (`FeatureRegistry` & `SettingsModalView`)

### 3.1 现状分析与架构摩擦点 (Friction)

当前 `src/registry/feature-registry.ts` 承担了过多异质职责，导致接口与实现臃肿：

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
└─────────────────────────────────────────────────────────────┘
```

1. **状态机与 DOM 构建混合**：
   - `FeatureRegistry` 既要管理持久化存储与特性激活，又充斥着 `document.createElement("div")`、Switch 开关组装和 CSS 注入；
   - 包含未受保护的 `window.location.host` 检查，无法在纯逻辑环境中进行单元测试。
2. **拓展配置缺乏统一规范**：
   - 现存 `FeatureDescriptor` 采用 `renderExtraConfig(container, language)` 裸 DOM 传递机制；
   - 若简单硬编码特化字段（如在视图中特判特定 feature），将导致通用设置视图反向依赖具体领域控制器，严重违背依赖倒置原则（DIP）。

### 3.2 演进架构与重构设计

#### 深度分层拓扑

```
【重构后架构：清晰 Seam、无头核心与声明式 Schema 驱动】

                FeatureRegistry (无头深模块)
                      ▲               │
      dispatches      │               │ provides feature state
      setEnabled(...) │               │ & descriptors
                      │               ▼
             SettingsModalView (通用表单引擎适配器)
                      │
                      ├─► 渲染标准 Switch 列表 (MD3 样式)
                      └─► 消费通用 ConfigField Schema (无需依赖具体业务控制器)
                              │
                              ▼ [通过强类型闭包读写]
                      field.getValue() / field.setValue(next)
```

#### 具体改动明细

1. **抽象通用配置描述符（`ConfigField` Schema）**：
   在 `src/types/index.ts` 中定义通用的表单字段规范，使任何特性均能以声明式数据描述其特异性设置项，例如数字微调控件（`StepperConfigField`）：
   ```typescript
   export interface StepperConfigField {
     type: "stepper";
     key: string;
     titleI18nKey: string;
     descI18nKey?: string;
     unitI18nKey?: string;
     badgeText?: string;
     step: number;
     min: number;
     max: number;
     precision?: number;
     getValue: () => number;
     setValue: (value: number) => void;
   }

   export type ConfigField = StepperConfigField;

   export interface FeatureDescriptor {
     id: string;
     i18nKey: string;
     titleI18nKey?: string;
     descI18nKey?: string;
     defaultValue: boolean;
     order?: number;
     requiresReload?: boolean;
     extraFields?: ConfigField[];
     setup: () => void | Promise<void>;
     teardown?: () => void | Promise<void>;
   }
   ```

2. **抽离 `src/registry/settings-view.ts` (`SettingsModalView`)**：
   - 将全部 DOM 构建、样式注入、Switch 开关拼装及 `Modal` 交互完整迁移至专用的 `SettingsModalView`；
   - 作为通用的表单渲染引擎，依据 `feature.extraFields` 自动化组装对应控件，**绝不 import 任何具体的 Feature Controller**；
   - 对外暴露极简 Seam：`SettingsModalView.show(): void`。

3. **纯化 `src/registry/feature-registry.ts`**：
   - 移除所有对 `settingsCss`、`Modal` 以及 DOM 构造的直接引用；
   - 增加运行时环境安全守卫，保证其在 Node.js 与浏览器双环境下均可无缝执行；
   - 专注提供纯净的强类型领域接口：
     - `register(descriptor: FeatureDescriptor): void`
     - `registerAll(descList: FeatureDescriptor[]): void`
     - `isEnabled(id: string): boolean`
     - `setEnabled(id: string, enabled: boolean): Promise<void>`
     - `initAll(): Promise<void>`
     - `getAllDescriptors(): readonly FeatureDescriptor[]`
   - 为兼容现有调用点（如 `main.ts` 与 Tampermonkey 菜单），保留便捷门面转调 `FeatureRegistry.openSettingsModal()` 委托至 `SettingsModalView.show()`。

---

## 4. Part 2: 标签页重排器与高亮评论数据解耦 (`DOMRelocator` & `LinkedCommentAdapter`)

### 4.1 现状分析与架构摩擦点 (Friction)

`src/features/tabview/page/relocator.ts`（462 行）将 DOM 挂载重排与深层 Polymer 评论数据篡改混杂在一起：

```
【当前架构：物理重排器混杂 Polymer 数据篡改与外漏观察器】

┌─────────────────────────────────────────────────────────────┐
│ DOMRelocator.ts                                             │
│                                                             │
│  [物理 DOM 插槽移动职责]                                    │
│  - mountTabsContainer (挂载 #right-tabs)                    │
│  - bindSlot / registerDefaultSlots (绑定视频/评论插槽)      │
│  - relocateSlot (DOM 节点物理 insertBefore / replaceChildren)│
│                                                             │
│  [Polymer 评论区数据深度篡改职责 (170+ 行)]                 │
│  - findLcComment (从 DOM 提取 lc 参数)                      │
│  - findContentsRenderer (深入 Polymer insp 提取 contents)   │
│  - lcSwapFuncA (神秘命名：篡改 contents 数组次序)           │
│  - lcSwapFuncB (神秘命名：转移 linkedCommentBadge)           │
│  - checkAndHandleLinkedComment (路由检查与置换触发)         │
└───────────────────────────┬─────────────────────────────────┘
                            │ 泄漏评论监听
                            ▼
ObserverRegistry.observeLinkedComment / linkedCommentTimeoutTimer
```

1. **职责严重越权**：
   - `DOMRelocator` 核心职责应是物理 DOM 插槽的拓扑定位与恢复。
   - 但内部包含了直接通过 `PolymerHelper.insp(...)` 读取和重组 Polymer 内部 `contents` 数组、强制剔除 `trackingParams`、重新赋值 `v2pCnt.data` 等高危数据篡改逻辑。
2. **神秘命名破坏可读性**：
   - 模块导出了 `lcSwapFuncA` 与 `lcSwapFuncB`，命名缺乏领域语义，掩盖了真实的业务意图（线程重排序与徽标数据转移）。
3. **领域观察器外漏至通用注册表**：
   - 高亮评论专属的 DOM 突变等待与超时熔断逻辑（`observeLinkedComment` / `linkedCommentTimeoutTimer`）散落在通用的 `ObserverRegistry` 中，导致两模块紧密耦合。
4. **双调用源缺乏统筹**：
   - 高亮评论定位不仅在切页路由中触发，更在 `PolymerPatcher.patchComments` 针对 `ytd-comments` 原型挂载（`attached` 钩子）时动态触发，调用点分布零散。

### 4.2 演进架构与重构设计

#### 深度分层拓扑

```
【重构后架构：物理层、数据层与观察生命周期全面隔离】

  TabviewLifecycleCoordinator          PolymerPatcher (attached 钩子)
       (路由与初始化调度)                       (原型生命周期调度)
               │                                       │
               ├───────────────────────────────────────┤
               │ 触发数据对齐                          │ 触发数据对齐
               ▼                                       ▼
    DOMRelocator (纯物理插槽重排)         LinkedCommentAdapter (高内聚深模块)
   - mountTabsContainer                   - syncLinkedComment (统管对齐与定位)
   - registerDefaultSlots                 - reorderCommentThread (原 lcSwapFuncA)
   - tryRelocateSlot                      - transferCommentBadge (原 lcSwapFuncB)
   - sweepSecondary                       - scrollToComment (精准锚定目标节点)
   - restoreAll                           - 内聚专用 MutationObserver 与超时熔断
```

#### 具体改动明细

1. **提炼自包含的 `src/features/tabview/page/linked-comment-adapter.ts`**：
   - 创建 `LinkedCommentAdapter` 专门承载高亮评论的全生命周期；
   - 赋予明确的领域命名与清晰接口：
     - `syncLinkedComment(specifiedLcId?: string): boolean`（查找、数据对齐与定位总入口）
     - `reorderCommentThread(targetLcId: string, currentLcId: string): boolean`（替换 `lcSwapFuncA`）
     - `transferCommentBadge(fromEl: HTMLElement, toEl: HTMLElement, badgeData: Record<string, unknown>): boolean`（替换 `lcSwapFuncB`）
     - `destroy(): void`（清理内部专属 Observer 与超时 Timer）
   - **完全收拢专用观察器**：将原本存在于 `ObserverRegistry` 中的评论观察器与超时定时器直接内聚到 `LinkedCommentAdapter` 私有实现中，实现生命周期自闭合。

2. **纯化 `src/features/tabview/page/relocator.ts` (`DOMRelocator`)**：
   - 彻底移除 `findLcComment`、`findContentsRenderer`、`lcSwapFuncA`、`lcSwapFuncB` 以及 `checkAndHandleLinkedComment`；
   - 移除对 `ObserverRegistry` 高亮评论观察器的偶发调用；
   - 聚焦物理容器装配、插槽绑定、占位锚点维护与 `sweepSecondary` 兜底。

3. **统筹双调用源**：
   - **调用源 1（切页导航）**：在 `TabviewLifecycleCoordinator.handleRouteChange()` 与 `tryMount()` 中，先由 `DOMRelocator` 确保物理容器与插槽就绪，再调度 `LinkedCommentAdapter.getInstance().syncLinkedComment()`；
   - **调用源 2（原型挂载）**：在 `PolymerPatcher.patchComments()` 的 `ytd-comments` `attached` 钩子中，调用 `LinkedCommentAdapter.getInstance().syncLinkedComment()`。

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
    if (typeof window !== "undefined" && !/youtube\.com/.test(window.location?.host ?? "")) {
      return;
    }
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

### 5.2 声明式配置驱动设置视图 (`src/registry/settings-view.ts`)

```typescript
import { StyleEngine } from "../core/style-engine";
import { LangueUtil } from "../i18n";
import { Modal } from "../ui/modal/modal";
import { FeatureRegistry } from "./feature-registry";
import type { ConfigField, StepperConfigField } from "../types";
import settingsCss from "./settings.css?raw";

const SETTINGS_STYLE_ID = "yt-improvements-settings-style";

export class SettingsModalView {
  public static show(): void {
    StyleEngine.inject(SETTINGS_STYLE_ID, settingsCss);

    const language = LangueUtil.getLanguage();
    const registry = FeatureRegistry.getInstance();
    const descriptors = registry.getAllDescriptors();
    let requiresReloadOnClose = false;

    const container = document.createElement("div");
    container.className = "yt-settings-form";

    descriptors.forEach((feature) => {
      const row = document.createElement("div");
      row.className = "row-item";

      const header = document.createElement("div");
      header.className = "setting-header";

      const infoEl = document.createElement("div");
      infoEl.className = "setting-info";

      const titleText =
        (feature.titleI18nKey && language.content[feature.titleI18nKey]) ||
        language.content[feature.i18nKey] ||
        feature.i18nKey;

      const titleEl = document.createElement("div");
      titleEl.className = "setting-title";
      titleEl.textContent = titleText;
      infoEl.appendChild(titleEl);

      const descText = feature.descI18nKey && language.content[feature.descI18nKey];
      if (descText) {
        const descEl = document.createElement("div");
        descEl.className = "setting-desc";
        descEl.textContent = descText;
        infoEl.appendChild(descEl);
      }

      const switchEl = document.createElement("div");
      switchEl.className = "setting-switch";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `yt_feat_${feature.id}`;
      input.className = "switch-input";
      input.setAttribute("aria-label", titleText);
      const isFeatureEnabled = registry.isEnabled(feature.id);
      input.checked = isFeatureEnabled;

      const track = document.createElement("span");
      track.className = "switch-track";

      switchEl.appendChild(input);
      switchEl.appendChild(track);
      header.appendChild(infoEl);
      header.appendChild(switchEl);
      row.appendChild(header);

      let extraContainer: HTMLElement | null = null;
      if (feature.extraFields && feature.extraFields.length > 0) {
        extraContainer = document.createElement("div");
        extraContainer.className = "setting-extra-config";
        this.updateFieldAvailability(extraContainer, isFeatureEnabled);

        feature.extraFields.forEach((field) => {
          if (field.type === "stepper") {
            extraContainer?.appendChild(this.renderStepperField(field, language));
          }
        });
        row.appendChild(extraContainer);
      }

      input.addEventListener("change", async (e: Event) => {
        const isChecked = (e.target as HTMLInputElement).checked;
        await registry.setEnabled(feature.id, isChecked);
        if (extraContainer) {
          this.updateFieldAvailability(extraContainer, isChecked);
        }
        if (feature.requiresReload) {
          requiresReloadOnClose = true;
        }
      });

      container.appendChild(row);
    });

    Modal.open({
      size: "medium",
      title: language.content.function_setting_title || "Setting",
      content: container,
      direction: language.direction,
      onClose: () => {
        if (requiresReloadOnClose && typeof location !== "undefined") {
          location.reload();
        }
      }
    });
  }

  private static updateFieldAvailability(container: HTMLElement, enabled: boolean): void {
    container.style.opacity = enabled ? "1" : "0.5";
    container.style.pointerEvents = enabled ? "auto" : "none";
  }

  private static renderStepperField(field: StepperConfigField, language: ReturnType<typeof LangueUtil.getLanguage>): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "yt-subtitle-offset-config";

    const titleRow = document.createElement("div");
    titleRow.className = "yt-subtitle-offset-header";

    const titleEl = document.createElement("span");
    titleEl.className = "yt-subtitle-offset-title";
    titleEl.textContent = language.content[field.titleI18nKey] || field.titleI18nKey;
    titleRow.appendChild(titleEl);

    if (field.badgeText) {
      const badgeEl = document.createElement("kbd");
      badgeEl.className = "yt-turbo-kbd";
      badgeEl.textContent = field.badgeText;
      titleRow.appendChild(badgeEl);
    }
    wrapper.appendChild(titleRow);

    const controlsRow = document.createElement("div");
    controlsRow.className = "yt-subtitle-offset-controls";

    const precision = field.precision ?? 2;
    const stepStr = (field.step / 1000).toFixed(precision);

    const btnAdvance = document.createElement("button");
    btnAdvance.type = "button";
    btnAdvance.className = "yt-offset-btn yt-offset-btn-advance";
    btnAdvance.textContent = `-${stepStr}s`;

    const inputWrap = document.createElement("div");
    inputWrap.className = "yt-offset-input-wrap";

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.className = "yt-offset-input";
    numberInput.step = String(field.step / 1000);
    numberInput.min = String(field.min / 1000);
    numberInput.max = String(field.max / 1000);
    numberInput.value = (field.getValue() / 1000).toFixed(precision);

    const unitEl = document.createElement("span");
    unitEl.className = "yt-offset-unit";
    unitEl.textContent = (field.unitI18nKey && language.content[field.unitI18nKey]) || "s";

    inputWrap.appendChild(numberInput);
    inputWrap.appendChild(unitEl);

    const btnDelay = document.createElement("button");
    btnDelay.type = "button";
    btnDelay.className = "yt-offset-btn yt-offset-btn-delay";
    btnDelay.textContent = `+${stepStr}s`;

    const btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "yt-offset-btn yt-offset-btn-reset";
    btnReset.textContent = language.content.subtitle_offset_reset_btn || "Reset";

    const syncInput = (ms: number) => {
      numberInput.value = (ms / 1000).toFixed(precision);
    };

    numberInput.addEventListener("input", () => {
      const sec = parseFloat(numberInput.value);
      if (Number.isFinite(sec)) {
        field.setValue(Math.round(sec * 1000));
      }
    });

    btnAdvance.addEventListener("click", () => {
      const next = Math.max(field.min, field.getValue() - field.step);
      field.setValue(next);
      syncInput(next);
    });

    btnDelay.addEventListener("click", () => {
      const next = Math.min(field.max, field.getValue() + field.step);
      field.setValue(next);
      syncInput(next);
    });

    btnReset.addEventListener("click", () => {
      field.setValue(0);
      syncInput(0);
    });

    controlsRow.appendChild(btnAdvance);
    controlsRow.appendChild(inputWrap);
    controlsRow.appendChild(btnDelay);
    controlsRow.appendChild(btnReset);
    wrapper.appendChild(controlsRow);

    if (field.descI18nKey && language.content[field.descI18nKey]) {
      const descEl = document.createElement("div");
      descEl.className = "yt-subtitle-offset-desc";
      descEl.textContent = language.content[field.descI18nKey];
      wrapper.appendChild(descEl);
    }

    return wrapper;
  }
}
```

### 5.3 自闭合高内聚的高亮评论适配器 (`src/features/tabview/page/linked-comment-adapter.ts`)

```typescript
import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import type { LcCommentResult, ContentsRendererLocation } from "./types";

export class LinkedCommentAdapter {
  private static instance: LinkedCommentAdapter | null = null;
  private commentObserver: MutationObserver | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  public static getInstance(): LinkedCommentAdapter {
    if (!LinkedCommentAdapter.instance) {
      LinkedCommentAdapter.instance = new LinkedCommentAdapter();
    }
    return LinkedCommentAdapter.instance;
  }

  public syncLinkedComment(specifiedLcId?: string): boolean {
    const searchParams = new URLSearchParams(window.location.search);
    const targetLcId = specifiedLcId || searchParams.get("lc");
    if (!targetLcId) {
      this.disconnectSupervisor();
      return false;
    }

    const currentLc = this.findLcComment();
    if (currentLc && currentLc.lc !== targetLcId) {
      const isSuccess = this.reorderCommentThread(targetLcId, currentLc.lc);
      if (isSuccess) {
        this.disconnectSupervisor();
        const updatedTarget = this.findLcComment(targetLcId);
        if (updatedTarget) {
          this.scrollToComment(updatedTarget.commentRendererElm);
        }
        return true;
      }
    }

    const targetComment = this.findLcComment(targetLcId);
    if (targetComment) {
      this.disconnectSupervisor();
      this.scrollToComment(targetComment.commentRendererElm);
      return true;
    }

    this.startSupervisor(targetLcId);
    return false;
  }

  private reorderCommentThread(targetLcId: string, currentLcId: string): boolean {
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

  private startSupervisor(targetLcId: string): void {
    this.disconnectSupervisor();

    const commentsContainer =
      document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER + " ytd-comments #contents") ||
      document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER + " ytd-comments") ||
      document.querySelector<HTMLElement>("ytd-comments");

    if (!commentsContainer) return;

    this.commentObserver = new MutationObserver(() => {
      const success = this.syncLinkedComment(targetLcId);
      if (success) {
        this.disconnectSupervisor();
      }
    });

    this.commentObserver.observe(commentsContainer, {
      childList: true,
      subtree: true
    });

    this.timeoutTimer = setTimeout(() => {
      this.disconnectSupervisor();
    }, PAGE_CONSTANTS.TIMEOUTS.LINKED_COMMENT_READY_MS);
  }

  public disconnectSupervisor(): void {
    if (this.commentObserver) {
      this.commentObserver.disconnect();
      this.commentObserver = null;
    }
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private findLcComment(targetLc?: string): LcCommentResult | null {
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
    this.disconnectSupervisor();
  }
}
```

---

## 6. 架构收益评估 (Benefits & Wins)

| 评估维度 | 重构前现状 | 深模块化重构后（最佳实践） |
| :--- | :--- | :--- |
| **开闭原则与扩展性 (OCP & DIP)** | 控制器裸拼 DOM 或视图反向耦合具体 Feature；新增配置项需动核心视图代码。 | 通用 `ConfigField` Schema 驱动；新增配置项只需在特性描述符声明字段，表单引擎自闭合渲染。 |
| **Locality (局部性)** | `FeatureRegistry` 混合持久化与 DOM 构建；`DOMRelocator` 混入 Polymer 数据篡改与神秘函数；评论 Observer 散落。 | 设置表单 UI 隔离在 `SettingsModalView`；Polymer 评论数据重构与专用观察器完全收敛于 `LinkedCommentAdapter`。 |
| **Seam 严密性** | 重排器接口充斥私有数据篡改；`ObserverRegistry` 承担特定评论业务。 | `DOMRelocator` 仅暴露物理挂载与重排接口；`ObserverRegistry` 卸下业务专用观察器包袱。 |
| **Leverage (高杠杆)** | 新增特性需要侵入设置弹窗逻辑；排查评论定位缺陷需在 460+ 行 DOM 搬运代码中寻觅。 | 新增特性仅需扩充描述符；评论定位逻辑成为拥有独立全生命周期的自包含深模块。 |
| **可测试性 (Testability)** | `FeatureRegistry` 强依赖 DOM 与全局 `window`，无法在 Node.js 中单测；数据置换逻辑难以隔离。 | `FeatureRegistry` 具备完善环境守卫，可在零 DOM 环境秒级单测；评论数据置换可针对纯对象测试。 |

---

## 7. 破坏面分析与实施步骤

### 7.1 破坏面排查与防护策略

- **主入口设置操作与菜单注册**：
  - `main.ts` 与油猴菜单调用 `FeatureRegistry.openSettingsModal()`；
  - 防护策略：在 `src/registry/index.ts` 导出平滑转调门面 `FeatureRegistry.openSettingsModal = () => SettingsModalView.show()`，保持对外调用零破坏。
- **Polymer 原型挂载挂钩**：
  - `src/features/tabview/page/polymer-patcher.ts:250` 原本调用 `DOMRelocator.getInstance().checkAndHandleLinkedComment()`；
  - 防护策略：同步无缝切换为 `LinkedCommentAdapter.getInstance().syncLinkedComment()`，确保在 `ytd-comments` 原型 `attached` 瞬间完成高亮对齐。
- **字幕基准偏移设置项**：
  - 在 `descriptors.ts` 中将原有的 `renderExtraConfig` 转换为 `extraFields: [subtitleOffsetStepperField]`，完全复用现有样式与多语言键，界面交互与视觉完全零差异。
- **评论高亮定位精度**：
  - 修正原方案中 `scrollToComment` 误指向旧元素的缺陷，在数据置换后重新定位到目标元素，确保平滑滚动直达目标。

### 7.2 分阶段实施步骤

1. **构建 `SettingsModalView` 并纯化 `FeatureRegistry`**：
   - 在 `src/types/index.ts` 中定义 `ConfigField` 联合类型与扩展描述项；
   - 创建 `src/registry/settings-view.ts`，实现基于 Schema 的通用表单渲染引擎；
   - 重构 `src/registry/feature-registry.ts`，剔除 DOM 依赖，补充无头环境安全守卫；
   - 更新 `src/registry/descriptors.ts`，以声明式 `extraFields` 描述字幕基准偏移；
   - 彻底删除 `src/features/caption/settings-view.ts` 与 `CaptionController.renderSettingsConfig`。
2. **构建 `LinkedCommentAdapter` 并纯化 `DOMRelocator` 与 `ObserverRegistry`**：
   - 创建 `src/features/tabview/page/linked-comment-adapter.ts`，迁入评论查找、重排、徽标置换算法以及专用的评论区突变监听与超时器；
   - 清理 `src/features/tabview/page/relocator.ts`，彻底消除对 Polymer 内部数据的变异代码；
   - 清理 `src/features/tabview/page/observer-registry.ts` 中冗余的 `observeLinkedComment` 与 `disconnectLinkedCommentSupervisor`；
   - 更新 `src/features/tabview/page/coordinator.ts` 与 `src/features/tabview/page/polymer-patcher.ts` 的调用点。
3. **验证与交付**：
   - 运行 `pnpm check` 确保 TypeScript 严格模式零类型报错；
   - 运行 `pnpm build` 验证构建产物输出完整性。
