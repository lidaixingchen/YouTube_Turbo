import { describe, expect, it } from "vitest";
import { PAGE_CONSTANTS } from "../constants";
import { TabsView } from "../tabs-view";
import type { TabKey, TabsViewOptions } from "../types";

const options: TabsViewOptions = {
  localeSnapshot: { locale: "en", messages: {} },
  onTabSelected: (_tabKey): void => {},
  onFontSizeChanged: (_tabKey, _delta): void => {}
};

describe("TabsView font size projection", () => {
  it("exposes tab and font size actions as keyboard-operable buttons", () => {
    const selectedTabs: TabKey[] = [];
    const reportedSizes: Array<{ tabKey: TabKey; sizePx: number }> = [];
    const view: TabsView = new TabsView();
    const container: HTMLElement = document.createElement("section");
    const accessibleOptions: TabsViewOptions = {
      ...options,
      localeSnapshot: {
        locale: "en",
        messages: {
          tab_info: "Info",
          tab_comments: "Comments",
          tab_videos: "Videos",
          tab_playlist: "Playlist",
          [PAGE_CONSTANTS.I18N_KEYS.TAB_FONT_SIZE_INCREASE]: "Increase font size",
          [PAGE_CONSTANTS.I18N_KEYS.TAB_FONT_SIZE_DECREASE]: "Decrease font size"
        }
      },
      onTabSelected: (tabKey: TabKey): void => {
        selectedTabs.push(tabKey);
      },
      onFontSizeChanged: (tabKey: TabKey, sizePx: number): void => {
        reportedSizes.push({ tabKey, sizePx });
      }
    };
    document.body.appendChild(container);
    view.render(container, accessibleOptions);

    const commentsButton: HTMLElement | null = container.querySelector<HTMLElement>(
      PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS
    );
    expect(commentsButton).toBeInstanceOf(HTMLButtonElement);
    if (!commentsButton) {
      return;
    }
    expect(commentsButton.querySelector("button")).toBeNull();
    expect(commentsButton.getAttribute("aria-pressed")).toBe("false");
    expect(commentsButton.getAttribute("aria-label")).toBe("Comments");
    commentsButton.focus();
    expect(document.activeElement).toBe(commentsButton);
    commentsButton.click();

    expect(view.getActiveTab()).toBe("comments");
    expect(commentsButton.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(`#${PAGE_CONSTANTS.IDS.TAB_INFO}`)?.getAttribute(
      PAGE_CONSTANTS.ATTRIBUTES.ARIA_HIDDEN
    )).toBe("true");
    expect(container.querySelector(`#${PAGE_CONSTANTS.IDS.TAB_COMMENTS}`)?.getAttribute(
      PAGE_CONSTANTS.ATTRIBUTES.ARIA_HIDDEN
    )).toBe("false");
    expect(selectedTabs).toEqual(["comments"]);

    const infoButton: HTMLElement | null = container.querySelector<HTMLElement>(
      PAGE_CONSTANTS.SELECTORS.TAB_BTN_INFO
    );
    const increaseButton: HTMLElement | null = infoButton?.parentElement?.querySelector<HTMLElement>(
      `.${PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS}`
    ) ?? null;
    expect(increaseButton).toBeInstanceOf(HTMLButtonElement);
    if (!increaseButton) {
      return;
    }
    expect(infoButton?.contains(increaseButton)).toBe(false);
    expect(increaseButton.parentElement?.parentElement).toBe(infoButton?.parentElement);
    expect(increaseButton.getAttribute("aria-label")).toBe("Info: Increase font size");
    increaseButton.focus();
    expect(document.activeElement).toBe(increaseButton);
    increaseButton.click();

    expect(view.getFontSize("info")).toBe(
      PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX + PAGE_CONSTANTS.FONT_SIZE.STEP_PX
    );
    expect(reportedSizes).toEqual([
      {
        tabKey: "info",
        sizePx: PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX + PAGE_CONSTANTS.FONT_SIZE.STEP_PX
      }
    ]);
    expect(view.getActiveTab()).toBe("comments");
    expect(selectedTabs).toEqual(["comments"]);

    view.destroy();
    container.remove();
  });

  it("applies each saved tab font size to panels created by a later render", () => {
    const view: TabsView = new TabsView();
    const firstContainer: HTMLElement = document.createElement("section");
    const secondContainer: HTMLElement = document.createElement("section");
    const infoSize: number = PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX + PAGE_CONSTANTS.FONT_SIZE.STEP_PX;
    const commentsSize: number = PAGE_CONSTANTS.FONT_SIZE.DEFAULT_PX - PAGE_CONSTANTS.FONT_SIZE.STEP_PX;

    view.render(firstContainer, options);
    view.setFontSize("info", infoSize);
    view.setFontSize("comments", commentsSize);
    view.destroy();
    view.render(secondContainer, options);

    expect(secondContainer.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER)?.style.fontSize)
      .toBe(`${infoSize}px`);
    expect(secondContainer.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_COMMENTS_CONTAINER)?.style.fontSize)
      .toBe(`${commentsSize}px`);
    expect(view.getFontSize("info")).toBe(infoSize);
    expect(view.getFontSize("comments")).toBe(commentsSize);

    view.destroy();
  });

  it("keeps the translated comments accessible name synchronized with its count", () => {
    const view: TabsView = new TabsView();
    const container: HTMLElement = document.createElement("section");
    const localizedOptions: TabsViewOptions = {
      localeSnapshot: {
        locale: "fr",
        messages: {
          tab_info: "Informations",
          tab_comments: "Commentaires",
          [PAGE_CONSTANTS.I18N_KEYS.TAB_FONT_SIZE_INCREASE]: "Augmenter la taille du texte",
          [PAGE_CONSTANTS.I18N_KEYS.TAB_FONT_SIZE_DECREASE]: "Réduire la taille du texte"
        }
      },
      onTabSelected: (_tabKey): void => {},
      onFontSizeChanged: (_tabKey, _delta): void => {}
    };

    view.render(container, localizedOptions);
    view.updateCommentCount("17");

    expect(container.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS)?.getAttribute("aria-label"))
      .toBe("Commentaires 17");
    expect(container.querySelector(PAGE_CONSTANTS.SELECTORS.COMMENT_COUNT_BADGE)?.textContent).toBe("17");
    expect(container.querySelector<HTMLButtonElement>(
      `#${PAGE_CONSTANTS.IDS.TAB_BTN_INFO} + .${PAGE_CONSTANTS.CLASSES.FONT_SIZE_RIGHT} .${PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS}`
    )?.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.ARIA_LABEL)).toBe("Informations: Augmenter la taille du texte");

    view.updateLocale({
      locale: "fr-CA",
      messages: {
        tab_info: "Détails",
        tab_comments: "Discussions",
        [PAGE_CONSTANTS.I18N_KEYS.TAB_FONT_SIZE_INCREASE]: "Agrandir le texte",
        [PAGE_CONSTANTS.I18N_KEYS.TAB_FONT_SIZE_DECREASE]: "Réduire le texte"
      }
    });
    expect(container.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS)?.getAttribute("aria-label"))
      .toBe("Discussions 17");
    expect(container.querySelector<HTMLButtonElement>(
      `#${PAGE_CONSTANTS.IDS.TAB_BTN_INFO} + .${PAGE_CONSTANTS.CLASSES.FONT_SIZE_RIGHT} .${PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS}`
    )?.getAttribute(PAGE_CONSTANTS.ATTRIBUTES.ARIA_LABEL)).toBe("Détails: Agrandir le texte");

    view.updateCommentCount("");
    expect(container.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS)?.getAttribute("aria-label"))
      .toBe("Discussions");

    view.destroy();
  });

  it("reports the applied font size when controls keep clicking at either bound", () => {
    const reportedSizes: Array<{ tabKey: TabKey; sizePx: number }> = [];
    const boundaryOptions: TabsViewOptions = {
      ...options,
      onFontSizeChanged: (tabKey: TabKey, sizePx: number): void => {
        reportedSizes.push({ tabKey, sizePx });
      }
    };
    const view: TabsView = new TabsView();
    const container: HTMLElement = document.createElement("section");
    view.render(container, boundaryOptions);

    const infoButton: HTMLElement | null = container.querySelector<HTMLElement>(
      PAGE_CONSTANTS.SELECTORS.TAB_BTN_INFO
    );
    const minusButton: HTMLElement = infoButton?.parentElement?.querySelector<HTMLElement>(
      `.${PAGE_CONSTANTS.CLASSES.FONT_SIZE_MINUS}`
    ) as HTMLElement;
    const plusButton: HTMLElement = infoButton?.parentElement?.querySelector<HTMLElement>(
      `.${PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS}`
    ) as HTMLElement;

    view.setFontSize("info", PAGE_CONSTANTS.FONT_SIZE.MIN_PX);
    minusButton.click();
    minusButton.click();
    expect(view.getFontSize("info")).toBe(PAGE_CONSTANTS.FONT_SIZE.MIN_PX);
    expect(container.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER)?.style.fontSize)
      .toBe(`${PAGE_CONSTANTS.FONT_SIZE.MIN_PX}px`);
    expect(reportedSizes).toEqual([
      { tabKey: "info", sizePx: PAGE_CONSTANTS.FONT_SIZE.MIN_PX },
      { tabKey: "info", sizePx: PAGE_CONSTANTS.FONT_SIZE.MIN_PX }
    ]);

    reportedSizes.length = 0;
    view.setFontSize("info", PAGE_CONSTANTS.FONT_SIZE.MAX_PX);
    plusButton.click();
    plusButton.click();
    expect(view.getFontSize("info")).toBe(PAGE_CONSTANTS.FONT_SIZE.MAX_PX);
    expect(container.querySelector<HTMLElement>(PAGE_CONSTANTS.SELECTORS.TAB_INFO_CONTAINER)?.style.fontSize)
      .toBe(`${PAGE_CONSTANTS.FONT_SIZE.MAX_PX}px`);
    expect(reportedSizes).toEqual([
      { tabKey: "info", sizePx: PAGE_CONSTANTS.FONT_SIZE.MAX_PX },
      { tabKey: "info", sizePx: PAGE_CONSTANTS.FONT_SIZE.MAX_PX }
    ]);

    view.destroy();
  });
});
