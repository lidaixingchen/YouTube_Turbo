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

export interface SlotMountContext {
  readonly container: HTMLElement;
  readonly target: HTMLElement;
}

export type SlotRenderer = (context: SlotMountContext) => HTMLElement | null;

export interface SlotDefinition {
  readonly slotKey: string;
  readonly containerSelector: string;
  readonly targetSelector: string;
  readonly elementId: string;
  readonly isApplicable?: (url: URL) => boolean;
  readonly mount: (target: HTMLElement, element: HTMLElement) => void;
  readonly unmount?: () => void;
}

export type PopoverState = "closed" | "hover" | "pinned";

export interface PopoverController {
  open: (mode: "hover" | "pinned") => void;
  close: () => void;
  getState: () => PopoverState;
  reposition: () => void;
  destroy: () => void;
}
