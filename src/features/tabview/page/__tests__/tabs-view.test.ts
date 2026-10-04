import { describe, expect, it } from "vitest";
import { PAGE_CONSTANTS } from "../constants";
import { TabsView } from "../tabs-view";
import type { TabsViewOptions } from "../types";

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
});
