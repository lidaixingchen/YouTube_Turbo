import { BRIDGE_EVENT_NAME } from "./constants";
import type { BridgePacket } from "../types";

export type BridgeContext = "sandbox" | "page";
export type BridgeHandler<T = any> = (payload: T, packet: BridgePacket<T>) => void;

export class BridgeInstance {
  private communicationKey: string;
  private context: BridgeContext;
  private listeners = new Map<string, Set<BridgeHandler>>();

  constructor(communicationKey: string, context: BridgeContext) {
    this.communicationKey = communicationKey; if (!this.communicationKey) { /* no-op */ }
    this.context = context;
    this.initEventListener();
  }

  private initEventListener(): void {
    window.addEventListener(BRIDGE_EVENT_NAME, (event: Event) => {
      const customEvt = event as CustomEvent<BridgePacket>;
      if (!customEvt || !customEvt.detail) return;
      const packet = customEvt.detail;
      if (packet.target !== this.context) return;
      const handlers = this.listeners.get(packet.type);
      if (handlers) {
        handlers.forEach(fn => {
          try {
            fn(packet.payload, packet);
          } catch (err) {
            console.error(`[RuntimeBridge:${this.context}] Handler error for ${packet.type}:`, err);
          }
        });
      }
    });
  }

  public emit<T = any>(type: string, payload?: T): void {
    const target: BridgeContext = this.context === "sandbox" ? "page" : "sandbox";
    const packet: BridgePacket<T> = {
      id: `pkt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      sender: this.context,
      target,
      timestamp: Date.now(),
      payload
    };
    window.dispatchEvent(new CustomEvent(BRIDGE_EVENT_NAME, { detail: packet }));
  }

  public on<T = any>(type: string, handler: BridgeHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    const handlers = this.listeners.get(type)!;
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }
}

export const RuntimeBridge = {
  create: (communicationKey: string, context: BridgeContext): BridgeInstance => {
    return new BridgeInstance(communicationKey, context);
  }
};
