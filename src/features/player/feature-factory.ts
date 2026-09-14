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

  function teardownResources(): void {
    const errors: unknown[] = [];

    if (typeof def.onDisable === "function") {
      try {
        def.onDisable();
      } catch (err: unknown) {
        errors.push(err);
      }
    }

    if (toolbarCleanup) {
      try {
        toolbarCleanup();
        toolbarCleanup = null;
      } catch (err: unknown) {
        errors.push(err);
      }
    }

    if (shortcutCleanup) {
      try {
        shortcutCleanup();
        shortcutCleanup = null;
      } catch (err: unknown) {
        errors.push(err);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, `[${def.name}] Teardown failed`);
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
        try {
          teardownResources();
        } catch (teardownErr: unknown) {
          throw new AggregateError([error, teardownErr], `[${def.name}] Setup failed and cleanup also failed`);
        }
        throw error;
      }
    },

    disable(): void {
      if (!isEnabled && !shortcutCleanup && !toolbarCleanup) {
        return;
      }

      try {
        teardownResources();
        isEnabled = false;
      } catch (err: unknown) {
        isEnabled = false;
        throw err;
      }
    },

    isActive(): boolean {
      return isEnabled;
    }
  });
}
