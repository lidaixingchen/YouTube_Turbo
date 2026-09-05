import { ShortcutDispatcher, type ShortcutBinding } from "../../core/shortcuts";
import { Toolbar, type ActionConfig } from "../../ui/toolbar";

export interface ActionFeatureDefinition {
  readonly name: string;
  readonly shortcut: ShortcutBinding;
  readonly action: ActionConfig;
  readonly onDisable?: () => void;
}

export interface FeatureFacade {
  readonly enable: () => void;
  readonly disable: () => void;
  readonly isActive: () => boolean;
}

export function createToolbarActionFeature(def: ActionFeatureDefinition): FeatureFacade {
  let isEnabled: boolean = false;
  let shortcutCleanup: (() => void) | null = null;
  let toolbarCleanup: (() => void) | null = null;

  function teardownSafely(): void {
    if (typeof def.onDisable === "function") {
      try {
        def.onDisable();
      } catch (err: unknown) {
        console.error(`[${def.name}] onDisable hook error:`, err);
      }
    }

    if (toolbarCleanup) {
      try {
        toolbarCleanup();
      } catch (err: unknown) {
        console.error(`[${def.name}] Toolbar cleanup error:`, err);
      }
      toolbarCleanup = null;
    }

    if (shortcutCleanup) {
      try {
        shortcutCleanup();
      } catch (err: unknown) {
        console.error(`[${def.name}] Shortcut cleanup error:`, err);
      }
      shortcutCleanup = null;
    }
  }

  return Object.freeze({
    enable(): void {
      if (isEnabled) {
        return;
      }

      try {
        shortcutCleanup = ShortcutDispatcher.register(def.shortcut);
        toolbarCleanup = Toolbar.registerActions([def.action]);
        isEnabled = true;
      } catch (error: unknown) {
        isEnabled = false;
        teardownSafely();
        throw error;
      }
    },

    disable(): void {
      if (!isEnabled) {
        return;
      }

      isEnabled = false;
      teardownSafely();
    },

    isActive(): boolean {
      return isEnabled;
    }
  });
}
