import { StyleEngine } from "../../core/style-engine";

export const MarkOrRemoveAd = {
  markADHTMLElement(): void {
    const cssMarkSelectorArr = [
      "#masthead-ad",
      ".video-ads.ytp-ad-module",
      "ytd-ad-slot-renderer",
      "ad-slot-renderer",
      "yt-mealbar-promo-renderer",
      "ytm-companion-ad-renderer",
      "#related #player-ads",
      "#related ytd-ad-slot-renderer",
      "ytd-engagement-panel-section-list-renderer[target-id=\"engagement-panel-ads\"]",
      "ytd-rich-item-renderer.style-scope.ytd-rich-grid-row #content:has(.ytd-display-ad-renderer)",
      "tp-yt-paper-dialog:has(yt-mealbar-promo-renderer)",
      "ytd-popup-container:has(a[href=\"/premium\"])"
    ];

    const formattedRules = cssMarkSelectorArr.map(
      (selector) => `
        ${selector} { opacity: 0.4 !important; }
        ${selector} * { text-decoration: line-through !important; text-decoration-thickness: 2px !important; }
      `
    );
    const cssText = formattedRules.join("\n");
    StyleEngine.inject("mark-or-remove-ad", cssText);
  },

  run(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    this.markADHTMLElement();
  },

  destroy(): void {
    StyleEngine.remove("mark-or-remove-ad");
  }
};
