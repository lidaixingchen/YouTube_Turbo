import { PAGE_CONSTANTS } from "./constants";
import { PolymerHelper } from "./polymer-helper";
import type { LcCommentResult, ContentsRendererLocation } from "./types";

export class LinkedCommentAdapter {
  private static instance: LinkedCommentAdapter | null = null;
  private commentObserver: MutationObserver | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  public static getInstance(): LinkedCommentAdapter {
    if (!LinkedCommentAdapter.instance) {
      LinkedCommentAdapter.instance = new LinkedCommentAdapter();
    }
    return LinkedCommentAdapter.instance;
  }

  public syncLinkedComment(specifiedLcId?: string): boolean {
    const searchParams = new URLSearchParams(window.location.search);
    const targetLcId = specifiedLcId || searchParams.get("lc");
    if (!targetLcId) {
      this.disconnectSupervisor();
      return false;
    }

    const currentLc = this.findLcComment();
    if (currentLc && currentLc.lc !== targetLcId) {
      const isSuccess = this.reorderCommentThread(targetLcId, currentLc.lc);
      if (isSuccess) {
        this.disconnectSupervisor();
        const updatedTarget = this.findLcComment(targetLcId);
        if (updatedTarget) {
          this.scrollToComment(updatedTarget.commentRendererElm);
        }
        return true;
      }
    }

    const targetComment = this.findLcComment(targetLcId);
    if (targetComment) {
      this.disconnectSupervisor();
      this.scrollToComment(targetComment.commentRendererElm);
      return true;
    }

    this.startSupervisor(targetLcId);
    return false;
  }

  private reorderCommentThread(targetLcId: string, currentLcId: string): boolean {
    try {
      const r1 = this.findLcComment(currentLcId)?.commentRendererElm;
      const r2 = this.findLcComment(targetLcId)?.commentRendererElm;
      if (!r1 || !r2) {
        return false;
      }

      const r1cnt = PolymerHelper.insp(r1);
      const r2cnt = PolymerHelper.insp(r2);
      const r1Badge = (r1cnt?.data as Record<string, unknown> | undefined)?.linkedCommentBadge as
        | Record<string, unknown>
        | undefined;
      const r2Badge = (r2cnt?.data as Record<string, unknown> | undefined)?.linkedCommentBadge;

      if (typeof r1Badge !== "object" || r1Badge === null || typeof r2Badge !== "undefined") {
        return false;
      }

      const rawMetaBadge = r1Badge.metadataBadgeRenderer as Record<string, unknown> | undefined;
      const badgeCopy: Record<string, unknown> = {
        ...r1Badge,
        ...(rawMetaBadge ? { metadataBadgeRenderer: { ...rawMetaBadge } } : {})
      };
      const metaBadge = badgeCopy.metadataBadgeRenderer as Record<string, unknown> | undefined;
      if (metaBadge?.trackingParams) {
        delete metaBadge.trackingParams;
      }

      const v1 = this.findContentsRenderer(r1);
      const v2 = this.findContentsRenderer(r2);
      if (!v1 || !v2 || v1.parent !== v2.parent || v2.index < 0) {
        return false;
      }

      if (v2.parent.nodeName !== "YTD-COMMENT-REPLIES-RENDERER") {
        const v2pCnt = PolymerHelper.insp(v2.parent);
        if (v2pCnt) {
          const v2Contents = (v2pCnt.data as { contents?: unknown[] } | undefined)?.contents;
          if (Array.isArray(v2Contents)) {
            const targetItem = v2Contents[v2.index];
            const nextContents = [
              targetItem,
              ...v2Contents.slice(0, v2.index),
              ...v2Contents.slice(v2.index + 1)
            ];
            v2pCnt.data = {
              ...(v2pCnt.data as Record<string, unknown>),
              contents: nextContents
            };
          }
        }
      }

      return this.transferCommentBadge(r1, r2, badgeCopy);
    } catch {
      return false;
    }
  }

  private transferCommentBadge(
    fromEl: HTMLElement,
    toEl: HTMLElement,
    badgeData: Record<string, unknown>
  ): boolean {
    try {
      const r1cnt = PolymerHelper.insp(fromEl);
      const r2cnt = PolymerHelper.insp(toEl);
      if (!r1cnt?.data || !r2cnt?.data) {
        return false;
      }

      const r1d = r1cnt.data as Record<string, unknown>;
      delete r1d.linkedCommentBadge;
      r1cnt.data = { ...r1d };

      const r2d = r2cnt.data as Record<string, unknown>;
      r2cnt.data = { ...r2d, linkedCommentBadge: { ...badgeData } };
      return true;
    } catch {
      return false;
    }
  }

  private scrollToComment(element: HTMLElement): void {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  private startSupervisor(targetLcId: string): void {
    this.disconnectSupervisor();

    const commentsContainer =
      document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER + " ytd-comments #contents") ||
      document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER + " ytd-comments") ||
      document.querySelector<HTMLElement>("ytd-comments");

    if (!commentsContainer) {
      return;
    }

    this.commentObserver = new MutationObserver(() => {
      const success = this.syncLinkedComment(targetLcId);
      if (success) {
        this.disconnectSupervisor();
      }
    });

    this.commentObserver.observe(commentsContainer, {
      childList: true,
      subtree: true
    });

    this.timeoutTimer = setTimeout(() => {
      this.disconnectSupervisor();
    }, PAGE_CONSTANTS.TIMEOUTS.LINKED_COMMENT_READY_MS);
  }

  public disconnectSupervisor(): void {
    if (this.commentObserver) {
      this.commentObserver.disconnect();
      this.commentObserver = null;
    }
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private findLcComment(targetLc?: string): LcCommentResult | null {
    if (targetLc) {
      const element =
        document.querySelector<HTMLElement>(
          `#tab-comments ytd-comments ytd-comment-renderer #header-author a[href*="lc=${targetLc}"]`
        ) ||
        document.querySelector<HTMLElement>(
          `ytd-comments ytd-comment-renderer #header-author a[href*="lc=${targetLc}"]`
        );
      if (element) {
        const commentRendererElm = element.closest<HTMLElement>("ytd-comment-renderer");
        if (commentRendererElm) {
          return {
            lc: targetLc,
            commentRendererElm
          };
        }
      }
    } else {
      const element =
        document.querySelector<HTMLElement>(
          `#tab-comments ytd-comments ytd-comment-renderer > #linked-comment-badge span:not(:empty)`
        ) ||
        document.querySelector<HTMLElement>(
          `ytd-comments ytd-comment-renderer > #linked-comment-badge span:not(:empty)`
        );
      if (element) {
        const commentRendererElm = element.closest<HTMLElement>("ytd-comment-renderer");
        if (commentRendererElm) {
          const header = commentRendererElm.querySelector<HTMLElement>("#header-author");
          if (header) {
            const anchor = header.querySelector<HTMLAnchorElement>('a[href*="lc="]');
            if (anchor) {
              const href = anchor.getAttribute("href") || "";
              const match = /[&?]lc=([\w_.-]+)/.exec(href);
              if (match && match[1]) {
                return {
                  lc: match[1],
                  commentRendererElm
                };
              }
            }
          }
        }
      }
    }
    return null;
  }

  private findContentsRenderer(commentRendererElm: HTMLElement): ContentsRendererLocation | null {
    const parent = commentRendererElm.closest<HTMLElement>(
      "ytd-comments, ytd-item-section-renderer, ytd-comment-thread-renderer, ytd-comment-replies-renderer"
    );
    if (!parent) {
      return null;
    }

    const parentCnt = PolymerHelper.insp(parent);
    const data = parentCnt?.data as { contents?: unknown[] } | undefined;
    const contents = data?.contents;

    let index = -1;
    if (Array.isArray(contents)) {
      const commentCnt = PolymerHelper.insp(commentRendererElm);
      const commentData = commentCnt?.data;

      for (let i = 0; i < contents.length; i++) {
        const item = contents[i] as Record<string, unknown> | undefined;
        const threadComment = (item?.commentThreadRenderer as Record<string, unknown> | undefined)?.comment as
          | Record<string, unknown>
          | undefined;
        if (
          item === commentData ||
          threadComment?.commentRenderer === commentData ||
          item?.commentRenderer === commentData
        ) {
          index = i;
          break;
        }
      }

      if (index === -1) {
        const childElements = Array.from(parent.children);
        const hostItem = commentRendererElm.closest<HTMLElement>("ytd-comment-thread-renderer") || commentRendererElm;
        index = childElements.indexOf(hostItem);
      }
    }

    return {
      parent,
      index
    };
  }

  public destroy(): void {
    this.disconnectSupervisor();
  }
}
