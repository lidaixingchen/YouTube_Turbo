import { PAGE_CONSTANTS } from "./constants";
import type { TabKey, TabsViewOptions, LocaleSnapshot } from "./types";

function parseHtmlSafely(html: string): DocumentFragment {
  const template = document.createElement("template");
  if (typeof window !== "undefined" && window.trustedTypes) {
    try {
      const policy =
        window.trustedTypes.defaultPolicy ||
        window.trustedTypes.createPolicy("yt-tabview-policy-" + Math.random().toString(36).slice(2, 6), {
          createHTML: (s: string) => s
        });
      template.innerHTML = policy ? policy.createHTML(html) : html;
      return template.content;
    } catch {
      // 忽略策略创建失败，进入 DOMParser 降级
    }
  }

  try {
    template.innerHTML = html;
    return template.content;
  } catch {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const fragment = document.createDocumentFragment();
    while (doc.body.firstChild) {
      fragment.appendChild(doc.body.firstChild);
    }
    return fragment;
  }
}

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
    const fragment = parseHtmlSafely(tabsHtml);
    container.replaceChildren(fragment);

    this.bindEvents();
    this.updateLocale(localeSnapshot);
    for (const [tabKey, sizePx] of this.fontSizes) {
      this.setFontSize(tabKey, sizePx);
    }
    this.setActiveTab(this.activeTab);
  }

  public updateLocale(localeSnapshot: LocaleSnapshot): void {
    if (this.options) {
      this.options = { ...this.options, localeSnapshot };
    }
    if (!this.container) {
      return;
    }

    const tabKeys: TabKey[] = ["info", "comments", "videos", "playlist"];
    for (const tabKey of tabKeys) {
      const button: HTMLButtonElement | null = this.container.querySelector<HTMLButtonElement>(
        this.getTabButtonSelector(tabKey)
      );
      if (!button) {
        continue;
      }

      const label: string = this.getTabLabel(localeSnapshot, tabKey);
      if (tabKey !== "comments") {
        const labelElement: HTMLSpanElement | null = button.querySelector<HTMLSpanElement>("span");
        if (labelElement) {
          labelElement.textContent = label;
        }
      }

      const commentCount: string =
        tabKey === "comments"
          ? this.container.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.COMMENT_COUNT_BADGE)?.textContent?.trim() ?? ""
          : "";
      button.setAttribute(
        PAGE_CONSTANTS.ATTRIBUTES.ARIA_LABEL,
        commentCount ? `${label} ${commentCount}` : label
      );
    }
    this.updateFontSizeLabels(localeSnapshot);
  }

  public setActiveTab(tabKey: TabKey): void {
    this.activeTab = tabKey;
    if (!this.container) {
      return;
    }

    const tabButtons: NodeListOf<HTMLButtonElement> = this.container.querySelectorAll<HTMLButtonElement>(
      `button.${PAGE_CONSTANTS.CLASSES.TAB_BTN}[${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}]`
    );
    const tabPanels: NodeListOf<HTMLElement> = this.container.querySelectorAll<HTMLElement>(
      PAGE_CONSTANTS.SELECTORS.TAB_CONTENT_CHILDREN
    );

    const targetContentSelector: string = this.getContentSelector(tabKey);

    for (let i = 0; i < tabButtons.length; i++) {
      const btn: HTMLButtonElement = tabButtons[i];
      const contentAttr: string | null = btn.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT);
      const isActive: boolean = contentAttr === targetContentSelector;
      if (isActive) {
        btn.classList.add(PAGE_CONSTANTS.CLASSES.TAB_BTN_ACTIVE);
      } else {
        btn.classList.remove(PAGE_CONSTANTS.CLASSES.TAB_BTN_ACTIVE);
      }
      btn.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.ARIA_PRESSED, String(isActive));
    }

    for (let i = 0; i < tabPanels.length; i++) {
      const panel: HTMLElement = tabPanels[i];
      if (`#${panel.id}` === targetContentSelector) {
        panel.classList.remove(PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN);
        panel.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN);
        panel.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.ARIA_HIDDEN, "false");
      } else {
        panel.classList.add(PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN);
        panel.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN, "");
        panel.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.ARIA_HIDDEN, "true");
      }
    }

    const flexy: HTMLElement | null = document.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.YTD_WATCH_FLEXY);
    if (flexy) {
      flexy.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB, targetContentSelector);
    }
  }

  public updateCommentCount(countText: string): void {
    if (!this.container) {
      return;
    }
    const badge: HTMLElement | null = this.container.querySelector<HTMLElement>(
      PAGE_CONSTANTS.SELECTORS.COMMENT_COUNT_BADGE
    );
    if (badge) {
      badge.textContent = countText;
    }
    const commentsButton: HTMLButtonElement | null = this.container.querySelector<HTMLButtonElement>(
      PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS
    );
    if (commentsButton) {
      const label: string = this.options
        ? this.getTabLabel(this.options.localeSnapshot, "comments")
        : "Comments";
      const commentCount: string = countText.trim();
      commentsButton.setAttribute(
        PAGE_CONSTANTS.ATTRIBUTES.ARIA_LABEL,
        commentCount ? `${label} ${commentCount}` : label
      );
    }
  }

  private updateFontSizeLabels(localeSnapshot: LocaleSnapshot): void {
    if (!this.container) {
      return;
    }

    const fontSizeButtons: NodeListOf<HTMLButtonElement> = this.container.querySelectorAll<HTMLButtonElement>(
      `button.${PAGE_CONSTANTS.CLASSES.FONT_SIZE_BTN}`
    );
    for (let i: number = 0; i < fontSizeButtons.length; i++) {
      const fontSizeButton: HTMLButtonElement = fontSizeButtons[i];
      const group: HTMLElement | null = fontSizeButton.closest<HTMLElement>(
        `.${PAGE_CONSTANTS.CLASSES.TAB_BTN_GROUP}`
      );
      const tabButton: HTMLButtonElement | null = group?.querySelector<HTMLButtonElement>(
        `button.${PAGE_CONSTANTS.CLASSES.TAB_BTN}[${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}]`
      ) ?? null;
      if (!tabButton) {
        continue;
      }

      const tabKey: TabKey = this.getTabKeyFromSelector(
        tabButton.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT)
      );
      const messageKey: string = fontSizeButton.classList.contains(PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS)
        ? PAGE_CONSTANTS.I18N_KEYS.TAB_FONT_SIZE_INCREASE
        : PAGE_CONSTANTS.I18N_KEYS.TAB_FONT_SIZE_DECREASE;
      const actionLabel: string | undefined = localeSnapshot.messages[messageKey];
      if (!actionLabel) {
        fontSizeButton.removeAttribute(PAGE_CONSTANTS.ATTRIBUTES.ARIA_LABEL);
        continue;
      }

      const tabLabel: string = this.getTabLabel(localeSnapshot, tabKey);
      fontSizeButton.setAttribute(PAGE_CONSTANTS.ATTRIBUTES.ARIA_LABEL, `${tabLabel}: ${actionLabel}`);
    }
  }

  public setFontSize(tabKey: TabKey, sizePx: number): number {
    const clampedSize: number = Math.max(
      PAGE_CONSTANTS.FONT_SIZE.MIN_PX,
      Math.min(PAGE_CONSTANTS.FONT_SIZE.MAX_PX, sizePx)
    );
    this.fontSizes.set(tabKey, clampedSize);

    if (!this.container) {
      return clampedSize;
    }
    const selector: string = this.getContentSelector(tabKey);
    const panel: HTMLElement | null = this.container.querySelector<HTMLElement>(selector);
    if (panel) {
      panel.style.fontSize = `${clampedSize}px`;
    }
    return clampedSize;
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

  private getTabButtonSelector(tabKey: TabKey): string {
    switch (tabKey) {
      case "info":
        return PAGE_CONSTANTS.SELECTORS.TAB_BTN_INFO;
      case "comments":
        return PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS;
      case "videos":
        return PAGE_CONSTANTS.SELECTORS.TAB_BTN_VIDEOS;
      case "playlist":
        return PAGE_CONSTANTS.SELECTORS.TAB_BTN_PLAYLIST;
    }
  }

  private getTabLabel(localeSnapshot: LocaleSnapshot, tabKey: TabKey): string {
    switch (tabKey) {
      case "info":
        return localeSnapshot.messages["tab_info"] || "Info";
      case "comments":
        return localeSnapshot.messages["tab_comments"] || "Comments";
      case "videos":
        return localeSnapshot.messages["tab_videos"] || "Videos";
      case "playlist":
        return localeSnapshot.messages["tab_playlist"] || "Playlist";
    }
  }

  private generateTabsHtml(localeSnapshot: LocaleSnapshot): string {
    const strRipple: string = `
      <paper-ripple class="style-scope yt-icon-button">
        <div id="background" class="style-scope paper-ripple" style="opacity:0;"></div>
        <div id="waves" class="style-scope paper-ripple"></div>
      </paper-ripple>
    `;

    const strFontBtns = (): string => `
      <div class="${PAGE_CONSTANTS.CLASSES.FONT_SIZE_RIGHT}">
        <button type="button" class="${PAGE_CONSTANTS.CLASSES.FONT_SIZE_BTN} ${PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="8rdLQ">
          <svg width="12" height="12" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet"
               stroke="currentColor" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-size" aria-hidden="true" focusable="false">
            <path d="M12 25H38M25 12V38"/>
          </svg>
        </button>
        <button type="button" class="${PAGE_CONSTANTS.CLASSES.FONT_SIZE_BTN} ${PAGE_CONSTANTS.CLASSES.FONT_SIZE_MINUS}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="8rdLQ">
          <svg width="12" height="12" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet"
               stroke="currentColor" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-size" aria-hidden="true" focusable="false">
            <path d="M12 25h26"/>
          </svg>
        </button>
      </div>
    `.replace(/[\r\n\s]+/g, " ");

    const infoLabel: string = this.getTabLabel(localeSnapshot, "info");
    const videosLabel: string = this.getTabLabel(localeSnapshot, "videos");
    const playlistLabel: string = this.getTabLabel(localeSnapshot, "playlist");

    const svgInfoElm: string = `<svg width="16" height="16" viewBox="0 0 60 60" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${PAGE_CONSTANTS.SVG.INFO}</svg>`;
    const svgCommentsElm: string = `<svg width="16" height="16" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${PAGE_CONSTANTS.SVG.COMMENTS}</svg>`;
    const svgVideosElm: string = `<svg width="16" height="16" viewBox="0 0 90 90" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${PAGE_CONSTANTS.SVG.VIDEOS}</svg>`;
    const svgPlaylistElm: string = `<svg width="16" height="16" viewBox="0 0 20 20" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${PAGE_CONSTANTS.SVG.PLAYLIST}</svg>`;

    return `
      <tabview-view-pos-thead></tabview-view-pos-thead>
      <header>
        <div id="${PAGE_CONSTANTS.IDS.MATERIAL_TABS}">
          <div class="${PAGE_CONSTANTS.CLASSES.TAB_BTN_GROUP}">
            <button type="button" id="${PAGE_CONSTANTS.IDS.TAB_BTN_INFO}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="q9Kjc" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}="${PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER}" ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_CONTROLS}="${PAGE_CONSTANTS.IDS.TAB_INFO}" ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_PRESSED}="false" class="${PAGE_CONSTANTS.CLASSES.TAB_BTN}">
              ${svgInfoElm}<span>${infoLabel}</span>${strRipple}
            </button>${strFontBtns()}
          </div>
          <div class="${PAGE_CONSTANTS.CLASSES.TAB_BTN_GROUP}">
            <button type="button" id="${PAGE_CONSTANTS.IDS.TAB_BTN_COMMENTS}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="q9Kjc" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}="${PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER}" ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_CONTROLS}="${PAGE_CONSTANTS.IDS.TAB_COMMENTS}" ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_PRESSED}="false" class="${PAGE_CONSTANTS.CLASSES.TAB_BTN}">
              ${svgCommentsElm}<span id="${PAGE_CONSTANTS.IDS.COMMENT_COUNT_BADGE}"></span>${strRipple}
            </button>${strFontBtns()}
          </div>
          <div class="${PAGE_CONSTANTS.CLASSES.TAB_BTN_GROUP}">
            <button type="button" id="${PAGE_CONSTANTS.IDS.TAB_BTN_VIDEOS}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="q9Kjc" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}="${PAGE_CONSTANTS.SELECTORS.TAB_VIDEOS_CONTAINER}" ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_CONTROLS}="${PAGE_CONSTANTS.IDS.TAB_VIDEOS}" ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_PRESSED}="false" class="${PAGE_CONSTANTS.CLASSES.TAB_BTN}">
              ${svgVideosElm}<span>${videosLabel}</span>${strRipple}
            </button>${strFontBtns()}
          </div>
          <div class="${PAGE_CONSTANTS.CLASSES.TAB_BTN_GROUP}">
            <button type="button" id="${PAGE_CONSTANTS.IDS.TAB_BTN_PLAYLIST}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_DI}="q9Kjc" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}="${PAGE_CONSTANTS.SELECTORS.TAB_PLAYLIST_CONTAINER}" ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_CONTROLS}="${PAGE_CONSTANTS.IDS.TAB_PLAYLIST}" ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_PRESSED}="false" class="${PAGE_CONSTANTS.CLASSES.TAB_BTN} ${PAGE_CONSTANTS.CLASSES.TAB_BTN_HIDDEN}">
              ${svgPlaylistElm}<span>${playlistLabel}</span>${strRipple}
            </button>${strFontBtns()}
          </div>
        </div>
      </header>
      <div class="tab-content">
        <div id="${PAGE_CONSTANTS.IDS.TAB_INFO}" class="${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_CLD} ${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN} ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_HIDDEN}="true" ${PAGE_CONSTANTS.ATTRIBUTES.USERSCRIPT_SCROLLBAR}></div>
        <div id="${PAGE_CONSTANTS.IDS.TAB_COMMENTS}" class="${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_CLD} ${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN} ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_HIDDEN}="true" ${PAGE_CONSTANTS.ATTRIBUTES.USERSCRIPT_SCROLLBAR}></div>
        <div id="${PAGE_CONSTANTS.IDS.TAB_VIDEOS}" class="${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_CLD} ${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN} ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_HIDDEN}="true" ${PAGE_CONSTANTS.ATTRIBUTES.USERSCRIPT_SCROLLBAR}></div>
        <div id="${PAGE_CONSTANTS.IDS.TAB_PLAYLIST}" class="${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_CLD} ${PAGE_CONSTANTS.CLASSES.TAB_CONTENT_HIDDEN}" ${PAGE_CONSTANTS.ATTRIBUTES.TYT_HIDDEN} ${PAGE_CONSTANTS.ATTRIBUTES.ARIA_HIDDEN}="true" ${PAGE_CONSTANTS.ATTRIBUTES.USERSCRIPT_SCROLLBAR}></div>
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
      const target: EventTarget | null = ev.target;
      if (!(target instanceof Element)) {
        return;
      }

      const fontSizeButton: HTMLButtonElement | null = target.closest<HTMLButtonElement>(
        `button.${PAGE_CONSTANTS.CLASSES.FONT_SIZE_BTN}`
      );
      if (fontSizeButton) {
        const group: HTMLElement | null = fontSizeButton.closest<HTMLElement>(
          `.${PAGE_CONSTANTS.CLASSES.TAB_BTN_GROUP}`
        );
        const tabButton: HTMLButtonElement | null = group?.querySelector<HTMLButtonElement>(
          `button.${PAGE_CONSTANTS.CLASSES.TAB_BTN}[${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}]`
        ) ?? null;
        if (!tabButton) {
          return;
        }

        const tabKey: TabKey = this.getTabKeyFromSelector(
          tabButton.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT)
        );
        const currentSize: number = this.getFontSize(tabKey);
        const stepPx: number = fontSizeButton.classList.contains(PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS)
          ? PAGE_CONSTANTS.FONT_SIZE.STEP_PX
          : -PAGE_CONSTANTS.FONT_SIZE.STEP_PX;
        const appliedSize: number = this.setFontSize(tabKey, currentSize + stepPx);
        this.options?.onFontSizeChanged(tabKey, appliedSize);
        return;
      }

      const tabButton: HTMLButtonElement | null = target.closest<HTMLButtonElement>(
        `button.${PAGE_CONSTANTS.CLASSES.TAB_BTN}[${PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT}]`
      );
      if (!tabButton) {
        return;
      }

      const tabKey: TabKey = this.getTabKeyFromSelector(
        tabButton.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.TYT_TAB_CONTENT)
      );
      this.setActiveTab(tabKey);
      this.options?.onTabSelected(tabKey);
    });
  }
}
