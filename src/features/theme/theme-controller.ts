import { THEME_CONSTANTS } from "./constants";
import { Toolbar, TOOLBAR_CONSTANTS } from "../../ui/toolbar";
import { StyleEngine } from "../../core/style-engine";
import progressBarCss from "./progress-bar.css?raw";

export type ThemeMode = "dark" | "light";

export interface ThemeOptions {
  reload?: boolean;
}

class PrefCookieCodec {
  public static parse(prefValue: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!prefValue) {
      return map;
    }
    const pairs = prefValue.split("&");
    for (const pair of pairs) {
      if (!pair) continue;
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) {
        map.set(decodeURIComponent(pair), "");
      } else {
        const key = decodeURIComponent(pair.slice(0, separatorIndex));
        const val = decodeURIComponent(pair.slice(separatorIndex + 1));
        map.set(key, val);
      }
    }
    return map;
  }

  public static serialize(map: Map<string, string>): string {
    const parts: string[] = [];
    map.forEach((val, key) => {
      if (!key) return;
      if (val === "") {
        parts.push(encodeURIComponent(key));
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
      }
    });
    return parts.join("&");
  }
}

export class ThemeController {
  private static instance: ThemeController | null = null;
  private unregisterAction: (() => void) | null = null;

  private constructor() {}

  public static getInstance(): ThemeController {
    if (!ThemeController.instance) {
      ThemeController.instance = new ThemeController();
    }
    return ThemeController.instance;
  }

  public init(): void {
    if (this.unregisterAction) {
      return;
    }

    this.unregisterAction = Toolbar.registerAction({
      id: "theme",
      slot: TOOLBAR_CONSTANTS.SLOT_PLAYER_CONTROLS,
      titleKey: "action_switch_theme",
      defaultTitle: "Switch the theme",
      icon: "theme",
      order: 20,
      dismissOnExecute: false,
      onClick: () => {
        this.toggleTheme();
      }
    });
  }

  public destroy(): void {
    if (this.unregisterAction) {
      this.unregisterAction();
      this.unregisterAction = null;
    }
  }

  private readPrefCookie(): string {
    const cookies = document.cookie.split("; ");
    const prefPrefix = `${THEME_CONSTANTS.PREF_COOKIE_NAME}=`;
    const prefCookie = cookies.find((cookie: string) => cookie.startsWith(prefPrefix));
    return prefCookie ? prefCookie.substring(prefPrefix.length) : "";
  }

  private writePrefCookie(prefValue: string): void {
    const cookieAttributes = [
      `${THEME_CONSTANTS.PREF_COOKIE_NAME}=${prefValue}`,
      `path=${THEME_CONSTANTS.COOKIE_PATH}`,
      `domain=${THEME_CONSTANTS.COOKIE_DOMAIN}`,
      `max-age=${THEME_CONSTANTS.COOKIE_MAX_AGE_SECONDS}`,
      "SameSite=Lax",
      "secure"
    ];
    document.cookie = cookieAttributes.join("; ");
  }

  public getTheme(): ThemeMode {
    const rawPref = this.readPrefCookie();
    const prefMap = PrefCookieCodec.parse(rawPref);
    const flag = prefMap.get(THEME_CONSTANTS.FLAG_KEY);
    return flag === THEME_CONSTANTS.FLAG_DARK_VALUE ? "dark" : "light";
  }

  public setTheme(mode: ThemeMode, options: ThemeOptions = { reload: true }): void {
    const rawPref = this.readPrefCookie();
    const prefMap = PrefCookieCodec.parse(rawPref);
    const targetFlag = mode === "dark" ? THEME_CONSTANTS.FLAG_DARK_VALUE : THEME_CONSTANTS.FLAG_LIGHT_VALUE;
    prefMap.set(THEME_CONSTANTS.FLAG_KEY, targetFlag);
    const newPref = PrefCookieCodec.serialize(prefMap);
    this.writePrefCookie(newPref);

    if (options && options.reload !== false) {
      location.reload();
    }
  }

  public toggleTheme(options: ThemeOptions = { reload: true }): ThemeMode {
    const currentMode = this.getTheme();
    const targetMode: ThemeMode = currentMode === "dark" ? "light" : "dark";
    this.setTheme(targetMode, options);
    return targetMode;
  }

  public enableProgressBar(): void {
    if (!/youtube\.com/.test(window.location.host)) {
      return;
    }
    StyleEngine.inject(THEME_CONSTANTS.STYLE_ID_PROGRESS_BAR, progressBarCss);
  }

  public disableProgressBar(): void {
    StyleEngine.remove(THEME_CONSTANTS.STYLE_ID_PROGRESS_BAR);
  }
}
