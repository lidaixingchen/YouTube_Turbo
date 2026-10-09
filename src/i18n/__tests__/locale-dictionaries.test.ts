import { describe, expect, it, vi } from "vitest";
import { userscriptMetadata } from "../../../build/metadata";
import { DICTIONARIES, type LocaleDictionary } from "../locales";
import type { ActiveLocaleSnapshot } from "../index";

const ENGLISH_DICTIONARY: LocaleDictionary = DICTIONARIES.en;
const ENGLISH_KEYS: string[] = Object.keys(ENGLISH_DICTIONARY.messages);
const DICTIONARY_ENTRIES: [string, LocaleDictionary][] = Object.entries(DICTIONARIES) as [string, LocaleDictionary][];
const DECLARED_LANGUAGE_TAGS: string[] = Object.keys(
  userscriptMetadata.name as Record<string, string>
).filter((language: string): boolean => language.length > 0);
const TABVIEW_ACCESSIBILITY_KEYS: string[] = [
  "tab_comments",
  "tab_font_size_increase",
  "tab_font_size_decrease"
];
const LOCALIZED_INTERFACE_KEYS: string[] = [
  "function_setting_title",
  "status_enabled",
  "status_disabled",
  "status_starting",
  "status_loading_settings",
  "action_retry",
  "notice_session_only",
  ...TABVIEW_ACCESSIBILITY_KEYS
];
const LANGUAGE_ALIASES: Record<string, string> = {
  "es-419": "es",
  "fr-CA": "fr",
  "pt-BR": "pt"
};

const loadLocaleForLanguage: (language: string) => Promise<typeof import("../index")> = async (
  language: string
): Promise<typeof import("../index")> => {
  document.documentElement.lang = language;
  await vi.resetModules();
  return await import("../index");
};

describe("locale dictionaries", () => {
  it("contains every base message in every runtime dictionary", () => {
    for (const [language, dictionary] of DICTIONARY_ENTRIES) {
      const missingKeys: string[] = ENGLISH_KEYS.filter(
        (key: string): boolean => typeof dictionary.messages[key] !== "string" || dictionary.messages[key].trim().length === 0
      );

      expect(missingKeys, `${language} is missing message translations`).toEqual([]);
    }
  });

  it("resolves every named metadata language to its translated runtime dictionary", async () => {
    for (const language of DECLARED_LANGUAGE_TAGS) {
      const expectedLocale: string = LANGUAGE_ALIASES[language] ?? language;
      const localeModule: typeof import("../index") = await loadLocaleForLanguage(language);

      expect(localeModule.Locale.getLocale(), `${language} locale resolution`).toBe(expectedLocale);
      expect(DICTIONARIES[expectedLocale], `${language} runtime dictionary`).toBeDefined();
      const activeSnapshot: ActiveLocaleSnapshot = localeModule.Locale.exportActiveSnapshot();
      for (const key of TABVIEW_ACCESSIBILITY_KEYS) {
        expect(activeSnapshot.messages[key], `${language} snapshot.${key}`).toBe(
          DICTIONARIES[expectedLocale].messages[key]
        );
      }

      if (language !== "en") {
        expect(localeModule.Locale.getLocale()).not.toBe("en");
        for (const key of LOCALIZED_INTERFACE_KEYS) {
          const translatedMessage: string = DICTIONARIES[expectedLocale].messages[key];
          expect(translatedMessage, `${expectedLocale}.${key}`).not.toBe(ENGLISH_DICTIONARY.messages[key]);
          expect(localeModule.Locale.t(key), `${language}.${key}`).toBe(translatedMessage);
        }
      }
    }
  });

  it("sets RTL direction and localized settings status messages for Arabic, Hebrew, and Uyghur", async () => {
    const rtlLanguages: string[] = ["ar", "he", "ug"];
    const rtlMessageKeys: string[] = ["function_setting_title", "status_enabled", "status_loading_settings", "action_retry"];

    for (const language of rtlLanguages) {
      const localeModule: typeof import("../index") = await loadLocaleForLanguage(language);
      const dictionary: LocaleDictionary = DICTIONARIES[language];

      expect(dictionary.direction).toBe("rtl");
      expect(localeModule.Locale.getDirection()).toBe("rtl");
      for (const key of rtlMessageKeys) {
        expect(dictionary.messages[key], `${language}.${key}`).not.toBe(ENGLISH_DICTIONARY.messages[key]);
        expect(localeModule.Locale.t(key)).toBe(dictionary.messages[key]);
      }
    }
  });
});
