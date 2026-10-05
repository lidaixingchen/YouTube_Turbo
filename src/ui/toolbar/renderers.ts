import { TOOLBAR_CONSTANTS } from "./constants";
import { IconRegistry } from "../icons";
import { PopoverEngine } from "./popover";
import { Locale } from "../../i18n";
import type { ActionConfig, PopoverController, SlotMountContext } from "./types";

export type ActionExecutor = (actionId: string, event: MouseEvent, buttonElement: HTMLElement) => void;

export class ToolbarRenderers {
  public static safeIsActive(action: ActionConfig): boolean {
    if (typeof action.isActive !== "function") {
      return false;
    }
    try {
      return Boolean(action.isActive());
    } catch (err: unknown) {
      console.error(`[ToolbarRenderers] Error evaluating isActive for action "${action.id}":`, err);
      return false;
    }
  }

  public static resolveIconKey(action: ActionConfig): string {
    const isActive: boolean = ToolbarRenderers.safeIsActive(action);
    if (typeof action.icon === "object" && action.icon !== null) {
      return isActive ? action.icon.active : action.icon.normal;
    }
    return action.icon;
  }

  public static renderToolboxGrid(
    toolsGrid: HTMLElement,
    tooltipEl: HTMLElement,
    actions: readonly ActionConfig[],
    executeAction: ActionExecutor
  ): void {
    const defaultTooltipText: string = TOOLBAR_CONSTANTS.TOOLTIP_DEFAULT_TEXT;
    const existingButtons: Map<string, HTMLButtonElement> = ToolbarRenderers.indexButtons(toolsGrid);
    const buttons: HTMLButtonElement[] = [];

    actions.forEach((action: ActionConfig): void => {
      const actionId: string = action.id;
      const buttonId: string = `action_${actionId}`;
      let btn: HTMLButtonElement | undefined = existingButtons.get(buttonId);
      if (!btn) {
        btn = document.createElement("button");
      }
      const button: HTMLButtonElement = btn;
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.tabIndex = TOOLBAR_CONSTANTS.POPOVER_MENU_ITEM_TAB_INDEX;
      button.className = "toolbox_extension_tool_btn";
      button.id = buttonId;

      const iconKey: string = ToolbarRenderers.resolveIconKey(action);
      button.replaceChildren(IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.ACTION_ICON_SIZE }));
      const titleText: string = Locale.t(action.titleKey) || action.defaultTitle;
      button.setAttribute("aria-label", titleText);

      const isActive: boolean = ToolbarRenderers.safeIsActive(action);
      if (isActive) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }

      button.onmouseenter = (): void => {
        tooltipEl.textContent = button.getAttribute("aria-label") ?? defaultTooltipText;
      };
      button.onmouseleave = (): void => {
        tooltipEl.textContent = defaultTooltipText;
      };
      button.onclick = (event: MouseEvent): void => {
        executeAction(actionId, event, button);
      };

      buttons.push(button);
    });

    ToolbarRenderers.reconcileButtons(toolsGrid, buttons);
  }

  public static refreshToolboxGrid(
    actions: readonly ActionConfig[],
    executeAction: ActionExecutor,
    scope?: ParentNode | null
  ): void {
    if (!scope) {
      return;
    }
    const toolsGrid: HTMLElement | null = scope.querySelector<HTMLElement>(
      `#${TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID} .toolbox_extension_tools`
    );
    const tooltipEl: HTMLElement | null = scope.querySelector<HTMLElement>(
      `#${TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID} .toolbox_extension_tooltip`
    );
    if (toolsGrid && tooltipEl) {
      ToolbarRenderers.renderToolboxGrid(toolsGrid, tooltipEl, actions, executeAction);
    }
  }

  public static createPlayerControlsElement(
    context: SlotMountContext,
    actions: readonly ActionConfig[],
    executeAction: ActionExecutor,
    onPopoverBound: (controller: PopoverController) => void
  ): HTMLElement | null {
    if (!actions.length) {
      return null;
    }

    const existingBox: HTMLElement | null = context.container.querySelector<HTMLElement>(
      `#${TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID}`
    );
    if (existingBox && existingBox.isConnected) {
      ToolbarRenderers.refreshToolboxGrid(actions, executeAction, context.container);
      return existingBox;
    }

    const boxContainer: HTMLButtonElement = document.createElement("button");
    boxContainer.type = "button";
    boxContainer.id = TOOLBAR_CONSTANTS.TOOLBOX_ROOT_ID;
    boxContainer.className = "ytp-button";
    boxContainer.style.cssText = "display: flex; justify-content: center; align-items: center; cursor: pointer;";
    boxContainer.setAttribute("aria-label", TOOLBAR_CONSTANTS.TOOLTIP_DEFAULT_TEXT);

    const iconSvg: Element = IconRegistry.createSvg("toolbox", { size: TOOLBAR_CONSTANTS.ICON_SIZE_PX });
    boxContainer.appendChild(iconSvg);

    const existingContainer: HTMLElement | null = context.container.querySelector<HTMLElement>(
      `#${TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID}`
    );
    if (existingContainer) {
      existingContainer.remove();
    }

    const toolBoxContainer: HTMLDivElement = document.createElement("div");
    toolBoxContainer.id = TOOLBAR_CONSTANTS.TOOLBOX_CONTAINER_ID;
    toolBoxContainer.className = "toolbox_extension_container";

    const tooltipEl: HTMLDivElement = document.createElement("div");
    tooltipEl.className = "toolbox_extension_tooltip";
    tooltipEl.textContent = TOOLBAR_CONSTANTS.TOOLTIP_DEFAULT_TEXT;
    tooltipEl.setAttribute("aria-hidden", "true");
    toolBoxContainer.appendChild(tooltipEl);

    const toolsGrid: HTMLDivElement = document.createElement("div");
    toolsGrid.className = "toolbox_extension_tools";
    toolsGrid.setAttribute("role", "group");
    ToolbarRenderers.renderToolboxGrid(toolsGrid, tooltipEl, actions, executeAction);
    toolBoxContainer.appendChild(toolsGrid);

    context.container.appendChild(toolBoxContainer);
    const controller: PopoverController = PopoverEngine.bind(boxContainer, toolBoxContainer, context.container);
    onPopoverBound(controller);

    return boxContainer;
  }

  public static createShortsElement(
    context: SlotMountContext,
    actions: readonly ActionConfig[],
    executeAction: ActionExecutor
  ): HTMLElement | null {
    if (!actions.length) {
      return null;
    }

    const elementId: string = TOOLBAR_CONSTANTS.SHORTS_CONTAINER_ID;
    const existing: HTMLElement | null = context.container.querySelector<HTMLElement>(`#${elementId}`);

    const container: HTMLElement = existing || document.createElement("div");
    container.id = elementId;
    container.className = "navigation-button style-scope ytd-shorts yt-turbo-shorts-btn";
    const existingButtons: Map<string, HTMLButtonElement> = ToolbarRenderers.indexButtons(container);
    const buttons: HTMLButtonElement[] = [];

    actions.forEach((action: ActionConfig): void => {
      const actionId: string = action.id;
      const buttonId: string = `shorts_action_${actionId}`;
      let actionWrap: HTMLButtonElement | undefined = existingButtons.get(buttonId);
      if (!actionWrap) {
        actionWrap = document.createElement("button");
      }
      const button: HTMLButtonElement = actionWrap;
      button.type = "button";
      button.id = buttonId;
      button.style.cssText = TOOLBAR_CONSTANTS.SHORTS_ACTION_BUTTON_STYLE;

      const iconKey: string = ToolbarRenderers.resolveIconKey(action);
      const iconSvg: Element = IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.SHORTS_ICON_SIZE });
      button.replaceChildren(iconSvg);
      const title: string = Locale.t(action.titleKey) || action.defaultTitle;
      button.title = title;
      button.setAttribute("aria-label", title);

      button.onclick = (event: MouseEvent): void => {
        executeAction(actionId, event, button);
      };

      buttons.push(button);
    });

    ToolbarRenderers.reconcileButtons(container, buttons);
    return container;
  }

  public static createWatchMetadataElement(
    context: SlotMountContext,
    actions: readonly ActionConfig[],
    executeAction: ActionExecutor
  ): HTMLElement | null {
    if (!actions.length) {
      return null;
    }

    const elementId: string = TOOLBAR_CONSTANTS.WATCH_METADATA_CONTAINER_ID;
    const existing: HTMLElement | null = context.container.querySelector<HTMLElement>(`#${elementId}`);

    const outerBox: HTMLElement = existing || document.createElement("div");
    outerBox.id = elementId;
    outerBox.className = "yt-turbo-metadata-outer";
    const existingButtons: Map<string, HTMLButtonElement> = ToolbarRenderers.indexButtons(outerBox);
    const buttons: HTMLButtonElement[] = [];

    actions.forEach((action: ActionConfig): void => {
      const actionId: string = action.id;
      const buttonId: string = `metadata_action_${actionId}`;
      let btn: HTMLButtonElement | undefined = existingButtons.get(buttonId);
      if (!btn) {
        btn = document.createElement("button");
      }
      const button: HTMLButtonElement = btn;
      button.type = "button";
      button.className = "yt-turbo-metadata-btn";
      button.id = buttonId;

      const iconKey: string = ToolbarRenderers.resolveIconKey(action);
      const iconEl: Element = IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.METADATA_ICON_SIZE });
      button.replaceChildren(iconEl);

      const titleText: string = Locale.t(action.titleKey) || action.defaultTitle;
      const labelSpan: HTMLSpanElement = document.createElement("span");
      labelSpan.className = "yt-turbo-metadata-label";
      labelSpan.textContent = titleText;
      button.appendChild(labelSpan);
      button.title = titleText;
      button.setAttribute("aria-label", titleText);

      const isActive: boolean = ToolbarRenderers.safeIsActive(action);
      if (isActive) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }

      button.onclick = (event: MouseEvent): void => {
        executeAction(actionId, event, button);
      };

      buttons.push(button);
    });

    ToolbarRenderers.reconcileButtons(outerBox, buttons);
    return outerBox;
  }

  private static indexButtons(container: HTMLElement): Map<string, HTMLButtonElement> {
    const buttons: Map<string, HTMLButtonElement> = new Map<string, HTMLButtonElement>();
    Array.from(container.children).forEach((child: Element): void => {
      if (child instanceof HTMLButtonElement && child.id) {
        buttons.set(child.id, child);
      }
    });
    return buttons;
  }

  private static reconcileButtons(container: HTMLElement, buttons: readonly HTMLButtonElement[]): void {
    const retainedButtons: Set<Element> = new Set<Element>(buttons);
    const activeElement: Element | null = document.activeElement;
    const focusedButton: HTMLButtonElement | null =
      activeElement instanceof HTMLButtonElement && container.contains(activeElement) ? activeElement : null;

    Array.from(container.children).forEach((child: Element): void => {
      if (!retainedButtons.has(child)) {
        child.remove();
      }
    });

    buttons.forEach((button: HTMLButtonElement, index: number): void => {
      const current: Element | null = container.children.item(index);
      if (current !== button) {
        container.insertBefore(button, current);
      }
    });

    if (focusedButton && focusedButton.isConnected && container.contains(focusedButton)) {
      focusedButton.focus();
    }
  }
}
