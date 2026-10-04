import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOLBAR_CONSTANTS } from "../constants";
import { PopoverEngine } from "../popover";
import type { PopoverController } from "../types";

interface PopoverFixture {
  readonly player: HTMLDivElement;
  readonly trigger: HTMLButtonElement;
  readonly menu: HTMLDivElement;
  readonly items: readonly HTMLButtonElement[];
  readonly outside: HTMLButtonElement;
  readonly controller: PopoverController;
}

function createMenuItem(label: string, disabled: boolean = false): HTMLButtonElement {
  const item: HTMLButtonElement = document.createElement("button");
  item.type = "button";
  item.setAttribute("role", "menuitem");
  item.tabIndex = TOOLBAR_CONSTANTS.POPOVER_MENU_ITEM_TAB_INDEX;
  item.textContent = label;
  item.disabled = disabled;
  return item;
}

function createPopoverFixture(): PopoverFixture {
  const player: HTMLDivElement = document.createElement("div");
  const trigger: HTMLButtonElement = document.createElement("button");
  trigger.type = "button";
  trigger.id = "popover-trigger";

  const menu: HTMLDivElement = document.createElement("div");
  menu.id = "popover-menu";

  const items: readonly HTMLButtonElement[] = [
    createMenuItem("First"),
    createMenuItem("Disabled", true),
    createMenuItem("Second"),
    createMenuItem("Last")
  ];

  items.forEach((item: HTMLButtonElement): void => {
    menu.appendChild(item);
  });
  player.append(trigger, menu);

  const outside: HTMLButtonElement = document.createElement("button");
  outside.type = "button";
  document.body.append(player, outside);

  const controller: PopoverController = PopoverEngine.bind(trigger, menu, player);
  return { player, trigger, menu, items, outside, controller };
}

function dispatchKey(target: HTMLElement, key: string): KeyboardEvent {
  const event: KeyboardEvent = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(event);
  return event;
}

describe("Popover keyboard interaction", (): void => {
  let fixture: PopoverFixture | null = null;

  afterEach((): void => {
    fixture?.controller.destroy();
    fixture?.player.remove();
    fixture?.outside.remove();
    fixture = null;
    vi.useRealTimers();
  });

  it("enters the menu on activation and navigates enabled native buttons", (): void => {
    fixture = createPopoverFixture();
    const { trigger, menu, items, controller } = fixture;

    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.getAttribute("aria-labelledby")).toBe(trigger.id);

    const triggerArrowEvent: KeyboardEvent = dispatchKey(trigger, TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_DOWN);
    expect(triggerArrowEvent.defaultPrevented).toBe(true);
    expect(controller.getState()).toBe("pinned");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items[0]);

    let bodyKeydownCount: number = 0;
    const bodyKeydownListener: (event: KeyboardEvent) => void = (_event: KeyboardEvent): void => {
      bodyKeydownCount += 1;
    };
    document.body.addEventListener("keydown", bodyKeydownListener);

    const downEvent: KeyboardEvent = dispatchKey(items[0], TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_DOWN);
    expect(downEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[2]);
    expect(bodyKeydownCount).toBe(0);

    dispatchKey(items[2], TOOLBAR_CONSTANTS.POPOVER_KEY_END);
    expect(document.activeElement).toBe(items[3]);
    dispatchKey(items[3], TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_DOWN);
    expect(document.activeElement).toBe(items[0]);
    dispatchKey(items[0], TOOLBAR_CONSTANTS.POPOVER_KEY_HOME);
    expect(document.activeElement).toBe(items[0]);

    dispatchKey(items[0], TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_UP);
    expect(document.activeElement).toBe(items[3]);
    dispatchKey(items[3], TOOLBAR_CONSTANTS.POPOVER_KEY_ARROW_UP);
    expect(document.activeElement).toBe(items[2]);

    document.body.removeEventListener("keydown", bodyKeydownListener);
  });

  it("leaves Enter and Space activation to native buttons and returns focus on Escape", (): void => {
    fixture = createPopoverFixture();
    const { trigger, items, controller } = fixture;
    let activationCount: number = 0;
    const onItemClick: (event: MouseEvent) => void = (_event: MouseEvent): void => {
      activationCount += 1;
    };
    items[0].addEventListener("click", onItemClick);

    const triggerEnterEvent: KeyboardEvent = dispatchKey(trigger, "Enter");
    const triggerSpaceEvent: KeyboardEvent = dispatchKey(trigger, " ");
    expect(triggerEnterEvent.defaultPrevented).toBe(false);
    expect(triggerSpaceEvent.defaultPrevented).toBe(false);
    expect(controller.getState()).toBe("closed");

    trigger.click();
    const enterEvent: KeyboardEvent = dispatchKey(items[0], "Enter");
    const spaceEvent: KeyboardEvent = dispatchKey(items[0], " ");

    expect(items[0]).toBeInstanceOf(HTMLButtonElement);
    expect(items[0].type).toBe("button");
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(spaceEvent.defaultPrevented).toBe(false);
    expect(activationCount).toBe(0);

    items[0].click();
    expect(activationCount).toBe(1);

    const escapeEvent: KeyboardEvent = dispatchKey(items[0], TOOLBAR_CONSTANTS.POPOVER_KEY_ESCAPE);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(controller.getState()).toBe("closed");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(fixture.menu.style.display).toBe("none");
    expect(document.activeElement).toBe(trigger);
    items[0].removeEventListener("click", onItemClick);
  });

  it("closes after focus tabs outside without stealing the destination focus", (): void => {
    fixture = createPopoverFixture();
    const { trigger, items, outside, controller } = fixture;

    trigger.click();
    const tabEvent: KeyboardEvent = dispatchKey(items[0], TOOLBAR_CONSTANTS.POPOVER_KEY_TAB);
    expect(tabEvent.defaultPrevented).toBe(false);

    outside.focus();

    expect(controller.getState()).toBe("closed");
    expect(document.activeElement).toBe(outside);
    expect(fixture.menu.style.display).toBe("none");
  });

  it("keeps touch click pinning and outside pointer dismissal", (): void => {
    fixture = createPopoverFixture();
    const { trigger, menu, outside, controller } = fixture;

    const touchPointerDown: Event = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(touchPointerDown, "pointerType", { value: "touch" });
    trigger.dispatchEvent(touchPointerDown);
    trigger.click();
    trigger.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));

    expect(controller.getState()).toBe("pinned");
    expect(menu.style.display).toBe("flex");

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(controller.getState()).toBe("closed");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).not.toBe(menu.querySelector("button"));

    trigger.click();
    expect(controller.getState()).toBe("pinned");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes hover state and destroys pending timers and focus listeners", (): void => {
    vi.useFakeTimers();
    fixture = createPopoverFixture();
    const { trigger, menu, items, controller } = fixture;
    const baselineTimerCount: number = vi.getTimerCount();

    trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.POPOVER_HOVER_SHOW_DELAY_MS);
    expect(controller.getState()).toBe("hover");
    expect(menu.style.display).toBe("flex");

    trigger.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    const pendingTimerCount: number = vi.getTimerCount();
    expect(pendingTimerCount).toBe(baselineTimerCount + 1);

    controller.destroy();

    expect(vi.getTimerCount()).toBe(baselineTimerCount);
    expect(controller.getState()).toBe("closed");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(menu.style.display).toBe("none");

    trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.POPOVER_HOVER_SHOW_DELAY_MS);
    expect(controller.getState()).toBe("closed");
    expect(vi.getTimerCount()).toBe(baselineTimerCount);

    trigger.remove();
    menu.remove();
    expect(document.activeElement).not.toBe(items[0]);
  });

  it("restores focus before destroying a focused menu", (): void => {
    fixture = createPopoverFixture();
    const { trigger, menu, items, controller } = fixture;

    trigger.click();
    expect(document.activeElement).toBe(items[0]);

    controller.destroy();

    expect(controller.getState()).toBe("closed");
    expect(menu.style.display).toBe("none");
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
    menu.remove();
    expect(document.activeElement).not.toBe(items[0]);
  });

  it("clears a pending hover show timer when destroyed", (): void => {
    vi.useFakeTimers();
    fixture = createPopoverFixture();
    const { trigger, menu, controller } = fixture;

    trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const pendingTimerCount: number = vi.getTimerCount();
    expect(pendingTimerCount).toBeGreaterThan(0);

    controller.destroy();
    expect(vi.getTimerCount()).toBeLessThan(pendingTimerCount);

    vi.advanceTimersByTime(TOOLBAR_CONSTANTS.POPOVER_HOVER_SHOW_DELAY_MS);
    expect(controller.getState()).toBe("closed");
    expect(menu.style.display).toBe("none");
  });
});
