export interface ActionContext {
  readonly actionId: string;
  readonly slot: string;
  readonly buttonElement: HTMLElement;
}

export interface ActionConfig {
  readonly id: string;
  readonly slot: string;
  readonly titleKey: string;
  readonly defaultTitle: string;
  readonly icon:
    | string
    | Readonly<{
        readonly normal: string;
        readonly active: string;
      }>;
  readonly order?: number;
  readonly dismissOnExecute?: boolean;
  readonly isVisible?: () => boolean;
  readonly isActive?: () => boolean;
  readonly onClick: (
    event: MouseEvent,
    context: ActionContext
  ) => void | Promise<void>;
  readonly onStateBind?: (
    notifyChanged: () => void
  ) => (() => void) | void;
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
