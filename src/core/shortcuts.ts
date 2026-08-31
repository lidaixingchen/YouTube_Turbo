export interface ShortcutBinding {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  description?: string;
  handler: (event: KeyboardEvent) => void;
}

export const ShortcutDispatcher = (() => {
  const bindings = new Set<ShortcutBinding>();
  let isAttached = false;
  let isEnabled = true;

  const isTypingContext = (event: KeyboardEvent): boolean => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.length > 0) {
      return path.some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const tagName = node.tagName.toLowerCase();
        return (
          tagName === "input" ||
          tagName === "textarea" ||
          node.isContentEditable ||
          node.getAttribute("role") === "textbox" ||
          tagName.startsWith("tp-yt-paper-") ||
          tagName === "ytd-searchbox"
        );
      });
    }
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tagName = target.tagName.toLowerCase();
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        target.isContentEditable ||
        target.getAttribute("role") === "textbox"
      );
    }
    return false;
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (!isEnabled || isTypingContext(event)) {
      return;
    }

    for (const binding of bindings) {
      const matchKey = binding.key.toLowerCase() === event.key.toLowerCase();
      const matchShift = Boolean(binding.shiftKey) === Boolean(event.shiftKey);
      const matchCtrl = Boolean(binding.ctrlKey) === Boolean(event.ctrlKey);
      const matchAlt = Boolean(binding.altKey) === Boolean(event.altKey);
      const matchMeta = Boolean(binding.metaKey) === Boolean(event.metaKey);

      if (matchKey && matchShift && matchCtrl && matchAlt && matchMeta) {
        event.preventDefault();
        try {
          binding.handler(event);
        } catch (e) {
          console.error("[ShortcutDispatcher] handler error:", e);
        }
        break;
      }
    }
  };

  const ensureAttached = (): void => {
    if (!isAttached) {
      window.addEventListener("keydown", handleKeydown, true);
      isAttached = true;
    }
  };

  const register = (binding: ShortcutBinding): (() => void) => {
    bindings.add(binding);
    ensureAttached();
    return () => {
      bindings.delete(binding);
    };
  };

  const setEnabled = (enabled: boolean): void => {
    isEnabled = enabled;
  };

  const destroy = (): void => {
    if (isAttached) {
      window.removeEventListener("keydown", handleKeydown, true);
      isAttached = false;
    }
    bindings.clear();
  };

  return {
    register,
    setEnabled,
    destroy
  };
})();
