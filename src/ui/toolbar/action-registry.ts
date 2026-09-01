import type { ActionConfig } from "./types";

export class ActionRegistry {
  private static actions = new Map<string, ActionConfig>();
  private static bindings = new Map<string, () => void>();

  public static register(actionConfig: ActionConfig): () => void {
    this.actions.set(actionConfig.id, actionConfig);
    return () => {
      this.unregister(actionConfig.id);
    };
  }

  public static registerAll(configs: ActionConfig[]): () => void {
    configs.forEach((c) => this.actions.set(c.id, c));
    return () => {
      configs.forEach((c) => this.unregister(c.id));
    };
  }

  public static unregister(actionId: string): void {
    this.unbindActionState(actionId);
    this.actions.delete(actionId);
  }

  public static getActionsBySlot(slot: string): ActionConfig[] {
    return Array.from(this.actions.values())
      .filter((a) => a.slot === slot && (a.isVisible ? a.isVisible() : true))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  public static resolveIconKey(action: ActionConfig): string {
    const isActive = action.isActive ? action.isActive() : false;
    if (typeof action.icon === "object" && action.icon !== null) {
      return isActive ? action.icon.active : action.icon.normal;
    }
    return action.icon;
  }

  public static bindActionState(actionId: string, refreshCallback: () => void): void {
    this.unbindActionState(actionId);
    const action = this.actions.get(actionId);
    if (action && typeof action.onStateBind === "function") {
      const unbind = action.onStateBind(refreshCallback);
      if (typeof unbind === "function") {
        this.bindings.set(actionId, unbind);
      }
    }
  }

  public static unbindActionState(actionId: string): void {
    const unbind = this.bindings.get(actionId);
    if (unbind) {
      unbind();
      this.bindings.delete(actionId);
    }
  }

  public static clearAllBindings(): void {
    this.bindings.forEach((unbind) => unbind());
    this.bindings.clear();
  }

  public static clear(): void {
    this.clearAllBindings();
    this.actions.clear();
  }
}
