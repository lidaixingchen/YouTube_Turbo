import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import { ObserverRegistry } from "./observer-registry";
import { TabsView } from "./tabs-view";

export class ExpanderFixer {
  private observerRegistry: ObserverRegistry = ObserverRegistry.getInstance();
  private tabsView: TabsView;

  constructor(tabsView: TabsView) {
    this.tabsView = tabsView;
  }

  public init(): void {
    const commentsObserverId = "comments-count-watcher";
    this.observerRegistry.register({
      id: commentsObserverId,
      type: "mutation",
      getTarget: () => document.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER) || document.body,
      options: { childList: true, subtree: true, characterData: true },
      callback: () => {
        this.updateCommentsCounter();
      }
    });
    this.observerRegistry.activate(commentsObserverId);

    const expanderObserverId = "description-expander-watcher";
    this.observerRegistry.register({
      id: expanderObserverId,
      type: "mutation",
      getTarget: () => document.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER) || document.body,
      options: { childList: true, subtree: true },
      callback: () => {
        this.fixExpanders();
      }
    });
    this.observerRegistry.activate(expanderObserverId);

    this.updateCommentsCounter();
    this.fixExpanders();
  }

  public fixExpanders(): void {
    const infoContainer = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER);
    if (!infoContainer) {
      return;
    }

    const inlineExpanders = infoContainer.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TEXT_INLINE_EXPANDER);
    for (const expander of inlineExpanders) {
      const cnt = PolymerHelper.insp(expander);
      if (cnt) {
        if (typeof cnt.resize === "function") {
          try {
            cnt.resize(false);
          } catch (err) {
            console.warn("[ExpanderFixer] Failed to resize expander", err);
          }
        }
        if (typeof cnt.updateStyles === "function") {
          try {
            cnt.updateStyles();
          } catch (err) {
            console.warn("[ExpanderFixer] Failed to update expander styles", err);
          }
        }
      }
    }

    const resizableRenderers = infoContainer.querySelectorAll<HTMLElement>(
      "ytd-video-description-infocards-section-renderer, yt-chip-cloud-renderer, ytd-horizontal-card-list-renderer, yt-horizontal-list-renderer"
    );
    for (const renderer of resizableRenderers) {
      const cnt = PolymerHelper.insp(renderer);
      if (cnt && typeof cnt.notifyResize === "function") {
        try {
          cnt.notifyResize();
        } catch (err) {
          console.warn("[ExpanderFixer] Failed to notifyResize", err);
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
    const data = cnt?.data;
    let extractedCount = "";

    if (data) {
      const runs = data.commentsCount?.runs || data.countText?.runs;
      if (Array.isArray(runs) && runs.length > 0) {
        let maxDigits = -1;
        for (const item of runs) {
          const text = item.text || "";
          const digitCount = text.replace(/\D+/g, "").length;
          if (digitCount > maxDigits) {
            maxDigits = digitCount;
            extractedCount = text;
          }
        }
      }
    }

    if (!extractedCount) {
      const countEl = header.querySelector("#count, .count-text, ytd-comments-header-renderer yt-formatted-string");
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
    this.observerRegistry.deactivate("comments-count-watcher");
    this.observerRegistry.deactivate("description-expander-watcher");
  }
}
