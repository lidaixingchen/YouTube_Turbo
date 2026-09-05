# 0006. 播放器快捷键与辅助交互按能力解耦 (Decoupling Player Shortcuts by Capability)

- **状态**: Accepted (已采纳)
- **日期**: 2026-09-05
- **决策者**: YouTube Turbo 核心架构组

---

## 1. 背景与问题上下文 (Context)

在既有架构中，`isOpenSpeedControl`（倍速特性）除管理倍速按钮与调速快捷键（`>`、`<`、`Shift+R`）外，还托管了非倍速快捷键：
- 视频截图（`Shift+S`）
- 原生画中画（`Shift+P`）
- 单曲循环播放（`Shift+L`）

同时，播放器控制栏上的这三项辅助动作（相机、画中画、循环图标）在 `PlayerController.init()` 中无条件常驻注册，缺乏独立生命周期管理。

这导致了多重架构摩擦：
1. **边界侵蚀与权责不清**：用户若在设置中关闭倍速功能，非倍速的截图、画中画与循环快捷键会一并失效；而控制栏上的对应按钮却依然常驻，造成快捷键与 UI 行为割裂；
2. **底层单例膨胀**：`PlayerController` 作为媒体领域模型，混杂了按键监听、快捷键回滚数组及工具栏挂载等 UI 交互逻辑，背离了单一职责原则；
3. **配置颗粒度不足**：无法针对单个能力（如仅停用截图或仅停用循环）进行按需配置。

---

## 2. 决策内容 (Decision)

我们决定按领域能力彻底解耦播放器快捷键与辅助交互：

1. **一等特性对等化**：将视频截图、原生画中画、单曲循环播放与倍速控制对等拆分为 4 个一等特性（`isOpenSpeedControl`、`isOpenScreenshot`、`isOpenPictureInPicture`、`isOpenLoopPlayback`）；
2. **复合门面工厂统一规范**：提炼通用复合特性工厂 `createToolbarActionFeature`，封装“快捷键 + Toolbar Action”的标准生命周期，消除样板代码，内置严格栈式逆序注销（LIFO：onDisable -> Toolbar -> Shortcut）与异常原子回滚；
3. **完善状态机自愈契约**：区分无状态动作（截图、PiP）与有状态播放（单曲循环），`PlayerLoopFeature` 在停用时协同调用 `PlayerController.getInstance().setLoop(false)`，杜绝关闭特性后视频持续循环且无界面入口停止的死锁；
4. **生命周期一体化契约**：特性的启用与停用同时作用于快捷键与控制栏按钮；禁用时快捷键立即注销，对应按钮同步从 Toolbar 移除；
5. **纯化 `PlayerController` 领域底座**：彻底剥离 `PlayerController` 内部的 `ShortcutDispatcher.register` 与 `Toolbar.registerActions` 调用，退守为仅提供无副作用、底层原子 API 的纯领域模型；
6. **常量与类型收敛**：所有按键、动作标识符与顺序权重收敛至 `PLAYER_FEATURE_CONSTANTS`，禁止魔法字符串；
7. **零摩擦平滑升级**：新增特性全量采用 `defaultValue: true`，升级后无缝保持老用户的全量快捷键与按钮体验。

---

## 3. 权衡与影响 (Consequences)

### 正面收益 (Positive)

- **完全的单一职责与高内聚**：每个特性的快捷键与 UI 按钮同生共死，满足按需停机与无残留原则；
- **消除浅模块冗余（DRY）**：通过工厂函数消除了多个独立动作模块的重复样板代码，并由工厂集中保证 LIFO 销毁与异常隔离；
- **状态自愈与鲁棒性**：明确了有状态特性的注销副作用拦截，消除了隐蔽的状态残留缺陷；
- **纯粹的领域底座**：`PlayerController` 职责高度聚焦于媒体状态机与浏览器底层 API，单测与维护复杂度显著降低；
- **精细化的用户掌控力**：用户可自由按需决定是否开启某项快捷键与控制栏按钮。

### 负面代价与约束 (Negative & Trade-offs)

- **特性描述符与配置项增多**：系统由原先的 1 个倍速开关扩展为 4 个播放器相关开关，需要在 `descriptors.ts` 与 `locales.ts` 中维护更多元数据条目。
