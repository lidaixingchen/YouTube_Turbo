export const THEME_CONSTANTS = {
  PREF_COOKIE_NAME: "PREF",
  COOKIE_DOMAIN: ".youtube.com",
  COOKIE_PATH: "/",
  FLAG_DARK_THEME: "f6=400",
  FLAG_LIGHT_THEME: "f6=80000",
  FLAG_MATCHER: /&?f6=\d+/g
} as const;

export const ThemeCookieAdapter = {
  readPrefCookie: (): string => {
    const cookies = document.cookie.split("; ");
    const prefCookie = cookies.find((cookie) => cookie.startsWith(`${THEME_CONSTANTS.PREF_COOKIE_NAME}=`));
    return prefCookie ? prefCookie.substring(THEME_CONSTANTS.PREF_COOKIE_NAME.length + 1) : "";
  },

  writePrefCookie: (prefValue: string): void => {
    document.cookie = `${THEME_CONSTANTS.PREF_COOKIE_NAME}=${prefValue}; path=${THEME_CONSTANTS.COOKIE_PATH}; domain=${THEME_CONSTANTS.COOKIE_DOMAIN}; secure`;
  },

  updateThemeFlag: (isDark: boolean): string => {
    const currentPref = ThemeCookieAdapter.readPrefCookie();
    const cleanedPref = currentPref.replace(THEME_CONSTANTS.FLAG_MATCHER, "").replace(/^&+/, "").replace(/&+$/, "");
    const targetFlag = isDark ? THEME_CONSTANTS.FLAG_DARK_THEME : THEME_CONSTANTS.FLAG_LIGHT_THEME;
    const newPref = cleanedPref ? `${cleanedPref}&${targetFlag}` : targetFlag;
    ThemeCookieAdapter.writePrefCookie(newPref);
    return newPref;
  },

  isDarkThemeActive: (): boolean => {
    const pref = ThemeCookieAdapter.readPrefCookie();
    return pref.includes(THEME_CONSTANTS.FLAG_DARK_THEME);
  }
};
