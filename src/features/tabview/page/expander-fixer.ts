import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { TabsView } from "./tabs-view";
import type { PolymerElementInstance } from "./types";

export function funcCanCollapse(this: PolymerElementInstance, _force?: boolean): void {
  const content = this.content || (this.$ && this.$.content);
  const shouldUseLines = Boolean(this.shouldUseNumberOfLines);
  const isCollapsedState = Boolean(this.alwaysCollapsed || this.collapsed || this.isToggled === false);

  if (shouldUseLines && isCollapsedState) {
    this.canToggle = Boolean(
      this.alwaysToggleable ||
      this.isToggled ||
      (content && content.offsetHeight < content.scrollHeight)
    );
  } else {
    const minHeight = typeof this.collapsedHeight === "number" ? this.collapsedHeight : 0;
    this.canToggle = Boolean(
      this.alwaysToggleable ||
      this.isToggled ||
      (content && content.scrollHeight > minHeight)
    );
  }
}

export function fixInlineExpanderDisplay(cnt: PolymerElementInstance): void {
  try {
    cnt.updateIsAttributedExpanded?.();
  } catch {
    // 忽略异常
  }
  try {
    cnt.updateIsFormattedExpanded?.();
  } catch {
    // 忽略异常
  }
  try {
    cnt.updateTextOnSnippetTypeChange?.();
  } catch {
    // 忽略异常
  }
  try {
    cnt.updateStyles?.();
  } catch {
    // 忽略异常
  }
}

export function fixInlineExpanderMethods(cnt: PolymerElementInstance): void {
  if (!cnt || cnt.__isInlineExpanderFixed) {
    return;
  }
  cnt.__isInlineExpanderFixed = true;

  cnt.collapse = (): void => {};
  cnt.computeExpandButtonOffset = (): number => 0;
  cnt.dataChanged = (): void => {};

  cnt.updateTextOnSnippetTypeChange = function (this: PolymerElementInstance): void {
    this.isResetMutation = true;
    if (this.isExpanded === true) {
      this.isExpanded = false;
    }
    if (typeof this.set === "function") {
      this.set("isExpanded", true);
      this.isExpandedChanged?.();
    } else {
      this.isExpanded = true;
      this.isExpandedChanged?.();
    }
    this.isResetMutation = true;
  };

  if (typeof cnt.isResetMutation === "boolean") {
    cnt.isResetMutation = true;
  }
  if (typeof cnt.collapseLabel === "string") {
    cnt.collapseLabel = "";
  }
  fixInlineExpanderDisplay(cnt);
}

export class ExpanderFixer {
  private static instance: ExpanderFixer | null = null;
  private tabsView: TabsView;
  private isFixing: boolean = false;

  public static getInstance(tabsView?: TabsView): ExpanderFixer | null {
    if (!ExpanderFixer.instance && tabsView) {
      ExpanderFixer.instance = new ExpanderFixer(tabsView);
    }
    return ExpanderFixer.instance;
  }

  constructor(tabsView: TabsView) {
    this.tabsView = tabsView;
    ExpanderFixer.instance = this;
  }

  public init(): void {
    this.updateCommentsCounter();
    this.fixForTabDisplay(false, PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
  }

  public fixForTabDisplay(isResize: boolean = false, activeTabSelector?: string): void {
    const intersectedElements = document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.IO_INTERSECTED_ITEMS);
    for (let i = 0; i < intersectedElements.length; i++) {
      const el = intersectedElements[i];
      const cnt = PolymerHelper.insp(el);
      if (cnt && typeof cnt.calculateCanCollapse === "function") {
        try {
          cnt.calculateCanCollapse(true);
        } catch {
          // 忽略异常
        }
      }
    }

    const currentTab = activeTabSelector || `#${this.tabsView.getActiveTab()}`;

    if (!isResize && (currentTab === PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER || currentTab === "#tab-info")) {
      const resizableRenderers = document.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RESIZABLE_RENDERERS_INFO);
      for (let i = 0; i < resizableRenderers.length; i++) {
        const renderer = resizableRenderers[i];
        const cnt = PolymerHelper.insp(renderer);
        if (cnt && typeof cnt.notifyResize === "function") {
          try {
            cnt.notifyResize();
          } catch {
            // 忽略异常
          }
        }
      }

      const inlineExpanders = document.querySelectorAll<HTMLElement>(
        `${PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER} ${PAGE_CONSTANTS.SELECTORS.TEXT_INLINE_EXPANDER}`
      );
      for (let i = 0; i < inlineExpanders.length; i++) {
        const expander = inlineExpanders[i];
        const cnt = PolymerHelper.insp(expander);
        if (cnt) {
          if (typeof cnt.resize === "function") {
            try {
              cnt.resize(false);
            } catch {
              // 忽略异常
            }
          }
          fixInlineExpanderDisplay(cnt);
          fixInlineExpanderMethods(cnt);
        }
      }
    }

    if (!isResize && typeof currentTab === "string" && currentTab.startsWith("#tab-")) {
      const activeContent = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_ACTIVE_CONTENT);
      if (activeContent) {
        const chips = activeContent.querySelectorAll<HTMLElement>("yt-chip-cloud-renderer");
        for (let i = 0; i < chips.length; i++) {
          const cnt = PolymerHelper.insp(chips[i]);
          if (cnt && typeof cnt.notifyResize === "function") {
            try {
              cnt.notifyResize();
            } catch {
              // 忽略异常
            }
          }
        }
      }
    }
  }

  public fixExpanders(): void {
    if (this.isFixing) {
      return;
    }
    const infoContainer = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
    if (!infoContainer) {
      return;
    }

    this.isFixing = true;
    try {
      const inlineExpanders = infoContainer.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TEXT_INLINE_EXPANDER);
      for (let i = 0; i < inlineExpanders.length; i++) {
        const expander = inlineExpanders[i];
        const cnt = PolymerHelper.insp(expander);
        if (cnt) {
          if (typeof cnt.resize === "function") {
            try {
              cnt.resize(false);
            } catch {
              // 忽略异常
            }
          }
          fixInlineExpanderDisplay(cnt);
          fixInlineExpanderMethods(cnt);
        }
      }
    } finally {
      this.isFixing = false;
    }

    const resizableRenderers = infoContainer.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.RESIZABLE_RENDERERS_INFO);
    for (let i = 0; i < resizableRenderers.length; i++) {
      const renderer = resizableRenderers[i];
      const cnt = PolymerHelper.insp(renderer);
      if (cnt && typeof cnt.notifyResize === "function") {
        try {
          cnt.notifyResize();
        } catch {
          // 忽略异常
        }
      }
    }
  }

  public updateCommentsCounter(): void {
    const header = document.querySelector<HTMLElement>(
      `${PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER} ${PAGE_CONSTANTS.SELECTORS.COMMENTS_HEADER_RENDERER}`
    );
    if (!header) {
      return;
    }

    const cnt = PolymerHelper.insp(header);
    const data = cnt?.data as Record<string, any> | undefined;
    let extractedCount = "";

    if (data) {
      const runs = (data.commentsCount?.runs || data.countText?.runs) as Array<{ text?: string }> | undefined;
      if (Array.isArray(runs) && runs.length > 0) {
        let maxDigits = -1;
        for (let i = 0; i < runs.length; i++) {
          const text = runs[i].text || "";
          const digitCount = text.replace(/\D+/g, "").length;
          if (digitCount > maxDigits) {
            maxDigits = digitCount;
            extractedCount = text;
          }
        }
      }
    }

    if (!extractedCount) {
      const countEl = header.querySelector<HTMLElement>("#count, .count-text, yt-formatted-string");
      if (countEl && countEl.textContent) {
        const match = countEl.textContent.match(/[\d,.]+[KMBkmb]?/);
        if (match) {
          extractedCount = match[0];
        }
      }
    }

    if (extractedCount) {
      this.tabsView.updateCommentCount(extractedCount.trim());
    }
  }

  public destroy(): void {
    const tabInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
    if (tabInfo) {
      tabInfo.innerHTML = "";
    }
    ExpanderFixer.instance = null;
  }
}


