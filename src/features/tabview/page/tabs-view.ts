import { PAGE_CONSTANTS } from "./constants";
import type { TabKey, TabsViewOptions, LocaleSnapshot } from "./types";

export class TabsView {
  private container: HTMLElement | null = null;
  private activeTab: TabKey = "info";
  private options: TabsViewOptions | null = null;
  private fontSizes: Map<TabKey, number> = new Map([
    ["info", PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX],
    ["comments", PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX],
    ["videos", PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX],
    ["playlist", PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX]
  ]);

  public render(container: HTMLElement, options: TabsViewOptions): void {
    this.container = container;
    this.options = options;
    const { localeSnapshot } = options;

    const tabsHtml = this.generateTabsHtml(localeSnapshot);
    container.innerHTML = tabsHtml;

    this.bindEvents();
    this.setActiveTab(this.activeTab);
  }

  public setActiveTab(tabKey: TabKey): void {
    this.activeTab = tabKey;
    if (!this.container) {
      return;
    }

    const tabButtons = this.container.querySelectorAll<HTMLAnchorElement>(`a.${PAGE_CONSTANTS.CLASSES.TAB_BTN}`);
    const tabPanels = this.container.querySelectorAll<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_CONTENT_CHILDREN);

    const targetContentSelector = this.getContentSelector(tabKey);

    for (const btn of tabButtons) {
      const contentAttr = btn.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT);
      if (contentAttr === targetContentSelector) {
        btn.classList.add(PAGE_CONSTANTS.CLASSES.TAB_BTN_ACTIVE);
      } else {
        btn.classList.remove(PAGE_CONSTANTS.CLASSES.TAB_BTN_ACTIVE);
      }
    }

    for (const panel of tabPanels) {
      if (`#${panel.id}` === targetContentSelector) {
        panel.classList.remove(PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN);
        panel.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN);
      } else {
        panel.classList.add(PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN);
        panel.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN, "");
      }
    }

    const flexy = document.querySelector(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (flexy) {
      flexy.setAttribute("tyt-tab", targetContentSelector);
    }
  }

  public updateCommentCount(countText: string): void {
    if (!this.container) {
      return;
    }
    const badge = this.container.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.COMMENT_COUNT_BADGE);
    if (badge) {
      badge.textContent = countText;
    }
  }

  public setFontSize(tabKey: TabKey, sizePx: number): void {
    const clampedSize = Math.max(
      PAGE_CONSTANTS.FONT_SIZE.MIN_PX,
      Math.min(PAGE_CONSTANTS.FONT_SIZE.MAX_PX, sizePx)
    );
    this.fontSizes.set(tabKey, clampedSize);

    if (!this.container) {
      return;
    }
    const selector = this.getContentSelector(tabKey);
    const panel = this.container.querySelector<HTMLElement>(selector);
    if (panel) {
      panel.style.fontSize = `${clampedSize}px`;
    }
  }

  public getFontSize(tabKey: TabKey): number {
    return this.fontSizes.get(tabKey) ?? PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX;
  }

  public getActiveTab(): TabKey {
    return this.activeTab;
  }

  public destroy(): void {
    if (this.container) {
      this.container.innerHTML = "";
      this.container = null;
    }
    this.options = null;
  }

  private getContentSelector(tabKey: TabKey): string {
    switch (tabKey) {
      case "info":
        return PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER;
      case "comments":
        return PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER;
      case "videos":
        return PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER;
      case "playlist":
        return PAGE_CONSTANTS.SELECTORS.TAB_PLAYLIST_CONTAINER;
    }
  }

  private getTabKeyFromSelector(selector: string | null): TabKey {
    switch (selector) {
      case PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER:
        return "comments";
      case PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER:
        return "videos";
      case PAGE_CONSTANTS.SELECTORS.TAB_PLAYLIST_CONTAINER:
        return "playlist";
      case PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER:
      default:
        return "info";
    }
  }

  private generateTabsHtml(localeSnapshot: LocaleSnapshot): string {
    const getMessage = (key: string, fallback: string): string => {
      return localeSnapshot.messages[key] || fallback;
    };

    const strRipple = `
      <paper-ripple class="style-scope yt-icon-button">
        <div id="background" class="style-scope paper-ripple" style="opacity:0;"></div>
        <div id="waves" class="style-scope paper-ripple"></div>
      </paper-ripple>
    `;

    const strFontBtns = `
      <div class="${PAGE_CONSTANTS.CLASSES.FONT_SIZE_RIGHT}">
        <div class="${PAGE_CONSTANTS.CLASSES.FONT_SIZE_BTN} ${PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="8rdLQ">
          <svg width="12" height="12" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet"
               stroke="currentColor" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-size">
            <path d="M12 25H38M25 12V38"/>
          </svg>
        </div>
        <div class="${PAGE_CONSTANTS.CLASSES.FONT_SIZE_BTN} ${PAGE_CONSTANTS.CLASSES.FONT_SIZE_MINUS}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="8rdLQ">
          <svg width="12" height="12" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet"
               stroke="currentColor" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-size">
            <path d="M12 25h26"/>
          </svg>
        </div>
      </div>
    `.replace(/[\r\n\s]+/g, " ");

    const infoLabel = getMessage("tab_info", "Info");
    const videosLabel = getMessage("tab_videos", "Videos");
    const playlistLabel = getMessage("tab_playlist", "Playlist");

    const svgInfoElm = `<svg width="16" height="16" viewBox="0 0 60 60" preserveAspectRatio="xMidYMid meet">${PAGE_CONSTANTS.SVG.INFO}</svg>`;
    const svgCommentsElm = `<svg width="16" height="16" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet">${PAGE_CONSTANTS.SVG.COMMENTS}</svg>`;
    const svgVideosElm = `<svg width="16" height="16" viewBox="0 0 90 90" preserveAspectRatio="xMidYMid meet">${PAGE_CONSTANTS.SVG.VIDEOS}</svg>`;
    const svgPlaylistElm = `<svg width="16" height="16" viewBox="0 0 20 20" preserveAspectRatio="xMidYMid meet">${PAGE_CONSTANTS.SVG.PLAYLIST}</svg>`;

    return `
      <tabview-view-pos-thead></tabview-view-pos-thead>
      <header>
        <div id="material-tabs">
          <a id="tab-btn1" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="q9Kjc" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}="${PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER}" class="${PAGE_CONSTANTS.CLASSES.TAB_BTN}">
            ${svgInfoElm}<span>${infoLabel}</span>${strRipple}${strFontBtns}
          </a>
          <a id="tab-btn3" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="q9Kjc" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}="${PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER}" class="${PAGE_CONSTANTS.CLASSES.TAB_BTN}">
            ${svgCommentsElm}<span id="tyt-cm-count"></span>${strRipple}${strFontBtns}
          </a>
          <a id="tab-btn4" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="q9Kjc" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}="${PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER}" class="${PAGE_CONSTANTS.CLASSES.TAB_BTN}">
            ${svgVideosElm}<span>${videosLabel}</span>${strRipple}${strFontBtns}
          </a>
          <a id="tab-btn5" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="q9Kjc" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}="${PAGE_CONSTANTS.SELECTORS.TAB_PLAYLIST_CONTAINER}" class="${PAGE_CONSTANTS.CLASSES.TAB_BTN} ${PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN}">
            ${svgPlaylistElm}<span>${playlistLabel}</span>${strRipple}${strFontBtns}
          </a>
        </div>
      </header>
      <div class="tab-content">
        <div id="tab-info" class="${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_CLD} ${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN} ${PAGE_CONSTANTS.ATTRIBUTES.USERSCRIPT_SCROLLBAR}></div>
        <div id="tab-comments" class="${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_CLD} ${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN} ${PAGE_CONSTANTS.ATTRIBUTES.USERSCRIPT_SCROLLBAR}></div>
        <div id="tab-videos" class="${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_CLD} ${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN} ${PAGE_CONSTANTS.ATTRIBUTES.USERSCRIPT_SCROLLBAR}></div>
        <div id="tab-list" class="${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_CLD} ${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN} ${PAGE_CONSTANTS.ATTRIBUTES.USERSCRIPT_SCROLLBAR}></div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.container) {
      return;
    }

    const materialTabs = this.container.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.MATERIAL_TABS);
    if (!materialTabs) {
      return;
    }

    materialTabs.addEventListener("click", (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) {
        return;
      }

      const fontPlus = target.closest(`.${PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS}`);
      const fontMinus = target.closest(`.${PAGE_CONSTANTS.CLASSES.FONT_SIZE_MINUS}`);
      const tabBtn = target.closest<HTMLAnchorElement>(`a.${PAGE_CONSTANTS.CLASSES.TAB_BTN}`);

      if (!tabBtn) {
        return;
      }

      const tabKey = this.getTabKeyFromSelector(
        tabBtn.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT)
      );

      if (fontPlus) {
        ev.preventDefault();
        ev.stopPropagation();
        const currentSize = this.getFontSize(tabKey);
        const nextSize = currentSize + PAGE_CONSTANTS.FONT_SIZE.STEP_PX;
        this.setFontSize(tabKey, nextSize);
        this.options?.onFontSizeChanged(tabKey, nextSize);
        return;
      }

      if (fontMinus) {
        ev.preventDefault();
        ev.stopPropagation();
        const currentSize = this.getFontSize(tabKey);
        const nextSize = currentSize - PAGE_CONSTANTS.FONT_SIZE.STEP_PX;
        this.setFontSize(tabKey, nextSize);
        this.options?.onFontSizeChanged(tabKey, nextSize);
        return;
      }

      ev.preventDefault();
      this.setActiveTab(tabKey);
      this.options?.onTabSelected(tabKey);
    });
  }
}
