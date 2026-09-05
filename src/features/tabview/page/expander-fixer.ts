import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { TabsView } from "./tabs-view";
import type {
  PolymerElementInstance,
  RouteGeneration,
  IdempotentDisposer,
  TabKey,
  ExpanderRouteContext
} from "./types";

function onceDisposer(cleanup: () => void): IdempotentDisposer {
  let disposed: boolean = false;
  return (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    cleanup();
  };
}

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

interface CommentEntryAttachment {
  readonly generation: RouteGeneration;
  readonly element: HTMLElement;
  readonly dispose: IdempotentDisposer;
}

export class ExpanderFixer {
  private static instance: ExpanderFixer | null = null;
  private tabsView: TabsView;
  private currentGeneration: RouteGeneration | null = null;
  private isCommentsTabActive: boolean = false;
  private lastTabsWidth: number = 0;
  private rightTabsResizeObserver: ResizeObserver | null = null;
  private commentIntersectionObserver: IntersectionObserver | null = null;
  private commentAttachments: WeakMap<HTMLElement, CommentEntryAttachment> = new WeakMap();

  public static getInstance(tabsView?: TabsView): ExpanderFixer | null {
    if (!ExpanderFixer.instance && tabsView) {
      ExpanderFixer.instance = new ExpanderFixer(tabsView);
    }
    return ExpanderFixer.instance;
  }

  public constructor(tabsView: TabsView) {
    this.tabsView = tabsView;
    ExpanderFixer.instance = this;
  }

  public activateRoute(context: ExpanderRouteContext): void {
    this.currentGeneration = context.generation;
    this.isCommentsTabActive = context.initialTab === "comments";

    if (this.rightTabsResizeObserver) {
      this.rightTabsResizeObserver.disconnect();
      this.rightTabsResizeObserver = null;
    }

    if (context.rightTabs) {
      this.rightTabsResizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
        if (this.currentGeneration !== null && this.currentGeneration !== context.generation) {
          return;
        }
        const entry = entries[entries.length - 1];
        if (!entry) {
          return;
        }
        const width = Math.round(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
        if (this.lastTabsWidth !== width) {
          this.lastTabsWidth = width;
          this.fixForTabDisplay(true);
        }
      });
      this.rightTabsResizeObserver.observe(context.rightTabs);
    }

    this.updateCommentsCounter();
    const contentSelector = `#tab-${context.initialTab === "playlist" ? "list" : context.initialTab}`;
    this.fixForTabDisplay(false, contentSelector);
  }

  public setActiveTab(tabKey: TabKey, generation: RouteGeneration): void {
    if (this.currentGeneration === null || this.currentGeneration !== generation) {
      return;
    }
    this.isCommentsTabActive = tabKey === "comments";
    const contentSelector = `#tab-${tabKey === "playlist" ? "list" : tabKey}`;
    this.fixForTabDisplay(false, contentSelector);
  }

  public attachCommentEntry(
    element: HTMLElement,
    generation: RouteGeneration
  ): IdempotentDisposer {
    if (this.currentGeneration === null || this.currentGeneration !== generation) {
      return (): void => {};
    }

    const existing = this.commentAttachments.get(element);
    if (existing && existing.generation === generation) {
      return existing.dispose;
    }

    if (!this.commentIntersectionObserver) {
      this.commentIntersectionObserver = new IntersectionObserver(
        (entries: IntersectionObserverEntry[]): void => {
          if (!this.isCommentsTabActive) {
            return;
          }
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const target = entry.target as HTMLElement;
            const cnt = PolymerHelper.insp(target);
            if (entry.isIntersecting && typeof cnt?.calculateCanCollapse === "function") {
              try {
                cnt.calculateCanCollapse(true);
              } catch {
                // 忽略异常
              }
              target.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED, "");
              const flexy = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
              if (flexy && !flexy.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER)) {
                flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.KEEP_COMMENTS_SCROLLER, "");
              }
            } else if (target.hasAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED)) {
              target.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED);
            }
          }
        },
        { threshold: [0], rootMargin: "32px" }
      );
    }

    this.commentIntersectionObserver.observe(element);

    const disposer = onceDisposer((): void => {
      this.commentIntersectionObserver?.unobserve(element);
      element.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.IO_INTERSECTED);
      this.commentAttachments.delete(element);
    });

    this.commentAttachments.set(element, {
      generation,
      element,
      dispose: disposer
    });

    return disposer;
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

  public updateCommentsCounter(): void {
    const header = document.querySelector<HTMLElement>(
      `${PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER} ${PAGE_CONSTANTS.SELECTORS.COMMENTS_HEADER_RENDERER}`
    );
    if (!header) {
      return;
    }

    const cnt = PolymerHelper.insp(header);
    const data = cnt?.data as Record<string, unknown> | undefined;
    let extractedCount = "";

    if (data) {
      const commentsCount = data.commentsCount as { runs?: Array<{ text?: string }> } | undefined;
      const countText = data.countText as { runs?: Array<{ text?: string }> } | undefined;
      const runs = commentsCount?.runs || countText?.runs;
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

  public deactivateRoute(generation: RouteGeneration): void {
    if (this.currentGeneration === generation) {
      this.commentAttachments = new WeakMap();

      if (this.commentIntersectionObserver) {
        this.commentIntersectionObserver.disconnect();
        this.commentIntersectionObserver = null;
      }
      if (this.rightTabsResizeObserver) {
        this.rightTabsResizeObserver.disconnect();
        this.rightTabsResizeObserver = null;
      }
      this.lastTabsWidth = 0;
      this.isCommentsTabActive = false;
      this.currentGeneration = null;
    }
  }

  public destroy(): void {
    this.commentAttachments = new WeakMap();

    if (this.commentIntersectionObserver) {
      this.commentIntersectionObserver.disconnect();
      this.commentIntersectionObserver = null;
    }
    if (this.rightTabsResizeObserver) {
      this.rightTabsResizeObserver.disconnect();
      this.rightTabsResizeObserver = null;
    }
    this.lastTabsWidth = 0;
    this.isCommentsTabActive = false;
    this.currentGeneration = null;

    const tabInfo = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
    if (tabInfo) {
      tabInfo.innerHTML = "";
    }
    ExpanderFixer.instance = null;
  }
}
