# 计算热路径与布局抖动消除第二优先级性能深化重构方案

## 1. 方案背景与设计原则

本方案基于 **codebase-design** 深度模块理念（Deep Modules、Interface 杠杆、Seam 精准安放、Locality 内聚与 Deletion Test），针对 YouTube Turbo 在第二阶段诊断中识别出的**第二优先级性能瓶颈（计算热路径与渲染/布局开销优化）**进行全景架构深化与落地设计。

第二优先级聚焦于**主线程高频热路径（Hot Path）的计算复杂度降阶与浏览器强制同步布局（Forced Synchronous Layout / Layout Thrashing）的根治**，包含两大核心领域：
1. **字幕时间轴分段常数区间门禁（Piecewise Subtitle Interval Gate）**：深化 [`SubtitleTimeline`](../src/features/caption/timeline.ts) 模块，保持极小高杠杆的公共 Interface，内部采用基于临界事件点双向界定的常数区间快照门禁，将 144Hz 高频 requestAnimationFrame（rAF）循环内的逐帧二分查找、逆向回溯、`unshift` 数组位移与文本拼接，降阶为单次浮点范围比对（$< 0.001\text{ms}$）与零拷贝字符串引用返回；
2. **展开器两阶段读写分离与几何记忆化（Expander Batching & Geometry Memoization）**：重构 [`ExpanderFixer`](../src/features/tabview/page/expander-fixer.ts)，建立“批量读取（Batch Read）→ 批量写入（Batch Write）”的两阶段无抖动测量管线，结合容器宽度几何记忆化缓存、rAF 节流调度与非评论 Tab 严格短路，彻底消除大量评论存在时的 Layout Thrashing。

---

## 2. 核心架构瓶颈诊断与深化方案

### 2.1 字幕时间轴分段常数区间门禁（`SubtitleTimeline`）

#### 瓶颈诊断
在开启字幕临时微调时，[`CaptionOverlayRenderer.startLoop()`](../src/features/caption/renderer.ts) 维持着一个对齐屏幕刷新率（60Hz、120Hz、144Hz）的 rAF 循环。
在每一个动画帧中：
```typescript
const currentMs = this.videoEl.currentTime * 1000;
const targetQueryMs = currentMs - effectiveOffsetMs;
const targetText = this.timeline.getActiveCueText(targetQueryMs);
```
在 [`SubtitleTimeline`](../src/features/caption/timeline.ts) 内部：
1. `findActiveCues(effectiveMs)` 执行二分查找或跨步线性回溯；
2. 循环命中 cue 时执行 `this.activeCuesBuffer.unshift(cue)`，在 JS 引擎中产生连续的内存块后移（$O(k)$）；
3. `getActiveCueText` 将多条 cue 进行换行拼接，分配新的临时字符串；
4. 回到 `renderer.ts` 中比对 `targetText !== this.lastRenderedText`，若相同则丢弃字符串。

#### 第一性原理与数学模型
从物理时间轴与音视频元数据特征来看，**字幕本质上是分段常数函数（Piecewise Constant Function）**：
- 单段字幕 cue 的有效展示窗口通常在 $1500\text{ms} \sim 5000\text{ms}$ 之间；
- 两段独立字幕之间通常存在数百毫秒至数秒的完全静默期；
- **分段常数区间的严格充要条件**：在时间区间 $(T_{\text{start}}, T_{\text{end}})$ 内，既不存在任何一条字幕的开始时刻，也不存在任何一条字幕的结束时刻。在此开区间内部，活动的字幕集合与组合文本是**绝对数学不变量（Absolute Invariant）**。

在 144Hz 高刷屏下，每秒执行 144 次查找、数组分配与文本拼接，其中 **98% 以上的帧执行的都是完全相同的不变计算**，构成了极大的主线程热路径浪费。

#### 深度重构设计（Deep Module 与 Seam 封装）
坚持 **Deep Module** 原则，将区间不变量与快照机制完整内聚在 [`SubtitleTimeline`](../src/features/caption/timeline.ts) 的 Seam 背后，不对外部调用方 [`CaptionOverlayRenderer`](../src/features/caption/renderer.ts) 泄漏任何内部区间数据结构：

1. **有效区间断言门禁（Validity Interval Gate）**：
   - `SubtitleTimeline` 内部维护私有区间快照结构：
     ```typescript
     interface SubtitleIntervalSnapshot {
       readonly startMs: number;
       readonly endMs: number;
       readonly text: string;
     }
     ```
   - 当查询时间 $t$ 满足 $T_{\text{start}} \le t < T_{\text{end}}$ 时，**直接返回缓存的不变字符串引用，立即短路返回**；
   - 绝大多数动画帧仅消耗一次浮点范围比对（耗时 $< 0.001\text{ms}$），零二分查找、零回溯、零内存分配；调用方 `renderer` 仅需进行单次字符串引用比对；
2. **临界事件点双向界定算法（Critical Event Delineation）**：
   - 针对 YouTube 常见的多字幕重叠（Overlapping Cues）、嵌套字幕与静默期间隙，精确推导常数区间的物理真值：
     - **右边界 $T_{\text{end}}$**：取所有当前活跃字幕中最小的结束时刻，与所有未来尚未开始字幕中最小的开始时刻之较小者，即：
       $$T_{\text{end}} = \min\left(\{ \text{cue}_i.\text{endMs} \mid \text{cue}_i \in \text{ActiveCues} \} \cup \{ \text{cue}_j.\text{startMs} \mid \text{cue}_j.\text{startMs} > t \}\right)$$
     - **左边界 $T_{\text{start}}$**：取所有当前活跃字幕中最大的开始时刻，与所有已结束字幕中最大的结束时刻之较大者，即：
       $$T_{\text{start}} = \max\left(\{ \text{cue}_i.\text{startMs} \mid \text{cue}_i \in \text{ActiveCues} \} \cup \{ \text{cue}_k.\text{endMs} \mid \text{cue}_k.\text{endMs} \le t \} \cup \{ 0 \}\right)$$
   - 该算法数学上严密保证了在 $[T_{\text{start}}, T_{\text{end}})$ 内无任何字幕开始或结束事件发生，彻底杜绝短时回退或微调时的状态错乱与漏字缺陷；
3. **消除 `unshift` 内存位移**：
   - 废除 `activeCuesBuffer.unshift`，改为正向 `push` 结合正向索引读取，消除数组元素的物理内存连续后移开销；
4. **跳转（Seek）与重置一致性**：
   - 在 `resetPointer()`、`ingest()` 与 `clear()` 等生命周期接缝处，原子重置区间快照，确保视频跳转时的瞬时准确性。

---

### 2.2 展开器两阶段读写分离与几何记忆化（`ExpanderFixer`）

#### 瓶颈诊断
在 [`ExpanderFixer`](../src/features/tabview/page/expander-fixer.ts) 中存在三个交织的强制回流与性能损耗诱因：
1. **几何属性直读（Forced Reflow）**：
   在 [`funcCanCollapse`](../src/features/tabview/page/expander-fixer.ts#L23-L42) 中：
   ```typescript
   this.canToggle = Boolean(
     this.alwaysToggleable ||
     this.isToggled ||
     (content && content.offsetHeight < content.scrollHeight)
   );
   ```
   读取 `offsetHeight` 与 `scrollHeight` 会强制浏览器即刻同步计算全部排版数据；
2. **循环交替读写（Layout Thrashing）**：
   在 [`fixForTabDisplay`](../src/features/tabview/page/expander-fixer.ts#L230-L296) 中遍历所有 `[io-intersected]` 节点并执行 `calculateCanCollapse(true)`：
   - 节点 1 读取几何高度（强制重排）→ 节点 1 写入展开状态或属性（触发 Polymer 属性监听使 DOM 变 Dirty）；
   - 节点 2 读取几何高度（再次强制重排）→ 节点 2 写入状态（DOM 再次变 Dirty）；
   - 评论区滚动时，视口内数十个展开器单帧内引发数十次昂贵的全局同步布局；
3. **缺少几何记忆化与非活跃 Tab 穿透**：
   - 静态评论项在容器宽度未变时，其折叠能力为恒定不变量，但每次划入视口均无差别重新测量；
   - 在非评论 Tab（如「视频简介」或「播放列表」）下，`fixForTabDisplay` 仍无差别遍历所有评论相交元素。

#### 深度重构设计
深化 [`ExpanderFixer`](../src/features/tabview/page/expander-fixer.ts)，建立两阶段读写分离管线与几何记忆化缓存：

1. **两阶段读写分离批处理管线（Read-Write Separation Pipeline）**：
   - **Phase 1（批量读取阶段）**：单遍循环遍历待处理展开器，连续读取各节点的 `content.offsetHeight`、`content.scrollHeight` 及 Polymer 状态，**期间绝对禁止修改任何 DOM 属性、类名或 Polymer 绑定字段**。浏览器引擎在此阶段至多触发 1 次整体布局计算；
   - **Phase 2（批量写入阶段）**：基于 Phase 1 采集的数据快照，集中更新各 Polymer 控制器的 `canToggle` 状态并应用属性标记，消除交替读写抖动；
2. **展开器静态几何记忆化（Geometry Memoization）**：
   - 单条评论展开器的折叠状态是其内容与当前右侧栏宽度（`tabsWidth`）的纯函数；
   - 引入弱引用或宽度指纹标记：当某展开器在当前 `tabsWidth` 下完成测量后，记录该宽度指纹；后续因滚动再次触发相交时，只要容器宽度未变，直接短路跳过测量，使滚动开销趋近于 $O(0)$；
3. **ResizeObserver rAF 节流防抖**：
   - 对 `ResizeObserver` 回调接入 `requestAnimationFrame` 防抖合并调度，一帧内至多执行 1 次批处理；
   - 当检测到容器宽度变动超过设定阈值（如整数像素变化）时，才使几何记忆化指纹失效并触发重新批处理；
4. **活跃 Tab 作用域完全收敛**：
   - 在非评论 Tab 时，彻底短路所有评论展开器的相交判定与尺寸重算，完全消除后台视图的布局干扰。

---

## 3. 架构时序与批处理流程图

### 3.1 字幕时间轴分段常数区间门禁时序

```mermaid
sequenceDiagram
    autonumber
    participant Loop as rAF 渲染循环 (144Hz)
    participant Renderer as CaptionOverlayRenderer
    participant Timeline as SubtitleTimeline
    participant DOM as 字幕覆盖层 DOM

    Loop->>Renderer: 动画帧触发
    Renderer->>Timeline: getActiveCueText(targetMs)
    alt 查询时间在当前常数区间内 [startMs, endMs)
        Timeline-->>Renderer: 立即返回已缓存的字符串引用 (< 0.001ms)
    else 越出区间或发生 Seek / 重置
        Timeline->>Timeline: 重定位活跃字幕并正向推导
        Timeline->>Timeline: 临界事件点双向界定 [startMs, endMs)
        Timeline->>Timeline: 顺序构建并持久化文本快照
        Timeline-->>Renderer: 返回新快照字符串
    end
    alt targetText !== lastRenderedText (单指令周期比对)
        Renderer->>DOM: 原子更新 textContent 与显示状态
    else 字符串引用相同
        Note over Renderer,DOM: 零 DOM 操作，无损跳过
    end
```

### 3.2 展开器读写分离两阶段批处理流程

```mermaid
flowchart TD
    A[触发源: ResizeObserver 或 相交相变] --> B{当前是否处于评论 Tab?}
    B -- 否 --> C[直接短路退出 (0 开销)]
    B -- 是 --> D[rAF 防抖与宽度有效性判定]
    D --> E[筛选出当前宽度下未记忆化的展开器节点]
    E --> F{待测量节点数 > 0 ?}
    F -- 否 --> G[命中几何记忆化，直接短路退出]
    F -- 是 --> H

    subgraph Phase 1: 批量只读测量 (至多触发布局重算 1 次)
        H[遍历待测节点] --> I1[读取 item 1: offsetHeight & scrollHeight]
        I1 --> I2[读取 item 2: offsetHeight & scrollHeight]
        I2 --> IN[读取 item N: offsetHeight & scrollHeight]
        IN --> J[生成只读测量快照数组]
    end

    subgraph Phase 2: 批量集中写入 (0 次强制回流)
        J --> K1[写入 item 1: canToggle 状态与宽度指纹]
        K1 --> K2[写入 item 2: canToggle 状态与宽度指纹]
        K2 --> KN[写入 item N: canToggle 状态与宽度指纹]
    end

    KN --> L[批处理完成，DOM 状态稳定]
```

---

## 4. 拟修改与优化文件清单

| 操作类型 | 文件相对路径 | 核心修改点与架构职责 |
| :--- | :--- | :--- |
| **[MODIFY]** | [`src/features/caption/timeline.ts`](../src/features/caption/timeline.ts) | 引入 `SubtitleIntervalSnapshot` 与临界事件点双向界定算法；消除 `unshift` 位移；强化 Seek 重置门禁 |
| **[MODIFY]** | [`src/features/caption/constants.ts`](../src/features/caption/constants.ts) | 增加常数区间相关时间极值与边界常量，杜绝魔法数字 |
| **[MODIFY]** | [`src/features/tabview/page/expander-fixer.ts`](../src/features/tabview/page/expander-fixer.ts) | 实现两阶段读写分离管线；接入容器宽度几何记忆化；引入 `requestAnimationFrame` 防抖与非评论 Tab 严格短路 |
| **[MODIFY]** | [`src/features/tabview/page/constants.ts`](../src/features/tabview/page/constants.ts) | 补充展开器读写批处理、宽度记忆化属性及防抖阈值常量 |
| **[MODIFY]** | 对应单元测试文件 | 针对多重叠字幕区间界定精度、正反向快照失效、展开器批量测量与记忆化短路补充完备自动化测试 |

---

## 5. 验证与验收标准

### 5.1 自动化检查
- **严格类型校验**：运行 `pnpm check`（`tsc --noEmit`），显式标注所有入参、返回值与区间快照类型，保证零隐式 `any`；
- **全量单元与集成测试**：运行 `pnpm test`，覆盖：
  1. 复杂重叠字幕（长短嵌套、说话人交错）、静默期间隙以及前后 Seek 场景下文本输出的绝对一致性；
  2. 展开器在视口动态滚动、窗口 Resize 以及 Tab 频繁切换下的判定准确性与记忆化命中率。

### 5.2 运行时指标验收标准
1. **144Hz rAF 帧开销压降验证**：在开启字幕微调状态下，使用 Chrome DevTools Performance 录制播放轨迹，验证 `getActiveCueText` 在 98% 以上帧中消耗 $< 0.001\text{ms}$，单帧内存分配（Allocation profile）呈平直线；
2. **强制同步布局归零验证**：在评论区加载 50+ 条评论的场景下，快速滚动或拖拽调整窗口，DevTools Performance 面板中 **Forced Synchronous Layout** 警告彻底归零，单次批处理耗时控制在 $1\text{ms}$ 以内；
3. **视觉与交互无损保证**：字幕显示、隐藏与换行零闪烁零延迟；评论“展开/收起”按钮交互与原有官方行为 100% 保持一致。
