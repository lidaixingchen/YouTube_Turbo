# YouTube Turbo 核心特性全量对齐与架构完善方案

## 1. 方案概述

为了确保 YouTube Turbo 用户脚本在 YouTube 桌面端具备极致的稳定性、完全对齐的原生交互体验以及高内聚可维护的工程化架构，本方案针对前期深度审计中发现的系统性缺失，对以下三大核心模块制定全量对齐与加固实施规范：

1. **Tabview 核心架构与 Polymer 原型拦截加固**：重构聊天室位置保护机制、补充 iframe 异步加载防竞态、规范评论区滚动容器生命周期；
2. **播放器控制、快捷键体系与通用 HUD 提示系统**：解耦全局通用 HUD 独立样式引擎、实现调速面板与快捷键双向同步、补齐全功能全局快捷键、规范截图路径安全清洗；
3. **扩展特性、广告视觉标记、工具箱与国际化多语言体系**：补齐广告与 Premium 弹窗视觉标记、健全工具栏 30+ 语言多语言词条体系、完善响应式网格断点与 Shorts 货架排版。

---

## 2. 模块一：Tabview 核心架构与 Polymer 原型拦截加固

### 2.1 聊天室位置防塌陷拦截重构 (`src/features/tabview/page/polymer-patcher.ts`)
- **设计原理**：YouTube 原生 `ytd-watch-flexy.prototype.updateChatLocation` 会在视口尺寸变化或全屏/剧院模式切换时将 `#chat` 抽离当前包装器并移回主区域。必须拦截该方法，仅触发页面媒体查询与播放器尺寸更新，阻止 DOM 移位。
- **实现契约**：
  ```typescript
  // 在 patchWatchFlexy 中重写 updateChatLocation
  this.hookMethod(proto, "updateChatLocation", () => {
    return function (this: PolymerElementInstance): void {
      if (this.is !== "ytd-watch-grid") {
        PolymerPatcher.getInstance().runInProtectedContext(() => {
          this.updatePageMediaQueries?.();
          this.schedulePlayerSizeUpdate_?.();
        });
      }
    };
  });
  ```

### 2.2 聊天室 iframe 渲染竞态保护 (`src/features/tabview/page/polymer-patcher.ts`)
- **设计原理**：切入直播或折叠聊天室时，iframe 在零尺寸或未就绪状态下触发原生 `urlChanged` 易造成白屏或报错。通过 `IntersectionObserver` 监测 iframe 具备实际几何尺寸后再触发原生加载。
- **实现契约**：
  ```typescript
  // 在 patchLiveChatFrame 中重写 urlChanged
  this.hookMethod(proto, "urlChanged", (rawMethod) => {
    let tokenCounter = 0;
    return async function (this: PolymerElementInstance): Promise<void> {
      const currentToken = (tokenCounter = (tokenCounter & 0x3fffffff) + 1);
      const chatframe = (this.chatframe || (this.$ && this.$.chatframe)) as HTMLIFrameElement | undefined;
      
      if (chatframe instanceof HTMLIFrameElement) {
        if (!chatframe.contentDocument) {
          await Promise.resolve();
          if (currentToken !== tokenCounter) return;
        }
        
        const isBlank = !this.data || Boolean(this.collapsed);
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 700));
        const intersectionPromise = new Promise((resolve) => {
          const observer = new IntersectionObserver((entries, obs) => {
            for (let i = 0; i < entries.length; i++) {
              const rect = entries[i].boundingClientRect;
              if (isBlank || (rect.width > 0 && rect.height > 0)) {
                obs.disconnect();
                resolve(true);
                break;
              }
            }
          });
          observer.observe(chatframe);
        });

        await Promise.race([timeoutPromise, intersectionPromise]);
        if (currentToken !== tokenCounter) return;
      }
      return rawMethod.apply(this);
    };
  });
  ```

### 2.3 评论区滚动容器生命周期同步 (`src/features/tabview/page/coordinator.ts`)
- **设计规范**：在 `yt-navigate-finish` 路由完成与右侧栏挂载后，主动清除 `ytd-watch-flexy` 的 `keep-comments-scroller` 属性，防止多层冗余滚动条出现。

---

## 3. 模块二：播放器控制、快捷键与通用 HUD 提示系统

```mermaid
flowchart LR
    subgraph Trigger_Sources ["交互触发源"]
        KEY["全局快捷键 (Shift+S, Shift+P, Shift+L, Shift+R)"]
        UI["悬浮工具栏 Action / 调速浮层"]
    end

    subgraph Core_Controllers ["核心业务控制器"]
        PC["PlayerController (调速 / 循环 / PiP)"]
        SC["ScreenshotService (高保真截图与命名清洗)"]
    end

    subgraph Visual_Feedback ["用户视觉反馈"]
        HUD["PlaybackHUD (自适应平视提示)"]
        PANEL["SpeedPanel (浮层激活态高亮同步)"]
    end

    KEY --> PC
    KEY --> SC
    UI --> PC
    UI --> SC
    PC --> HUD
    PC --> PANEL
    SC --> HUD
```

### 3.1 全局 HUD 样式引擎独立解耦 (`src/core/hud.ts`)
- **设计原理**：将 HUD 提示样式从 `speed-control.ts` 剥离，收敛至 `PlaybackHUD` 单例，采用 `StyleEngine` 自动按需注入；
- **排版支持**：采用 `min-width: 80px; width: auto; min-height: 80px; padding: 0 20px; display: inline-flex;` 自适应排版，完美兼容速率文本（`2.0×`）与状态文案（`截图已保存` / `单曲循环: 开启`）。

### 3.2 调速面板双向激活态同步 (`src/features/player/speed-panel.ts`)
- **设计规范**：在 `PlayerController.onStateChange` 回调中，遍历并刷新浮层选项 `.SpeedControl_Extension_Speed-Option-Item`：
  - 若当前速率与选项预设一致，赋予 `.SpeedControl_Extension_Speed-Option-Item-Active`；
  - 若为快捷键调节出的非预设速率（如 `1.75×`），移除所有预设高亮，保持右下角按钮文本显示。

### 3.3 全功能快捷键调度体系 (`src/core/shortcuts.ts`)
- **快捷键映射表**：
  | 组合键 | 动作行为 | HUD 提示反馈 |
  | :--- | :--- | :--- |
  | `Shift + >` / `Shift + .` | 递增播放速率（+0.1x / 0.25x） | `${speed}×` |
  | `Shift + <` / `Shift + ,` | 递减播放速率（-0.1x / 0.25x） | `${speed}×` |
  | `Shift + R` | 重置播放速率为 `1.0×` | `1.0×` |
  | `Shift + S` | 当前视频帧高保真无损截图并下载 | 提示 `截图已保存` |
  | `Shift + P` | 切换原生画中画（Picture-in-Picture） | 提示 `画中画: 开启/关闭` |
  | `Shift + L` | 切换单曲循环播放（Loop Playback） | 提示 `单曲循环: 开启/关闭` |

- **输入框冲突防御加强**：
  在 `isTypingContext` 校验中新增对 `yt-live-chat-*`、`ytd-commentbox`、`tp-yt-iron-input` 等特有输入组件的 Shadow DOM 穿透判定。

### 3.4 截图文件名安全清洗 (`src/features/player/screenshot.ts`)
- **文件名生成规范**：
  ```typescript
  export function sanitizeFileName(name: string): string {
    return name.replace(/[/\\:*?"<>|]/g, "_").trim();
  }
  ```
  保证含有冒号、斜杠等特殊字符的视频标题能正常生成合规的本地下载文件名。

---

## 4. 模块三：扩展特性、广告标记、工具箱与国际化多语言体系

### 4.1 广告与推广位视觉标记扩展 (`src/features/adblock/index.ts`)
- **全量选择器矩阵**：
  ```css
  #masthead-ad,
  .video-ads.ytp-ad-module,
  ytd-ad-slot-renderer,
  ad-slot-renderer,
  yt-mealbar-promo-renderer,
  ytm-companion-ad-renderer,
  #related #player-ads,
  #related ytd-ad-slot-renderer,
  ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
  ytd-rich-item-renderer.style-scope.ytd-rich-grid-row #content:has(.ytd-display-ad-renderer),
  tp-yt-paper-dialog:has(yt-mealbar-promo-renderer),
  ytd-popup-container:has(a[href="/premium"])
  ```
- **视觉规则**：统一注入 `* { text-decoration: line-through !important; text-decoration-thickness: 2px !important; }`，并对容器保持半透明标注。

### 4.2 工具栏 30+ 语言多语言词条体系 (`src/i18n/locales.ts`)
- **补齐字典词条契约**：
  在全部 30+ 种语言字典中完整补充以下 6 个核心动作的国际化定义：
  ```typescript
  export interface LocaleContent {
    // 既有词条...
    action_setting: string;
    action_switch_theme: string;
    action_screenshot: string;
    action_pip: string;
    action_loop: string;
    action_download: string;
    hud_screenshot_saved: string;
    hud_pip_enabled: string;
    hud_pip_disabled: string;
    hud_loop_enabled: string;
    hud_loop_disabled: string;
  }
  ```
- **工具栏 Action 绑定改造**：在 `ActionRegistry` 中使用 `action_*` 作为 `titleKey`，确保悬浮 Tooltip 随页面语言实时自适应。

### 4.3 响应式网格断点与 Shorts 货架排版完善 (`src/features/grid/index.ts`)
- **断点计算对齐**：
  - 消除硬编码，统一引用 `GRID_CONSTANTS.BREAKPOINTS`；
  - 针对首页与订阅页中的 Shorts 货架（`ytd-rich-shelf-renderer`）注入弹性卡片宽度，自适应计算 `--ytd-rich-grid-slim-items-per-row`，杜绝宽屏下布局拉伸变形。

---

## 5. 实施与分步验证计划

```mermaid
gantt
    title YouTube Turbo 架构对齐与完善排期
    dateFormat  YYYY-MM-DD
    section 模块一: Tabview 与 Polymer
    updateChatLocation 防御重写           :a1, 2026-09-01, 1d
    聊天室 iframe urlChanged 竞态保护      :a2, after a1, 1d
    section 模块二: 播放器与快捷键
    HUD 独立样式引擎与排版自适应          :b1, 2026-09-01, 1d
    调速面板双向同步与高亮刷新            :b2, after b1, 1d
    补齐全功能快捷键与文件名清洗          :b3, after b2, 1d
    section 模块三: 扩展与国际化
    广告标记全量选择器补齐                :c1, 2026-09-02, 1d
    30+ 语言 Action 词条补齐与绑定        :c2, after c1, 1d
    网格断点与 Shorts 排版加固            :c3, after c2, 1d
    section 验收回归
    类型检查与构建打包 (0 错误 0 警告)     :d1, after b3, 1d
```

### 5.1 质量门禁与验证指标
1. **静态类型安全**：`pnpm run check` $\rightarrow$ 严格模式 **0 错误、0 警告**；
2. **构建完整性**：`pnpm run build` $\rightarrow$ 正确输出单文件 `dist/youtube-turbo.user.js`；
3. **全链路交互回归**：
   - 剧院模式与尺寸缩放时聊天室位置稳定；
   - 快捷键调速、截图、画中画、循环播放流畅触发且伴随精准 HUD 提示；
   - 工具栏悬浮文字与系统多语言精准对齐；
   - 页面广告与 Premium 弹窗被准确标记。
