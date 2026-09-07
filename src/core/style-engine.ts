export const StyleEngine = (() => {
  const injectedStyles = new Map<string, HTMLStyleElement>();
  const injectedContents = new Map<string, string>();

  return {
    inject: (id: string, cssText: string): HTMLStyleElement => {
      let styleEl = injectedStyles.get(id);
      const cachedContent = injectedContents.get(id);

      if (styleEl && styleEl.isConnected && cachedContent === cssText) {
        return styleEl;
      }

      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "yt-style-" + id;
        styleEl.textContent = cssText;
        (document.head || document.documentElement).appendChild(styleEl);
        injectedStyles.set(id, styleEl);
        injectedContents.set(id, cssText);
        return styleEl;
      }

      if (!styleEl.isConnected) {
        (document.head || document.documentElement).appendChild(styleEl);
      }

      if (cachedContent !== cssText) {
        styleEl.textContent = cssText;
        injectedContents.set(id, cssText);
      }

      return styleEl;
    },

    remove: (id: string): void => {
      const styleEl = injectedStyles.get(id);
      if (styleEl) {
        styleEl.remove();
        injectedStyles.delete(id);
      }
      injectedContents.delete(id);
    },

    has: (id: string): boolean => {
      const styleEl = injectedStyles.get(id);
      return Boolean(styleEl && styleEl.isConnected);
    }
  };
})();
