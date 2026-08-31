import { commonUtil } from "../../core/dom-adapter";
import { StyleEngine } from "../../core/style-engine";

export const MarkOrRemoveAd = {
  markADHTMLElement(): void {
    const cssMarkSelectorArr = [
      "#masthead-ad",
      "ytd-rich-item-renderer.style-scope.ytd-rich-grid-row #content:has(.ytd-display-ad-renderer)",
      ".video-ads.ytp-ad-module",
      "tp-yt-paper-dialog:has(yt-mealbar-promo-renderer)",
      "ytd-engagement-panel-section-list-renderer[target-id=\"engagement-panel-ads\"]",
      "#related #player-ads",
      "#related ytd-ad-slot-renderer",
      "ytd-ad-slot-renderer",
      "yt-mealbar-promo-renderer",
      "ytd-popup-container:has(a[href=\"/premium\"])",
      "ad-slot-renderer",
      "ytm-companion-ad-renderer"
    ];
    const formattedRules = cssMarkSelectorArr.map(
      (selector) => `${selector} *{text-decoration:line-through!important;text-decoration-thickness:2px!important;}`
    );
    const cssText = formattedRules.join(" ");
    StyleEngine.inject("mark-or-remove-ad", cssText);
  },

  run(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    commonUtil.onPageLoad(() => {
      this.markADHTMLElement();
    });
  },

  destroy(): void {
    StyleEngine.remove("mark-or-remove-ad");
  }
};
