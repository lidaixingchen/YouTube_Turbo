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
        messages: { tab_comments: "Commentaires" }
      },
      onTabSelected: (_tabKey): void => {},
      onFontSizeChanged: (_tabKey, _delta): void => {}
    };

    view.render(container, localizedOptions);
    view.updateCommentCount("17");

    expect(container.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS)?.getAttribute("aria-label"))
      .toBe("Commentaires 17");
    expect(container.querySelector(PAGE_CONSTANTS.SELECTORS.COMMENT_COUNT_BADGE)?.textContent).toBe("17");

    view.updateCommentCount("");
    expect(container.querySelector(PAGE_CONSTANTS.SELECTORS.TAB_BTN_COMMENTS)?.getAttribute("aria-label"))
      .toBe("Commentaires");

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

    const minusButton: HTMLElement = container.querySelector<HTMLElement>(
      `#${PAGE_CONSTANTS.IDS.TAB_BTN_INFO} .${PAGE_CONSTANTS.CLASSES.FONT_SIZE_MINUS}`
    ) as HTMLElement;
    const plusButton: HTMLElement = container.querySelector<HTMLElement>(
      `#${PAGE_CONSTANTS.IDS.TAB_BTN_INFO} .${PAGE_CONSTANTS.CLASSES.FONT_SIZE_PLUS}`
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
