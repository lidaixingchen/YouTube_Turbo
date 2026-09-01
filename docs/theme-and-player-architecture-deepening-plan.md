# YouTube Turbo – 主题与播放器子系统深模块化重构方案 (Theme & Player Architecture Deepening Plan)

本方案基于 **Codebase Design** 哲学（深模块、清晰缝隙、高杠杆、局部性与删除测试），针对代码库中的 **Candidate 1（主题子系统）** 与 **Candidate 2（播放器控制器子系统）** 进行系统性深化重构。

---

## 1. 架构目标与设计原则

- **深模块（Deep Module）**：提供极小、稳定且具备高杠杆（Leverage）的公共接口，将 Cookie 结构化解析、持久化配置、DOM 树观察、浮点调速精度对齐、快捷键调度及 Canvas 物理渲染等细节完全封装在内部。
- **单一事实源（Single Source of Truth, SSOT）**：杜绝跨存储（GM Storage 与 Cookie）双写不一致风险，以底层真实运行环境（YouTube PREF Cookie 与原生 `<video>` 状态）为唯一基准。
- **分层治理与生命周期解耦**：核心媒体控制底座（Core Media Engine）常驻可用，视图组件（UI Views）与键盘交互（Shortcuts）作为上层可插拔特性（Features）受注册中心管控，避免特性卸载导致全局底座瘫痪。
- **删除测试（Deletion Test）**：清除无业务凝聚力的浅包装（Shallow Wrappers）与冗余门面（Facades），确保代码库复杂度在深模块内高度内聚。
- **测试面收敛（The Interface is the Test Surface）**：重构后每个子系统有且仅有一个外部 Seam，测试与上层业务（Feature Registry、Toolbar 等）均只通过该 Seam 交互。

---

## 2. 领域模型与术语对齐 (`CONTEXT.md`)

- **`ThemeController`**：主题统管深模块，以 YouTube `PREF` Cookie 为唯一事实源，内置结构化键值编解码与长效持久化引擎。
- **`PlayerController`**：播放器核心底座深模块，统管 `<video>` 生命周期、高杠杆调速原子操作、单曲循环、原生画中画、物理分辨率截图及状态发布/订阅总线。
- **`PlayerSpeedButtonView`**：播放器控制栏右下角倍速展示按钮与悬浮倍速菜单的轻量视图适配层。
- **`PlayerShortcuts`**：播放器快捷键（调速/重置/截图/画中画/循环）调度适配器，支持独立生命周期管理。

---

## 3. Candidate 1：主题子系统深化 (`ThemeController`)

### 3.1 现状分析与重构收益
- **现状缺陷**：
  1. `src/features/theme/` 存在 3 层浅对象（`ThemeCookieAdapter` -> `ThemeEngine` -> `Theme`），层层转发；
  2. 调用方（如 `Toolbar`）自行读写 GM Storage 并双写 Cookie，当用户在 YouTube 原生设置切换主题时，会导致状态冲突与配置覆盖；
  3. 正则表达式 `/&?f6=\d+/g` 替换 Cookie 存在边界截断风险，且缺少 `Max-Age` 与 `SameSite` 属性。
- **重构收益**：
  1. 确立 `PREF` Cookie 为唯一事实源，彻底移除调用方对主题 Storage 的多余写入；
  2. 采用结构化键值对编解码（`PrefCookieCodec`），防御性解析与修改 `f6` 标记；
  3. 规范 Cookie 过期时间（2 年持久化）与 `SameSite=Lax; Secure` 属性；
  4. 对外提供正交极简的 `getTheme()` / `setTheme()` / `toggleTheme()` 接口。

### 3.2 架构设计

```
[ Callers: Toolbar / Settings / Menu ]
                  │
                  │ getTheme(), setTheme(mode, options?), toggleTheme(options?)
                  ▼
┌────────────────────────────────────────────────────────┐
│ Deep Module: ThemeController                           │
│                                                        │
│  [Private Implementation]                              │
│   ├── PrefCookieCodec (结构化解析与序列化 & 键值对)        │
│   │    - parse(raw): Map<string, string>               │
│   │    - serialize(map): string                        │
│   │    - Target Flags: f6=400 (dark), f6=80000 (light) │
│   ├── Cookie Persistence Engine                        │
│   │    - Domain: .youtube.com, Path: /, SameSite: Lax  │
│   │    - Max-Age: 63072000s (2 年), Secure             │
│   └── Page Reload Dispatcher                           │
└────────────────────────────────────────────────────────┘
```

### 3.3 目标接口定义 (`src/features/theme/theme-controller.ts`)

```typescript
export type ThemeMode = "dark" | "light";

export interface ThemeOptions {
  /** 是否在更新 Cookie 后刷新页面生效，默认为 true */
  reload?: boolean;
}

export class ThemeController {
  private static instance: ThemeController | null = null;

  private constructor() {}

  public static getInstance(): ThemeController {
    if (!ThemeController.instance) {
      ThemeController.instance = new ThemeController();
    }
    return ThemeController.instance;
  }

  /**
   * 从 YouTube PREF Cookie 中实时解析当前主题模式（唯一事实源）
   */
  public getTheme(): ThemeMode;

  /**
   * 设置深色或浅色主题，写入长效 PREF Cookie 并按需刷新
   */
  public setTheme(mode: ThemeMode, options?: ThemeOptions): void;

  /**
   * 翻转当前主题
   */
  public toggleTheme(options?: ThemeOptions): ThemeMode;
}
```

### 3.4 交付与变更清单
1. **新建** `src/features/theme/theme-controller.ts`：实现单例深模块 `ThemeController`，内聚结构化键值解析、长效 Cookie 读写与重载调度。
2. **删除** `src/features/theme/theme-cookie.ts`。
3. **删除** `src/features/theme/theme-engine.ts`。
4. **修改** `src/features/theme/index.ts`：统一导出 `ThemeController`、`ThemeMode`、`ThemeOptions` 与 `ThemeProgressbar`。
5. **修改** `src/ui/toolbar/toolbar.ts`：移除直接读写 `StorageUtil.keys.youtube.theme` 的逻辑，统一通过 `ThemeController.getInstance()` 调度。

---

## 4. Candidate 2：播放器控制子系统深化 (`PlayerController`)

### 4.1 现状分析与重构收益
- **现状缺陷**：
  1. **生命周期错位**：`isOpenSpeedControl` 特性直接掌控了 `PlayerController` 的初始化与销毁，导致关闭倍速功能时 Toolbar 的截图、画中画与循环播放一并失效；
  2. **接口杠杆低**：未提供增减速率与重置的原子方法，调用方必须自行维护 `0.25` 步进、浮点精度舍入与 `0.05~16.0` 边界判断；
  3. **职责越界**：快捷键注册全量堆叠在 UI 模块（`speed-control.ts`）中；
  4. **截图副作用强耦合**：`captureScreenshot` 写死了文件下载行为，不支持纯数据获取；
  5. **空壳转发**：`src/features/player/screenshot.ts` 仅有 8 行代码。
- **重构收益**：
  1. **分层解耦**：`PlayerController` 作为核心底座常驻，倍速 UI（`PlayerSpeedButtonView`）与快捷键（`PlayerShortcuts`）作为可插拔特性受 `FeatureRegistry` 管控；
  2. **高杠杆 API**：提供 `increaseSpeed()`、`decreaseSpeed()`、`resetSpeed()` 原子操作，内部统一依据通用常量进行精度与边界约束；
  3. **正交截图**：支持 `download: boolean` 配置，并返回包含 `blob`、`dataUrl`、`filename` 的结构化结果；
  4. **规范与健壮**：收敛常量至 `src/features/player/constants.ts`，修复选择器硬编码与事件泄漏。

### 4.2 架构设计

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Feature Layer (可插拔特性层)                                              │
│                                                                          │
│  [FeatureRegistry: isOpenSpeedControl]                                   │
│      ├── PlayerSpeedButtonView (右下角 .ytp-right-controls 按钮与菜单挂载)  │
│      └── PlayerShortcuts (Shift+> / < / R / S / P / L 键盘交互调度)       │
│                                                                          │
│  [Toolbar / Toolbox] ───────► (截图 / 画中画 / 循环播放 / 状态同步)        │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │ 调用核心 API
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Core Domain: PlayerController (播放器核心底座深模块)                       │
│                                                                          │
│  ├── High-Leverage Public Interface                                      │
│  │    ├── setSpeed(), increaseSpeed(), decreaseSpeed(), resetSpeed()     │
│  │    ├── toggleLoop(), setLoop(), isLoopEnabled()                       │
│  │    ├── togglePictureInPicture()                                       │
│  │    ├── captureScreenshot({ download, format, quality, customTitle })  │
│  │    └── getState(), onStateChange(cb), onReady(cb)                     │
│  │                                                                       │
│  └── Private Subsystems                                                  │
│       ├── Video Tracker (MutationObserver + NavigationToken 防竞态)       │
│       ├── Precision Math Clamper (基于 core/constants.ts 常量)           │
│       ├── Resolution Canvas Capturer & Safe Downloader                   │
│       └── PlaybackHUD Toast Synchronizer                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3 模块常量契约 (`src/features/player/constants.ts`)

```typescript
export const PLAYER_CONSTANTS = {
  SELECTORS: {
    PLAYER_CONTAINER: "#movie_player, #player-container-outer .html5-video-player",
    RIGHT_CONTROLS: ".ytp-right-controls",
    SPEED_BUTTON: ".yt-turbo-speed-btn",
    SPEED_OPTIONS_MENU: "#yt-turbo-speed-options"
  },
  CLASSES: {
    SPEED_BUTTON: "ytp-button yt-turbo-speed-btn",
    SPEED_OPTIONS_MENU: "yt-turbo-speed-options-menu",
    SPEED_OPTION_ITEM: "yt-turbo-speed-option-item",
    SPEED_OPTION_ITEM_ACTIVE: "yt-turbo-speed-option-item-active"
  },
  PRESET_SPEEDS: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]
} as const;
```

### 4.4 目标接口定义 (`src/features/player/controller.ts`)

```typescript
export interface PlayerState {
  speed: number;
  isLoop: boolean;
  isPiP: boolean;
  isReady: boolean;
  videoElement: HTMLVideoElement | null;
}

export interface ScreenshotOptions {
  format?: string;
  quality?: number;
  download?: boolean;
  customTitle?: string;
}

export interface ScreenshotResult {
  blob: Blob;
  dataUrl: string;
  filename: string;
}

export class PlayerController {
  private static instance: PlayerController | null = null;

  private constructor() {}

  public static getInstance(): PlayerController;

  public init(): void;
  public destroy(): void;

  // --- 播放速率原子操作（高杠杆） ---
  public getSpeed(): number;
  public setSpeed(rate: number, showToast?: boolean): void;
  public increaseSpeed(step?: number, showToast?: boolean): number;
  public decreaseSpeed(step?: number, showToast?: boolean): number;
  public resetSpeed(showToast?: boolean): number;

  // --- 单曲循环 ---
  public toggleLoop(forceState?: boolean): boolean;
  public setLoop(enabled: boolean): void;
  public isLoopEnabled(): boolean;

  // --- 原生画中画 ---
  public togglePictureInPicture(): Promise<boolean>;

  // --- 高保真物理分辨率截图 ---
  public captureScreenshot(options?: ScreenshotOptions): Promise<ScreenshotResult | null>;

  // --- 状态订阅与生命周期 ---
  public getState(): PlayerState;
  public onReady(callback: (state: PlayerState) => void): () => void;
  public onStateChange(callback: (state: PlayerState) => void): () => void;
}
```

### 4.5 视图适配器与快捷键调度器契约

#### 视图适配器 (`src/features/player/speed-button-view.ts`)
```typescript
export class PlayerSpeedButtonView {
  public static mount(): void;
  public static unmount(): void;
}
```

#### 快捷键适配器 (`src/features/player/shortcuts.ts`)
```typescript
export class PlayerShortcuts {
  public static enable(): void;
  public static disable(): void;
}
```

### 4.6 交付与变更清单
1. **新建** `src/features/player/constants.ts`：规范化类名、选择器与预设倍速列表常量。
2. **重构** `src/features/player/controller.ts`：实现类单例 `PlayerController`，提供高杠杆调速原子操作、正交截图方法及状态总线。
3. **新建** `src/features/player/shortcuts.ts`：实现 `PlayerShortcuts`，统管播放器快捷键（`Shift+>`、`Shift+<`、`Shift+R`、`Shift+S`、`Shift+P`、`Shift+L`）的注册与解绑。
4. **重构并重命名** `src/features/player/speed-control.ts` → `src/features/player/speed-button-view.ts`：剥离快捷键与核心媒体逻辑，专职负责控制栏按钮与悬浮菜单的 DOM 挂载。
5. **删除** `src/features/player/screenshot.ts`。
6. **修改** `src/features/player/index.ts`：导出 `PlayerController`、`PlayerSpeedButtonView`、`PlayerShortcuts` 及核心类型。
7. **修改** `src/registry/descriptors.ts`：`isOpenSpeedControl` 特性的 `setup`/`teardown` 绑定到 `PlayerSpeedButtonView` 与 `PlayerShortcuts`，`PlayerController` 作为全局基础底座在入口启动。
8. **修改** `src/ui/toolbar/toolbar.ts`：调用点对齐到 `PlayerController.getInstance()`。

---

## 5. 验证计划与测试策略

1. **类型安全性检查**：
   运行 `pnpm run check`，确保 TypeScript 严格模式无任何编译错误、无隐式 `any`，所有入参与返回值显式标注。
2. **构建产物验证**：
   运行 `pnpm run build`，确保 `dist/youtube-turbo.user.js` 生成正常，esbuild sub-bundle 与 IIFE 虚拟模块打包完好。
3. **端到端功能验证矩阵**：
   - **主题切换**：
     - 点击工具栏主题切换按钮，验证 `PREF` Cookie 中的 `f6` 正确更新为 `400`（深色）或 `80000`（浅色）；
     - 验证页面刷新后深浅色主题生效，且重启浏览器后配置不丢失；
     - 验证在 YouTube 原生设置切换主题后，脚本不会用旧配置覆盖。
   - **播放器控制底座与特性解耦**：
     - 在设置面板中关闭 `isOpenSpeedControl` 特性，验证控制栏倍速按钮和快捷键正常卸载；
     - 在倍速特性关闭状态下，点击工具栏中的“截图”、“画中画”、“循环播放”，验证核心媒体控制仍正常工作。
   - **高杠杆调速与 HUD**：
     - 触发 `Shift+>` / `Shift+<` / `Shift+R`，验证倍速以 `0.25` 步进平滑增减并正确触发 HUD 提示；
     - 在倍速菜单中点击各预设倍速，验证状态同步与 active 样式高亮。
   - **高保真截图**：
     - 触发 `Shift+S` 或工具栏截图，验证按真实物理分辨率（`videoWidth` × `videoHeight`）生成图片并下载，文件名包含清洗后的视频标题与精确时间戳。
