import { TABVIEW_CONSTANTS } from "./constants";
import { createRuntimeChannel, type RuntimeChannel } from "../../core/bridge";
import { validateEnvelope, validateSequence } from "./protocol";
import type {
  TabviewSessionRole,
  TabviewBootstrap,
  TabviewSessionOptions,
  TabviewSessionNotice,
  TabviewSession,
  TabviewSessionState,
  TabviewCloseReason,
  TabviewDispatchResult,
  TabviewOutbound,
  TabviewInbound,
  TabviewEnvelope
} from "./types";

class TabviewSessionImpl<R extends TabviewSessionRole> implements TabviewSession<R> {
  private readonly role: R;
  private readonly peerRole: TabviewSessionRole;
  private readonly bootstrap: TabviewBootstrap;
  private readonly noticeCallback: (notice: TabviewSessionNotice<R>) => void;
  private readonly channel: RuntimeChannel<TabviewEnvelope<unknown>>;

  private state: TabviewSessionState = "awaiting-ready";
  private localSequence: number = TABVIEW_CONSTANTS.INITIAL_SEQUENCE;
  private lastAcceptedPeerSequence: number = 0;
  private hasReceivedReady: boolean = false;
  private isAnnouncingReady: boolean = false;
  private outboundQueue: Array<TabviewOutbound<R>> = [];

  constructor(options: TabviewSessionOptions<R>) {
    this.role = options.role;
    this.peerRole = this.role === "sandbox" ? "page" : "sandbox";
    this.bootstrap = options.bootstrap;
    this.noticeCallback = options.receive;

    this.channel = createRuntimeChannel<TabviewEnvelope<unknown>>({
      eventName: TABVIEW_CONSTANTS.CHANNEL_EVENT_NAME,
      receive: (rawDetail: unknown) => {
        this.handleIncomingRaw(rawDetail);
      },
      onHandlerError: (error: unknown) => {
        // 隔离通道回调内未捕获异常并转为安全 diagnostic 通知
        this.notifySafe({
          kind: "protocol-error",
          error: {
            code: "invalid-message",
            cause: error
          }
        });
      }
    });
  }

  public dispatch(message: TabviewOutbound<R>): TabviewDispatchResult {
    if (this.state === "closed" || this.state === "closing") {
      return { status: "closed" };
    }

    // 处理 page 发布 ready 的特殊状态机转换
    if (this.role === "page" && message.type === "ready") {
      if (this.state === "ready") {
        this.notifySafe({
          kind: "protocol-error",
          error: { code: "duplicate-ready" }
        });
        const duplicateReadyEnvelope = this.createMessageEnvelope(message);
        this.channel.post(duplicateReadyEnvelope);
        return { status: "sent" };
      }

      this.state = "ready";
      this.isAnnouncingReady = true;

      const readyEnvelope = this.createMessageEnvelope(message);
      this.channel.post(readyEnvelope);

      // dispatchEvent 同步返回后退出 announcing 状态，并冲刷此前及在此窗口排队的普通事件
      this.isAnnouncingReady = false;
      this.flushOutboundQueue();
      return { status: "sent" };
    }

    // 在 ready barrier 达成前，普通消息入 FIFO 队列
    if (this.state === "awaiting-ready" || this.isAnnouncingReady) {
      if (this.outboundQueue.length >= TABVIEW_CONSTANTS.QUEUE_CAPACITY_LIMIT) {
        this.notifySafe({
          kind: "protocol-error",
          error: { code: "invalid-envelope" }
        });
        this.close("protocol-error");
        return { status: "closed" };
      }
      this.outboundQueue.push(message);
      return { status: "queued" };
    }

    const envelope = this.createMessageEnvelope(message);
    this.channel.post(envelope);
    return { status: "sent" };
  }

  public close(reason: TabviewCloseReason = "feature-disabled"): void {
    if (this.state === "closed" || this.state === "closing") {
      return;
    }
    this.state = "closing";

    // 尝试向对端发送 close envelope
    try {
      const closeEnvelope: TabviewEnvelope<never> = {
        namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
        protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
        sessionId: this.bootstrap.sessionId,
        sender: this.role,
        target: this.peerRole,
        sequence: this.localSequence++,
        body: {
          kind: "close",
          reason
        }
      };
      this.channel.post(closeEnvelope);
    } catch {
      // ignore
    }

    this.state = "closed";
    this.outboundQueue = [];
    this.channel.close();

    this.notifySafe({
      kind: "closed",
      reason
    });
  }

  private handleIncomingRaw(rawDetail: unknown): void {
    if (this.state === "closed") {
      return;
    }

    if (typeof rawDetail === "object" && rawDetail !== null) {
      const candidate = rawDetail as Record<string, unknown>;
      if (candidate.target !== this.role) {
        return;
      }
    }

    const validation = validateEnvelope(rawDetail, this.bootstrap.sessionId, this.role);
    if (!validation.ok) {
      // session-mismatch 属于旧实例或其他 session 的合法隔离，静默忽略
      if (validation.errorCode === "session-mismatch") {
        return;
      }
      this.notifySafe({
        kind: "protocol-error",
        error: {
          code: validation.errorCode,
          cause: validation.cause
        }
      });
      return;
    }

    const envelope = validation.envelope;

    // sequence 单调递增校验
    if (!validateSequence(envelope.sequence, this.lastAcceptedPeerSequence)) {
      this.notifySafe({
        kind: "protocol-error",
        error: {
          code: "invalid-sequence",
          cause: envelope.sequence
        }
      });
      return;
    }
    this.lastAcceptedPeerSequence = envelope.sequence;

    // 处理 close envelope
    if (envelope.body.kind === "close") {
      this.state = "closed";
      this.outboundQueue = [];
      this.channel.close();
      this.notifySafe({
        kind: "closed",
        reason: envelope.body.reason
      });
      return;
    }

    // 处理普通 message envelope
    const inboundMessage = envelope.body.value as TabviewInbound<R>;

    if (this.role === "sandbox" && inboundMessage.type === "ready") {
      if (this.hasReceivedReady) {
        this.notifySafe({
          kind: "protocol-error",
          error: { code: "duplicate-ready" }
        });
        return;
      }
      this.hasReceivedReady = true;
      this.state = "ready";

      // 先通知上层收到 ready
      this.notifySafe({
        kind: "message",
        message: inboundMessage
      });

      // 随后冲刷 sandbox 在等待 ready 期间积累的 command queue
      this.flushOutboundQueue();
      return;
    }

    // 交付普通消息
    this.notifySafe({
      kind: "message",
      message: inboundMessage
    });
  }

  private flushOutboundQueue(): void {
    const queueToFlush = this.outboundQueue;
    this.outboundQueue = [];

    for (const msg of queueToFlush) {
      if (this.state === "closed") {
        break;
      }
      const envelope = this.createMessageEnvelope(msg);
      this.channel.post(envelope);
    }
  }

  private createMessageEnvelope(message: TabviewOutbound<R>): TabviewEnvelope<TabviewOutbound<R>> {
    return {
      namespace: TABVIEW_CONSTANTS.PROTOCOL_NAMESPACE,
      protocolVersion: TABVIEW_CONSTANTS.PROTOCOL_VERSION,
      sessionId: this.bootstrap.sessionId,
      sender: this.role,
      target: this.peerRole,
      sequence: this.localSequence++,
      body: {
        kind: "message",
        value: message
      }
    };
  }

  private notifySafe(notice: TabviewSessionNotice<R>): void {
    try {
      this.noticeCallback(notice);
    } catch {
      // 隔离上层业务监听器的执行异常
    }
  }
}

export function createTabviewSession<R extends TabviewSessionRole>(
  options: TabviewSessionOptions<R>
): TabviewSession<R> {
  return new TabviewSessionImpl<R>(options);
}
