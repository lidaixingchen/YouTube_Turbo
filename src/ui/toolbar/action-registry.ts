export interface ActionContext {
  actionId: string;
  slot: string;
  buttonElement: HTMLElement;
  refresh: () => void;
}

export interface ActionConfig {
  id: string;
  slot: string;
  titleKey: string;
  defaultTitle: string;
  icon: string | { normal: string; active: string };
  order?: number;
  isVisible?: () => boolean;
  isActive?: () => boolean;
  onClick: (event: MouseEvent, ctx: ActionContext) => void;
  onStateBind?: (refreshCallback: () => void) => (() => void) | void;
}

export const ActionRegistry = (() => {
  const actions = new Map<string, ActionConfig>();
  const bindings = new Map<string, () => void>();

  return {
    register(actionConfig: ActionConfig): void {
      actions.set(actionConfig.id, actionConfig);
    },

    registerAll(configs: ActionConfig[]): void {
      configs.forEach((c) => actions.set(c.id, c));
    },

    getActionsBySlot(slot: string): ActionConfig[] {
      return Array.from(actions.values())
        .filter((a) => a.slot === slot && (a.isVisible ? a.isVisible() : true))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    resolveIconKey(action: ActionConfig): string {
      const isActive = action.isActive ? action.isActive() : false;
      if (typeof action.icon === "object" && action.icon !== null) {
        return isActive ? action.icon.active : action.icon.normal;
      }
      return action.icon;
    },

    bindActionState(actionId: string, refreshCallback: () => void): void {
      this.unbindActionState(actionId);
      const action = actions.get(actionId);
      if (action && typeof action.onStateBind === "function") {
        const unbind = action.onStateBind(refreshCallback);
        if (typeof unbind === "function") {
          bindings.set(actionId, unbind);
        }
      }
    },

    unbindActionState(actionId: string): void {
      const unbind = bindings.get(actionId);
      if (unbind) {
        unbind();
        bindings.delete(actionId);
      }
    },

    clearAllBindings(): void {
      bindings.forEach((unbind) => unbind());
      bindings.clear();
    }
  };
})();
