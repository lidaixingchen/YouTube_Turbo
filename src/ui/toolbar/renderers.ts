import { TOOLBAR_CONSTANTS } from "./constants";
import { IconRegistry } from "../icons";
import { PopoverEngine } from "./popover";
import { Locale } from "../../i18n";
import type { ActionConfig, PopoverController, SlotMountContext } from "./types";

export type ActionExecutor = (action: ActionConfig, event: MouseEvent, buttonElement: HTMLElement) => void;

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
    toolsGrid.innerHTML = "";
    const defaultTooltipText: string = TOOLBAR_CONSTANTS.TOOLTIP_DEFAULT_TEXT;

    actions.forEach((action: ActionConfig): void => {
      const btn: HTMLButtonElement = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.tabIndex = TOOLBAR_CONSTANTS.POPOVER_MENU_ITEM_TAB_INDEX;
      btn.className = "toolbox_extension_tool_btn";
      btn.id = "action_" + action.id;

      const updateBtnContent = (): void => {
        btn.innerHTML = "";
        const iconKey: string = ToolbarRenderers.resolveIconKey(action);
        btn.appendChild(IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.ACTION_ICON_SIZE }));
        const titleText: string = Locale.t(action.titleKey) || action.defaultTitle;
        btn.setAttribute("aria-label", titleText);

        const isActive: boolean = ToolbarRenderers.safeIsActive(action);
        if (isActive) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      };

      updateBtnContent();

      btn.addEventListener("mouseenter", (): void => {
        const titleText: string = Locale.t(action.titleKey) || action.defaultTitle;
        tooltipEl.textContent = titleText;
      });

      btn.addEventListener("mouseleave", (): void => {
        tooltipEl.textContent = defaultTooltipText;
      });

      btn.addEventListener("click", (e: MouseEvent): void => {
        executeAction(action, e, btn);
      });

      toolsGrid.appendChild(btn);
    });
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
    if (existing && existing.isConnected) {
      existing.innerHTML = "";
    }

    const container: HTMLElement = existing || document.createElement("div");
    container.id = elementId;
    container.className = "navigation-button style-scope ytd-shorts yt-turbo-shorts-btn";

    actions.forEach((action: ActionConfig): void => {
      const actionWrap: HTMLDivElement = document.createElement("div");
      actionWrap.id = "shorts_action_" + action.id;
      actionWrap.style.cssText = "display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; cursor: pointer;";

      const iconKey: string = ToolbarRenderers.resolveIconKey(action);
      const iconSvg: Element = IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.SHORTS_ICON_SIZE });
      actionWrap.appendChild(iconSvg);
      const title: string = Locale.t(action.titleKey) || action.defaultTitle;
      actionWrap.title = title;
      actionWrap.setAttribute("aria-label", title);

      actionWrap.addEventListener("click", (e: MouseEvent): void => {
        executeAction(action, e, actionWrap);
      });

      container.appendChild(actionWrap);
    });

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
    if (existing && existing.isConnected) {
      existing.innerHTML = "";
    }

    const outerBox: HTMLElement = existing || document.createElement("div");
    outerBox.id = elementId;
    outerBox.className = "yt-turbo-metadata-outer";

    actions.forEach((action: ActionConfig): void => {
      const btn: HTMLButtonElement = document.createElement("button");
      btn.type = "button";
      btn.className = "yt-turbo-metadata-btn";
      btn.id = "metadata_action_" + action.id;

      const iconKey: string = ToolbarRenderers.resolveIconKey(action);
      const iconEl: Element = IconRegistry.createSvg(iconKey, { size: TOOLBAR_CONSTANTS.METADATA_ICON_SIZE });
      btn.appendChild(iconEl);

      const titleText: string = Locale.t(action.titleKey) || action.defaultTitle;
      const labelSpan: HTMLSpanElement = document.createElement("span");
      labelSpan.className = "yt-turbo-metadata-label";
      labelSpan.textContent = titleText;
      btn.appendChild(labelSpan);
      btn.title = titleText;
      btn.setAttribute("aria-label", titleText);

      const isActive: boolean = ToolbarRenderers.safeIsActive(action);
      if (isActive) {
        btn.classList.add("active");
      }

      btn.addEventListener("click", (e: MouseEvent): void => {
        executeAction(action, e, btn);
      });

      outerBox.appendChild(btn);
    });

    return outerBox;
  }
}
