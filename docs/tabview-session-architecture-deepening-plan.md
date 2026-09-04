# TabviewSession 跨上下文会话架构深化方案

## 1. 方案目标

本方案将 Tabview 沙箱端与页面端之间分散的脚本注入、消息分发、启动握手、错误恢复和资源清理收敛为 `TabviewSession` 领域 module，同时将浏览器事件传输封装在 `RuntimeChannel` transport module 中。

最终 architecture 保持现有 feature interface 不变：

```typescript
export const Tabview = {
  setup(): Promise<void>;
  destroy(): void;
};
```

调用方仍只理解 `Tabview.setup()` 与 `Tabview.destroy()`。跨上下文 session 的 `namespace`、版本、身份、顺序、运行时校验、READY queue、超时回滚与 listener 释放全部成为隐藏 implementation。由此提高 module depth：较小的稳定 interface 隐藏显著多于当前 `emit/on` 所暴露的复杂度，并把 protocol 规则集中到具备高 leverage 与高 locality 的位置。

方案遵守以下既有约束：

- 沙箱端与页面端保持物理隔离。启动时，bootstrap 作为安全序列化后的纯数据注入 page main 参数；双方 session 建立后，后续消息才只通过 `window` 上的 `CustomEvent` 传递。
- bootstrap 与 `CustomEvent.detail` 均只允许可验证、可序列化的数据，不传递函数、DOM、原型对象或上下文句柄；`sessionId` 仅是并发 session 的隔离与关联标识，不是认证凭据或安全边界。
- 页面端不得调用 `GM_*`；沙箱端不得同步读取 `window.yt` 或 Polymer 内部状态。
- 遵守 ADR-0003，生命周期由事件与 Polymer hook 驱动，不引入轮询。
- 不引入 RPC、capabilities negotiation、state revisions 或通用消息总线。
- TypeScript strict 下所有输入、返回值与 callback 均显式标注类型，禁止 `any`。

## 2. 当前架构摩擦

当前 `RuntimeBridge` 是一个 shallow module：它暴露 stringly typed 的 `emit/on` interface，却没有隐藏完整的 session 语义。

- `communicationKey` 被创建和传递，但接收路径未使用它过滤 packet，不同初始化实例之间缺少真实隔离。
- `BridgePacket.type` 是任意字符串，`BridgeHandler<T = any>` 将协议正确性推给每个 caller。
- `PageBridgeAdapter` 手工注册每一种 message，并在 callback 中重复做局部 payload 判断。
- `RuntimeBridge` 注册的全局 event listener 没有对应移除路径，`destroy()` 仅清空上层引用。
- 页面注入、page main 启动、`TabviewLifecycleCoordinator.init()`、READY 与 teardown 的 ordering 分散在多个文件。
- 重复 `setup()` 可能创建并存 bridge 与重复页面注入，失败路径没有原子 rollback。

这些问题导致理解一次跨上下文启动必须往返多个 shallow module，interface 几乎与 implementation 一样复杂。深化后的目标是让 caller 只表达领域 command/event，session 自己保证 transport 与 protocol invariants。

## 3. 目标 architecture

```text
FeatureRegistry
    |
    | setup / destroy
    v
Tabview                         沙箱上下文
    |
    | 创建 bootstrap、建立 listener、注入 page bundle
    v
TabviewSession<"sandbox">
    |
    | typed envelope
    v
RuntimeChannel<Envelope> ------- CustomEvent ------- RuntimeChannel<Envelope>
                                                        |
                                                        v
                                            TabviewSession<"page">
                                                        |
                                                        | typed command / event
                                                        v
                                          TabviewLifecycleCoordinator
                                                     页面上下文
```

module 职责如下：

- `RuntimeChannel`：transport deep module。只负责本地 `CustomEvent` listener 的安装、派发和释放，不理解 Tabview command、READY 或 locale。
- `TabviewSession`：领域 protocol deep module。负责 envelope、runtime validation、session 状态机、READY queue、sequence、close 和 protocol error。
- `Tabview`：沙箱 composition root。保持现有 interface，负责生成 bootstrap、先创建 session 后注入页面脚本，并执行 setup dedupe 与 timeout rollback。
- `page/main`：页面 composition root。创建 page session 与 `TabviewLifecycleCoordinator`，完成 coordinator 初始化后发布 READY。
- `TabviewLifecycleCoordinator`：维持现有页面领域职责，只接收已通过校验的 command，并将领域变化发布为 typed event；不依赖 `CustomEvent`、envelope 或 transport。

`RuntimeChannel` 与 `TabviewSession` 是两层不同的 module。前者隐藏 transport implementation，后者隐藏领域 protocol implementation。两者之间的 seam 是完整 envelope；`TabviewSession` 与 `TabviewLifecycleCoordinator` 之间的 seam 是 typed command/event union。

`CONTEXT.md` 已登记 `TabviewSession` 与 `RuntimeChannel`，后续代码、测试与文档统一使用这两个 module 名称。

## 4. 文件落位

| 文件 | 终态职责 |
| --- | --- |
| `src/core/bridge.ts` | 将现有 `BridgeInstance` 收敛为 `RuntimeChannel<T>`；只实现 `CustomEvent` transport、listener 生命周期和异常隔离。 |
| `src/features/tabview/types.ts` | 定义 `TabviewBootstrap`、role、session ID、command/event union、envelope、状态、错误和结果类型。 |
| `src/features/tabview/protocol.ts` | 实现 protocol 的 runtime validator、envelope codec、session ID/sequence 校验；不访问 DOM。 |
| `src/features/tabview/session.ts` | 实现 `TabviewSession` 状态机、READY queue、typed dispatch、close 与 channel 组合。 |
| `src/features/tabview/constants.ts` | 保存 namespace、protocol version、READY timeout、event name 等具名常量，替代散落字符串和数值。 |
| `src/features/tabview/index.ts` | 保持 `Tabview.setup()/destroy()`；负责 setup dedupe、listener-before-injection、页面注入和失败 rollback。 |
| `src/features/tabview/page/index.ts` | 页面 composition root；创建 page session，连接 `TabviewLifecycleCoordinator`，在 coordinator 初始化完成后发送 READY。 |
| `src/features/tabview/page/bridge-adapter.ts` | 迁移完成后删除；其 message mapping 职责由 `TabviewSession` 与 page composition root 接管。 |
| `src/types/index.ts` | 删除通用 `BridgePacket`；Tabview envelope 留在 feature domain，避免核心类型泄漏领域 protocol。 |
| `src/features/tabview/__tests__/protocol.test.ts` | 运行时校验、方向、版本、session ID 与 sequence 单元测试。 |
| `src/features/tabview/__tests__/session.test.ts` | READY queue、close、listener 释放、错误隔离与多 session 测试。 |
| `src/features/tabview/__tests__/setup.test.ts` | 注入 ordering、dedupe、超时 rollback 和重试测试。 |
| `src/features/tabview/__tests__/session-ownership.integration.test.ts` | 联合验证 session、Tabview lifecycle ownership、READY barrier、destroy 与 re-setup。 |
| `src/test/setup.ts` | 共享 `afterEach`：恢复 real timers、解除 global stub、清理 DOM，并通过测试侧 instrumentation 断言 listener/observer 数量归零。 |
| `CONTEXT.md` | 保留已登记的 `TabviewSession` 与 `RuntimeChannel` 定义。 |

删除文件属于实施阶段的显式步骤；执行时按项目规范逐一处理，不批量删除。

## 5. 领域 protocol 类型

### 5.1 bootstrap 与 session 身份

```typescript
export type TabviewSessionRole = "sandbox" | "page";

declare const tabviewSessionIdBrand: unique symbol;

export type TabviewSessionId = string & {
  readonly [tabviewSessionIdBrand]: true;
};

export interface TabviewBootstrap {
  readonly namespace: typeof TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE;
  readonly protocolVersion: typeof TABVIEW_CONSTANTS.PROTOCOL_VERSION;
  readonly sessionId: TabviewSessionId;
  readonly initialLocale: LocaleSnapshot;
}
```

`TabviewBootstrap` 是页面注入唯一允许携带的初始化数据。`page/main` 签名收敛为：

```typescript
export function main(bootstrap: TabviewBootstrap): void;
```

页面端必须再次执行 runtime validation，不能因为 bootstrap 来自同一构建产物就跳过边界检查。

### 5.2 command 与 event

```typescript
export type TabviewCommand =
  | {
      readonly type: "set-active-tab";
      readonly tabKey: TabKey;
    }
  | {
      readonly type: "set-font-size";
      readonly tabKey: TabKey;
      readonly fontSize: number;
    }
  | {
      readonly type: "update-locale";
      readonly snapshot: LocaleSnapshot;
    };

export type TabviewEvent =
  | {
      readonly type: "ready";
      readonly protocolVersion: typeof TABVIEW_CONSTANTS.PROTOCOL_VERSION;
    }
  | {
      readonly type: "tab-changed";
      readonly tabKey: TabKey;
    }
  | {
      readonly type: "font-size-changed";
      readonly tabKey: TabKey;
      readonly fontSize: number;
    };

export type TabviewInbound<R extends TabviewSessionRole> =
  R extends "sandbox" ? TabviewEvent : TabviewCommand;

export type TabviewOutbound<R extends TabviewSessionRole> =
  R extends "sandbox" ? TabviewCommand : TabviewEvent;
```

关闭属于 session control，不作为 `TabviewCommand`。这样 `TabviewLifecycleCoordinator` 只处理领域行为，资源终止由 session lifecycle 处理。

### 5.3 envelope

```typescript
export interface TabviewEnvelope<T> {
  readonly namespace: typeof TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE;
  readonly protocolVersion: typeof TABVIEW_CONSTANTS.PROTOCOL_VERSION;
  readonly sessionId: TabviewSessionId;
  readonly sender: TabviewSessionRole;
  readonly target: TabviewSessionRole;
  readonly sequence: number;
  readonly body:
    | {
        readonly kind: "message";
        readonly value: T;
      }
    | {
        readonly kind: "close";
        readonly reason: TabviewCloseReason;
      };
}
```

envelope 只包含 transport 与 session 正确性所需字段。时间戳不参与协议一致性判断，因此不进入终态 envelope。协议不包含 request ID、RPC response、capabilities 或 revision。

## 6. 最小 interface 草图

### 6.1 RuntimeChannel

`RuntimeChannel` 采用 callback-at-creation，避免额外暴露 `on/off`。工厂与 handle 的 `post/close` 形成 3 个 entry points：

```typescript
export interface RuntimeChannelOptions<T> {
  readonly eventName: string;
  readonly receive: (value: unknown) => void;
  readonly onHandlerError: (error: unknown) => void;
}

export interface RuntimeChannel<T> {
  post(value: T): void;
  close(): void;
}

export function createRuntimeChannel<T>(
  options: RuntimeChannelOptions<T>
): RuntimeChannel<T>;
```

`RuntimeChannel` 不执行领域 validation。`receive` 故意接收 `unknown`，强制 `TabviewSession` 在跨上下文 seam 上先验证后使用。其 implementation 持有准确的 listener function 与 closed 状态，`close()` 必须移除 listener。

### 6.2 TabviewSession

```typescript
export type TabviewSessionState =
  | "awaiting-ready"
  | "ready"
  | "closing"
  | "closed";

export type TabviewCloseReason =
  | "feature-disabled"
  | "setup-replaced"
  | "setup-timeout"
  | "injection-failed"
  | "protocol-error"
  | "page-closed";

export type TabviewProtocolErrorCode =
  | "invalid-envelope"
  | "namespace-mismatch"
  | "version-mismatch"
  | "session-mismatch"
  | "direction-mismatch"
  | "invalid-sequence"
  | "duplicate-ready"
  | "invalid-message";

export interface TabviewProtocolError {
  readonly code: TabviewProtocolErrorCode;
  readonly cause?: unknown;
}

export type TabviewSessionNotice<R extends TabviewSessionRole> =
  | {
      readonly kind: "message";
      readonly message: TabviewInbound<R>;
    }
  | {
      readonly kind: "closed";
      readonly reason: TabviewCloseReason;
    }
  | {
      readonly kind: "protocol-error";
      readonly error: TabviewProtocolError;
    };

export interface TabviewSessionOptions<R extends TabviewSessionRole> {
  readonly role: R;
  readonly bootstrap: TabviewBootstrap;
  readonly receive: (notice: TabviewSessionNotice<R>) => void;
}

export type TabviewDispatchResult =
  | { readonly status: "sent" }
  | { readonly status: "queued" }
  | { readonly status: "closed" };

export interface TabviewSession<R extends TabviewSessionRole> {
  dispatch(message: TabviewOutbound<R>): TabviewDispatchResult;
  close(reason?: TabviewCloseReason): void;
}

export function createTabviewSession<R extends TabviewSessionRole>(
  options: TabviewSessionOptions<R>
): TabviewSession<R>;
```

工厂、`dispatch`、`close` 是该 deep module 的 3 个 entry points。listener 注册、queue、sequence、validator、channel 与 close envelope 都隐藏在 implementation 中。

### 6.3 caller usage

以下代码只表达 composition ordering。`createTabviewBootstrap`、`createTabviewReadyGate`、`injectTabviewPage` 与 `handleSandboxNotice` 均是 `Tabview` owner 内部的 private pseudocode，不是 export，也不构成 public interface。

沙箱端：

```typescript
const bootstrap: TabviewBootstrap = createTabviewBootstrap(
  Locale.exportActiveSnapshot()
);
const readyGate: TabviewReadyGate = createTabviewReadyGate(
  TABVIEW_CONSTANTS.READY_TIMEOUT_MS
);

const session: TabviewSession<"sandbox"> = createTabviewSession({
  role: "sandbox",
  bootstrap,
  receive: (notice: TabviewSessionNotice<"sandbox">): void => {
    handleSandboxNotice(notice, readyGate);
  }
});

await injectTabviewPage(pageBundleCode, bootstrap);
await readyGate.promise;
```

页面端：

```typescript
export function main(bootstrapInput: unknown): void {
  const bootstrap: TabviewBootstrap = validateTabviewBootstrap(bootstrapInput);
  const coordinator: TabviewLifecycleCoordinator =
    TabviewLifecycleCoordinator.getInstance();

  const session: TabviewSession<"page"> = createTabviewSession({
    role: "page",
    bootstrap,
    receive: (notice: TabviewSessionNotice<"page">): void => {
      if (notice.kind === "message") {
        applyCommand(coordinator, notice.message);
      } else if (notice.kind === "closed") {
        coordinator.destroy();
      }
    }
  });

  coordinator.init(bootstrap.initialLocale, {
    onTabChanged: (tabKey: TabKey): void => {
      session.dispatch({ type: "tab-changed", tabKey });
    },
    onFontSizeChanged: (tabKey: TabKey, fontSize: number): void => {
      session.dispatch({ type: "font-size-changed", tabKey, fontSize });
    }
  });

  session.dispatch({
    type: "ready",
    protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION
  });
}
```

`applyCommand` 是 page composition root 内部的 private pseudocode，不是 export。它把 typed union 穷尽映射到 `TabviewLifecycleCoordinator.setActiveTab()`、`setFontSize()` 与 `setLocale()`，不再检查 transport 字段。

## 7. protocol invariants

### 7.1 身份与方向

- `namespace` 必须与 `TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE` 完全一致。
- `protocolVersion` 必须精确相等，不进行隐式降级或 capabilities negotiation。
- `sessionId` 必须与当前 bootstrap 一致；旧 setup 的 envelope 一律忽略。
- `sessionId` 只提供 correlation 与隔离，不证明发送者身份；不得据此放宽 runtime validation 或传入敏感数据。
- `sender` 必须是当前 role 的对端，`target` 必须是当前 role。
- sandbox 只能发送 `TabviewCommand`，page 只能发送 `TabviewEvent`。

### 7.2 顺序

- 每个 session、每个 sender 从具名初始 sequence 常量开始单调递增。
- 接收端仅接受大于最后已接受 sequence 的 envelope。
- 重复或倒退 sequence 产生 `invalid-sequence` diagnostic，且不调用领域 handler。
- sequence 仅保证同一页面进程内顺序，不承担持久化 revision 职责。

### 7.3 READY queue

- sandbox session 初始状态为 `awaiting-ready`。
- page session 在 READY barrier 完成前，所有普通 `TabviewEvent` 进入 FIFO queue，不得抢先发到 sandbox。
- sandbox 在 READY 前发出的 command 进入 FIFO queue；收到有效 READY 后按原序一次性 flush。
- page 在 READY 前收到的 command 不交付给 coordinator；底层 session 负责暂存。
- READY 是 protocol control 与特殊状态转换，不进入普通 event queue。page 发送 READY 时先将本地 session 置为 `ready` 并进入内部 announcing 状态，再同步 post READY envelope。
- sandbox 收到首个有效 READY 后先置为 `ready`，再 FIFO flush 已排队 command。由于 `CustomEvent.dispatchEvent` 同步执行，这些 command 可在 page 的 READY post 返回前到达；该窗口内新产生的 page event 仍并入 page FIFO queue。
- READY post 返回后，page 退出 announcing 状态，再 FIFO flush 初始化期间及 announcing 窗口内积累的普通 event，确保 sandbox 已经跨过 barrier。
- 同一 session 的第二个 READY 产生 `duplicate-ready` protocol error 并被忽略，不重复 flush、不重置 sequence、不改变状态。
- close control 不进入 READY queue，任何状态下都立即生效。
- queue 上限使用 `constants.ts` 中的具名常量；超过上限视为 protocol error 并关闭 session，避免未就绪页面造成无界内存增长。

### 7.4 READY barrier

page 只能在以下同步阶段全部完成后发布 READY：

1. page `TabviewSession` 与 `RuntimeChannel` listener 已建立；
2. `TabviewLifecycleCoordinator` 的 navigation listener 已安装；
3. 当前 watch route 的 lifecycle owner 已建立；非 watch route 则完成对应空闲 owner 状态；
4. 当前 route 的初始 mount/single-pass sync 已完成；
5. `PolymerPatcher.replayConnected()` 已同步重放当前已连接的相关 Custom Elements，使既有节点进入与后续 Polymer hook 相同的 ownership 路径。

READY barrier 不等待未来才定义或挂载的 Custom Elements。异步 prototype patch 尚不可用时记录受限 diagnostic，后续由真实 Custom Element/Polymer 生命周期继续驱动；不得为等待它们增加 polling、级联 timeout 或延迟 READY。

### 7.5 runtime validation

- 所有 `CustomEvent.detail` 从 `unknown` 开始验证。
- envelope validator 先验证对象形状与公共字段，再按 role 验证 message union。
- `TabKey` 仅允许 `info/comments/videos/playlist`。
- font size 必须是有限数值，并满足 TabsView 既有范围约束；范围常量必须复用或收敛至 `constants.ts`。
- locale snapshot 必须验证 locale、direction 与 string message map。
- validator 返回 discriminated result，不依赖异常完成普通失败控制流。

## 8. 生命周期 ordering

### 8.1 setup

`Tabview.setup()` 的确定性顺序如下：

1. 校验 host；不匹配时无副作用返回。
2. 若状态为 `starting` 或 `ready`，直接复用当前 setup promise，完成 setup dedupe。
3. 创建新的 `TabviewBootstrap` 与 `sessionId`。
4. 创建 sandbox `TabviewSession`。此步骤同步安装 `RuntimeChannel` listener。
5. 启动 READY 单次 timeout。
6. 将 bootstrap 安全序列化为纯数据并作为 page main 参数注入 page bundle；此时尚未通过 `CustomEvent` 发送领域消息。
7. page main 验证 bootstrap，创建 page session listener。
8. page main 初始化 `TabviewLifecycleCoordinator`，依次建立 navigation listener、当前 route owner、初始 mount 与 observer ownership。
9. `PolymerPatcher.replayConnected()` 同步重放当前已连接节点；至此完成统一 READY barrier。
10. page session 先置 `ready`，再 post READY。
11. sandbox 验证 READY并置 `ready`，取消 timeout，FIFO flush command queue。
12. READY post 返回后，page FIFO flush 初始化阶段的普通 event queue。
13. 注入样式并完成 setup promise。

第 4 步必须早于第 6 步，形成 listener-before-injection invariant，避免同步执行的注入脚本在 listener 建立前发送 READY。

### 8.2 destroy

1. 将 feature 状态切换为 `stopping`，阻止新的 setup 复用旧 promise。
2. 取消 READY timeout。
3. 调用 sandbox session `close("feature-disabled")`，向 page 发送 close control。
4. page session 将 close notice 交给 page composition root。
5. page composition root 调用 `TabviewLifecycleCoordinator.destroy()`。
6. coordinator 严格执行 `docs/tabview-observer-ownership-architecture-deepening-plan.md` 第 9.4 节定义的唯一 feature teardown ordering；本方案不复制或重定义 page owner 的内部清理顺序。
7. coordinator teardown 完成后，page composition root 关闭 page session；page session 再关闭其 `RuntimeChannel`。
8. sandbox session 的隐藏 implementation 关闭 sandbox `RuntimeChannel`，同步移除 listener并清空 queue。
9. 沙箱端清空 session、bootstrap 与 setup promise 引用，移除 Tabview attribute 与样式。
10. 将 feature 状态切换为 `idle`。

`destroy()` 必须幂等。page composition root 使用 `try/finally` 保证 coordinator owner cleanup 发生在 page session/channel close 之前；任一步骤的异常不能阻止其余资源清理。

### 8.3 重复 setup

- 并发调用共享同一个 in-flight promise，不重复注入、不重复创建 listener。
- 已 ready 时再次调用直接返回已完成结果。
- timeout 或 injection failure rollback 完成后，下一次 setup 可以生成新 session 并重试。
- 旧 session 的迟到 READY 因 `sessionId` 不匹配而被忽略。
- re-setup 创建新 session 与新 ownership generation；旧 envelope 与旧 observer callback 即使迟到，也分别因 `sessionId` 与 owner generation 不匹配而失效。

## 9. error modes 与 rollback

| error mode | detection | required behavior |
| --- | --- | --- |
| 页面脚本注入抛错 | `GM_addElement` 与原生注入 adapter 均失败 | `close("injection-failed")`，取消 timeout，移除 listener/attribute/style，清空状态并 reject setup promise。 |
| READY 超时 | 单次 `setTimeout` 到期 | `close("setup-timeout")`，执行完整 rollback；禁止追加轮询或级联延时。 |
| bootstrap 非法 | page main runtime validation 失败 | 不初始化 coordinator；页面端不发送 READY；sandbox 最终按 timeout rollback。 |
| namespace/session 不匹配 | envelope validation | 忽略 envelope；不泄漏到领域 handler。 |
| protocol version 不匹配 | envelope validation | 报告 `version-mismatch`，关闭当前 session，不协商降级。 |
| sender/target 不匹配 | envelope validation | 报告 `direction-mismatch` 并丢弃。 |
| sequence 重复或倒退 | sequence gate | 报告 `invalid-sequence` 并丢弃。 |
| 重复 READY | session 状态已越过 READY barrier | 报告 `duplicate-ready` 并忽略；不得二次 flush。 |
| command/event payload 非法 | union validator | 报告 `invalid-message` 并丢弃。 |
| receive callback 抛错 | session callback guard | 记录 diagnostic；保持 channel 可关闭，不把异常抛回 `dispatchEvent`。 |
| close 重入 | closed flag | 后续 close 无副作用；close envelope 最多发送一次。 |
| closed 后 dispatch | session state | 返回 `{ status: "closed" }`，不抛错、不派发。 |
| READY queue 溢出 | queue limit | 报告 protocol error 并关闭 session。 |

rollback 必须集中为一个 implementation 路径，按反向 acquisition 顺序清理资源。失败后不得遗留全局 listener、active timeout、DOM attribute、样式或可被复用的 rejected setup promise。

## 10. dependency strategy 与 adapters

`TabviewSession` 直接 local-import `createRuntimeChannel` 与 protocol validator。生产代码只有 `CustomEvent` transport，因此不建立可配置 transport framework。`RuntimeChannel` 的 interface 已足以在测试中通过 jsdom 的 `window` 进行 local substitution。

注入行为保持一个局部 adapter：

```typescript
interface PageInjectionAdapter {
  inject(source: string): void;
}
```

生产 implementation 在内部依次尝试 `GM_addElement` 与原生 script element；两条路径共享相同的 bootstrap serialization 与错误语义。该 adapter 只在 `Tabview` composition root 内使用，不导出为公共 feature interface。

测试通过 module-local factory 参数或 Vitest mock 替换注入 adapter 与 timeout 调度，不在正式 interface 增加测试专用 entry point。这样 seam 保持真实且最小，不把 implementation convenience 泄漏给 caller。

## 11. 迁移阶段

### 阶段一：建立测试基础设施与 protocol

- 使用 `pnpm add -D vitest jsdom` 安装与现有 Vite/TypeScript 兼容的测试依赖。
- 在 `package.json` 增加 `test` 脚本：`vitest run`。
- 新建 `vitest.config.ts`，将 Tabview 测试环境设为 `jsdom`，启用 `restoreMocks`、`clearMocks`、`unstubGlobals` 与共享环境清理。
- 在 `types.ts` 与 `protocol.ts` 落地 typed union、bootstrap、envelope 和 runtime validator。
- 先完成 validator 与 direction/sequence 测试，确保跨上下文 seam 可独立验证。
- 确认 `CONTEXT.md` 已登记 `TabviewSession` 与 `RuntimeChannel`。

### 阶段二：深化 RuntimeChannel

- 在 `src/core/bridge.ts` 实现 `createRuntimeChannel`。
- 确保 listener function 可精确移除，`close()` 幂等。
- 以单测覆盖派发、接收、handler 异常与 close 后静默。
- 暂时保留旧 `RuntimeBridge` export，避免在该阶段同时改变 caller。

### 阶段三：引入 TabviewSession

- 新建 `session.ts`，组合 RuntimeChannel、validator、sequence 与 READY queue。
- 完成 sandbox/page 双 role 测试与两个并存 session 的隔离测试。
- 完成 page event queue、READY 特殊状态转换、重复 READY、close control 与 queue overflow 测试。

### 阶段四：切换页面端

- 将 `page/main` 改为接收单个 bootstrap。
- page composition root 使用 `TabviewSession<"page">` 映射 `TabviewLifecycleCoordinator` command/event。
- 先完成 session 接入，再接入 navigation/route/observer ownership；最后以 `PolymerPatcher.replayConnected()` 收束统一 READY barrier。
- page close 必须遵循 session close → composition root → coordinator destroy → owners cleanup → page session/channel close。
- 完成后逐一删除 `PageBridgeAdapter` 的引用与文件。

### 阶段五：切换沙箱端与原子 rollback

- 在 `Tabview.setup()` 引入 feature lifecycle state 与共享 in-flight promise。
- 落实 listener-before-injection、READY timeout、style ordering 和 rollback。
- `Tabview.destroy()` 切换为 idempotent session close。
- 验证 setup 失败后可重新 setup。

### 阶段六：收敛旧 interface

- 删除旧 `RuntimeBridge`、`BridgeInstance`、`BridgeHandler<any>` 与 `BridgePacket`。
- 删除旧 BRIDGE_MSG 字符串常量和全局 `__YTI_SANDBOX_BRIDGE__`、`__YTI_PAGE_BRIDGE__` 类型声明。
- 检查生产 bundle 不再包含旧 stringly typed message mapping。
- 删除 `NavigationCoordinator` alias、全部过渡 export 与迁移期兼容路径。
- 扫描并清除未完成标记、测试专用生产 entry point 与仅为测试暴露的状态查询。
- 运行完整验证矩阵。

每个阶段完成逻辑或类型修改后执行 `pnpm check`；涉及页面注入、page sub-bundle 或产物变化的阶段同时执行 `pnpm build`。

## 12. Vitest 与 jsdom 最小基础设施

测试基础设施只覆盖本方案所需能力：

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    setupFiles: ["./src/test/setup.ts"]
  }
});
```

测试约束：

- 使用真实 jsdom `window.dispatchEvent(new CustomEvent(...))` 验证 `RuntimeChannel`，不重新实现浏览器事件模型。
- 使用 `vi.useFakeTimers()` 精确验证 READY timeout，不等待真实时间。
- 共享 `afterEach` 固定执行 `vi.useRealTimers()`、`vi.unstubAllGlobals()`、清空 `document.head/body` 并恢复根节点属性。
- 测试侧包装 `addEventListener/removeEventListener` 与 observer constructors，`afterEach` 断言 active listener 和 observer 数量均为零；不得为此增加生产状态查询或测试专用 public entry point。
- 每个测试结束前关闭所有 session 与 lifecycle owners；共享清理负责发现遗漏，而不是掩盖泄漏。
- 注入测试 mock `GM_addElement` 与 script append 路径，验证两条 adapter 路径生成相同 bootstrap。
- runtime validator 使用 table-driven cases 覆盖每个 union 分支与非法输入。
- 不启动 Vite dev server，不引入浏览器自动化框架作为最小单测依赖。

建议测试命令：

```bash
pnpm test
pnpm check
pnpm build
```

## 13. 验收矩阵

| 场景 | 自动化验收 | 构建/人工验收 |
| --- | --- | --- |
| 正常首次 setup | listener 先于注入；page READY 后 setup resolve；queue FIFO flush | `pnpm build` 后在 YouTube watch 页成功挂载 Tabview。 |
| 并发两次 setup | 共享同一 promise；仅一次注入和一对 session listener | 开关 feature 时无重复 Tabview 容器或重复回调。 |
| 已 ready 后再次 setup | 无新 session、无新注入 | SPA 导航后功能维持单实例。 |
| 注入失败 | 完整 rollback，setup reject，随后可重试 | 模拟禁用 `GM_addElement` 后原生 fallback 正常。 |
| READY 超时 | 单次 timeout 触发，listener/style/attribute/state 全部清理 | 无轮询、无级联 timeout。 |
| 两个 session 并存 | 不同 sessionId 消息互不交付 | 旧页面迟到事件不影响新 setup。 |
| 非法 envelope | 每一种错误均不进入领域 handler | 控制台 diagnostic 不包含 locale message 等敏感 payload。 |
| sequence 重复/倒退 | 丢弃并产生 typed error notice | 正常连续交互顺序不变。 |
| READY 前 command | 返回 queued；READY 后严格按原序发送 | 页面初始化阶段无 command 竞态。 |
| READY 前 page event | page FIFO 排队；READY post 返回后再按原序 flush | 初始化产生的 tab/font event 不越过 READY barrier。 |
| 重复 READY | 报告 `duplicate-ready`；command/event queue 均不二次 flush | 页面状态与首次 READY 后保持一致。 |
| READY barrier | session、navigation listener、route owner、初始 mount、`replayConnected()` 同步阶段均完成 | 不等待未来 Custom Elements；异步 patch 缺失只产生 diagnostic。 |
| page 主动 close | sandbox 收到 closed notice 并释放本地资源 | feature 可再次 setup。 |
| destroy 重入 | close envelope 最多一次；listener 清零 | 多次关闭 feature 无异常。 |
| session 与 ownership 联合 teardown | coordinator owners 先清理，随后 page session/channel 关闭 | 所有 listener、observer、patch 与 relocated DOM 均恢复。 |
| destroy 后 re-setup | 旧 envelope 与旧 observer callback 均不产生副作用 | 新 session 与新 route owner 正常接管。 |
| closed 后 dispatch | 返回 closed，不发送事件 | teardown 后无 Tabview callback。 |
| locale update | 合法 snapshot 交付 coordinator；非法 snapshot 被拒绝 | 多语言与 RTL 切换行为保持。 |
| tab/font event | directional union 与 runtime validation 通过 | tab 切换、字号调整与现有行为一致。 |
| 跨上下文隔离 | page 代码无 `GM_*`；sandbox 不访问 Polymer/`window.yt` | 对最终 page sub-bundle 做静态检查。 |
| 零轮询约束 | 新实现不存在 `setInterval` | 符合 ADR-0003 的闲置零轮询。 |

## 14. 完成标准

满足以下条件后，本次 architecture deepening 才视为完成：

- `Tabview.setup()/destroy()` 外部 interface 未变化。
- `RuntimeChannel` 不包含任何 Tabview 领域知识。
- `TabviewSession` 是 command/event、validation、READY queue、sequence 与 close 的唯一 ownership module。
- `CONTEXT.md` 保留已登记的 `TabviewSession` 与 `RuntimeChannel`。
- `communicationKey` 被真实的 `sessionId` correlation invariant 替代，不同 session 无法串扰；文档与代码均不把它表述为认证机制。
- 所有跨上下文输入均从 `unknown` 开始执行 runtime validation。
- bootstrap 仅通过安全序列化的 page main 参数传递；session 建立后的消息仅走 `CustomEvent`，两条路径都只承载数据。
- setup 具备 dedupe、listener-before-injection、timeout rollback 与失败后重试能力。
- destroy 与 session close 均幂等，所有 listener、timeout 与 queue 可证明被释放。
- READY barrier 统一覆盖 page session、navigation listener、当前 route owner、初始 mount 与 `PolymerPatcher.replayConnected()`；page 普通 event 不得越过 barrier。
- session 与 lifecycle ownership 按既定顺序集成和 teardown，destroy/re-setup 后旧 envelope 与旧 callback 均失效。
- 未引入 RPC、capabilities、revisions、轮询或通用 transport framework。
- 不保留 `NavigationCoordinator` alias、过渡 export、未完成标记、测试专用生产 entry point 或迁移期兼容路径。
- `pnpm test`、`pnpm check`、`pnpm build` 全部通过。
- Tampermonkey 与 Violentmonkey 中完成 watch 页面挂载、SPA 导航、tab/字号/locale 交互和 feature teardown 验证。

该终态通过清晰的 protocol seam 将 transport 与领域 lifecycle 分离：`RuntimeChannel` 提供局部且可替换的 adapter，`TabviewSession` 提供高 leverage 的 deep interface，`TabviewLifecycleCoordinator` 保持页面领域 locality，并且跨上下文物理隔离不被抽象层掩盖。
