import { ThemeCookieAdapter } from "./theme-cookie";

export interface ThemeOptions {
  reload?: boolean;
}

export const ThemeEngine = {
  getTheme: (): "dark" | "light" => {
    return ThemeCookieAdapter.isDarkThemeActive() ? "dark" : "light";
  },

  setTheme: (mode: "dark" | "light", options: ThemeOptions = { reload: true }): void => {
    const isDark = mode === "dark";
    ThemeCookieAdapter.updateThemeFlag(isDark);
    if (options && options.reload !== false) {
      location.reload();
    }
  },

  toggleTheme: (options: ThemeOptions = { reload: true }): "dark" | "light" => {
    const current = ThemeEngine.getTheme();
    const next = current === "dark" ? "light" : "dark";
    ThemeEngine.setTheme(next, options);
    return next;
  }
};

export const Theme = {
  setTheme(theme: string = "light", isReload: boolean = true): void {
    ThemeEngine.setTheme(theme === "dark" ? "dark" : "light", { reload: isReload });
  },

  setDark(isReload: boolean = true): void {
    ThemeEngine.setTheme("dark", { reload: isReload });
  },

  setLight(isReload: boolean = true): void {
    ThemeEngine.setTheme("light", { reload: isReload });
  },

  reloadYouTube(): void {
    location.reload();
  },

  isDarkTheme(enabled: boolean, isReload: boolean = true): void {
    ThemeEngine.setTheme(enabled ? "dark" : "light", { reload: isReload });
  }
};
