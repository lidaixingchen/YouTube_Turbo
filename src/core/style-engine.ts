export const StyleEngine = (() => {
  const injectedStyles = new Map<string, HTMLStyleElement>();

  return {
    inject: (id: string, cssText: string): HTMLStyleElement => {
      let styleEl = injectedStyles.get(id);
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "yt-style-" + id;
        styleEl.textContent = cssText;
        (document.head || document.documentElement).appendChild(styleEl);
        injectedStyles.set(id, styleEl);
      } else {
        styleEl.textContent = cssText;
      }
      return styleEl;
    },

    remove: (id: string): void => {
      const styleEl = injectedStyles.get(id);
      if (styleEl) {
        styleEl.remove();
        injectedStyles.delete(id);
      }
    },

    has: (id: string): boolean => {
      return injectedStyles.has(id);
    }
  };
})();
