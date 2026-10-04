import { afterEach, describe, expect, it } from "vitest";
import { ShortcutDispatcher } from "../shortcuts";
import { PopoverEngine } from "../../ui/toolbar/popover";
import type { PopoverController } from "../../ui/toolbar/types";

function dispatchKey(target: HTMLElement, key: string): KeyboardEvent {
  const event: KeyboardEvent = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(event);
  return event;
}

describe("ShortcutDispatcher menu interaction", (): void => {
  let host: HTMLDivElement | null = null;
  let popover: PopoverController | null = null;
  let unregisterShortcut: (() => void) | null = null;

  afterEach((): void => {
    popover?.destroy();
    popover = null;
    unregisterShortcut?.();
    unregisterShortcut = null;
    ShortcutDispatcher.destroy();
    host?.remove();
    host = null;
  });

  it("skips menu shortcuts before local key handling and dispatches on an ordinary button", (): void => {
    host = document.createElement("div");
    const trigger: HTMLButtonElement = document.createElement("button");
    trigger.type = "button";
    const menu: HTMLDivElement = document.createElement("div");
    const menuItem: HTMLButtonElement = document.createElement("button");
    menuItem.type = "button";
    menuItem.setAttribute("role", "menuitem");
    menu.appendChild(menuItem);
    host.append(trigger, menu);
    document.body.appendChild(host);

    let shortcutCalls: number = 0;
    unregisterShortcut = ShortcutDispatcher.register({
      key: "k",
      handler: (_event: KeyboardEvent): void => {
        shortcutCalls += 1;
      }
    });
    popover = PopoverEngine.bind(trigger, menu, host);

    const triggerEvent: KeyboardEvent = dispatchKey(trigger, "k");
    expect(triggerEvent.defaultPrevented).toBe(false);
    expect(shortcutCalls).toBe(0);

    trigger.click();
    expect(document.activeElement).toBe(menuItem);
    const menuEvent: KeyboardEvent = dispatchKey(menuItem, "k");
    expect(menuEvent.defaultPrevented).toBe(false);
    expect(shortcutCalls).toBe(0);

    const ordinaryButton: HTMLButtonElement = document.createElement("button");
    ordinaryButton.type = "button";
    document.body.appendChild(ordinaryButton);
    const ordinaryButtonEvent: KeyboardEvent = dispatchKey(ordinaryButton, "k");
    expect(ordinaryButtonEvent.defaultPrevented).toBe(true);
    expect(shortcutCalls).toBe(1);
    ordinaryButton.remove();
  });
});
