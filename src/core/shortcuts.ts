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
  const registeredKeysSet = new Set<string>();
  let isAttached = false;
  let isEnabled = true;

  const rebuildKeysSet = (): void => {
    registeredKeysSet.clear();
    for (const binding of bindings) {
      const bKey = binding.key.toLowerCase();
      registeredKeysSet.add(bKey);
      if (bKey === ">" || bKey === ".") {
        registeredKeysSet.add(">");
        registeredKeysSet.add(".");
      }
      if (bKey === "<" || bKey === ",") {
        registeredKeysSet.add("<");
        registeredKeysSet.add(",");
      }
    }
  };

  const isTypingContext = (event: KeyboardEvent): boolean => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        target.isContentEditable ||
        target.getAttribute("role") === "textbox" ||
        target.hasAttribute("contenteditable")
      ) {
        return true;
      }
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (!(node instanceof HTMLElement)) continue;
      const tagName = node.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        node.isContentEditable ||
        node.getAttribute("role") === "textbox" ||
        tagName.startsWith("tp-yt-paper-") ||
        tagName === "ytd-searchbox" ||
        tagName === "ytd-commentbox" ||
        tagName.startsWith("yt-live-chat-") ||
        node.hasAttribute("contenteditable")
      ) {
        return true;
      }
    }
    return false;
  };

  const isKeyMatched = (bindingKey: string, eventKey: string, hasShift: boolean): boolean => {
    const bKey = bindingKey.toLowerCase();
    const eKey = eventKey.toLowerCase();
    if (bKey === eKey) return true;
    if (hasShift) {
      if ((bKey === ">" || bKey === ".") && (eKey === ">" || eKey === ".")) return true;
      if ((bKey === "<" || bKey === ",") && (eKey === "<" || eKey === ",")) return true;
    }
    return false;
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (!isEnabled) {
      return;
    }

    const lowerKey = event.key.toLowerCase();
    if (!registeredKeysSet.has(lowerKey) && !registeredKeysSet.has(event.key)) {
      return;
    }

    if (isTypingContext(event)) {
      return;
    }

    for (const binding of bindings) {
      const matchShift = Boolean(binding.shiftKey) === Boolean(event.shiftKey);
      const matchKey = isKeyMatched(binding.key, event.key, Boolean(event.shiftKey));
      const matchCtrl = Boolean(binding.ctrlKey) === Boolean(event.ctrlKey);
      const matchAlt = Boolean(binding.altKey) === Boolean(event.altKey);
      const matchMeta = Boolean(binding.metaKey) === Boolean(event.metaKey);

      if (matchKey && matchShift && matchCtrl && matchAlt && matchMeta) {
        event.preventDefault();
        try {
          binding.handler(event);
        } catch (e: unknown) {
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
    rebuildKeysSet();
    ensureAttached();
    return () => {
      bindings.delete(binding);
      rebuildKeysSet();
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
    registeredKeysSet.clear();
  };

  return {
    register,
    setEnabled,
    destroy
  };
})();
