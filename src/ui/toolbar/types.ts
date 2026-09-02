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
  dismissOnExecute?: boolean;
  isVisible?: () => boolean;
  isActive?: () => boolean;
  onClick: (event: MouseEvent, ctx: ActionContext) => void;
  onStateBind?: (refreshCallback: () => void) => (() => void) | void;
}

export interface SlotDefinition {
  slotKey: string;
  containerSelector: string;
  targetSelector: string;
  elementId: string;
  isApplicable?: (url: URL) => boolean;
  mount: (target: HTMLElement, element: HTMLElement) => void;
  unmount?: () => void;
}

export type PopoverState = "closed" | "hover" | "pinned";

export interface PopoverController {
  open: (mode: "hover" | "pinned") => void;
  close: () => void;
  getState: () => PopoverState;
  reposition: () => void;
  destroy: () => void;
}
