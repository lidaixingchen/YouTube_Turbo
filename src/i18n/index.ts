import { DICTIONARIES, type LocaleDictionary } from "./locales";

export interface ActiveLocaleSnapshot {
  locale: string;
  direction: "ltr" | "rtl";
  messages: Record<string, string>;
}

export const Locale = (() => {
  const detectRawLocale = (): string => {
    const htmlLang = (document.documentElement && document.documentElement.lang) || "";
    if (htmlLang) return htmlLang;
    if (typeof window !== "undefined" && (window as any).ytcfg && typeof (window as any).ytcfg.get === "function") {
      const hl = (window as any).ytcfg.get("HL");
      if (hl) return hl;
    }
    return navigator.language || (navigator as any).userLanguage || "en";
  };

  const resolveLocale = (rawLang?: string): string => {
    if (!rawLang) return "en";
    const normalized = rawLang.trim();
    if (DICTIONARIES[normalized]) return normalized;

    if (/^zh-(HK|MO|TW|Hant)/i.test(normalized)) return "zh-TW";
    if (/^zh-(CN|SG|Hans)/i.test(normalized)) return "zh-CN";

    const subtag = normalized.split("-")[0].toLowerCase();
    if (DICTIONARIES[subtag]) return subtag;
    if (subtag === "zh") return "zh-CN";
    if (subtag === "ja" || subtag === "jp") return "ja";
    if (subtag === "ko" || subtag === "kr") return "ko";
    if (subtag === "de" || subtag === "du") return "de";

    return "en";
  };

  const activeLocaleCode = resolveLocale(detectRawLocale());
  const activeDict = DICTIONARIES[activeLocaleCode] || DICTIONARIES["en"] || { messages: {} };

  return {
    getLocale(): string {
      return activeLocaleCode;
    },
    getDirection(): "ltr" | "rtl" {
      return (activeDict.direction as "ltr" | "rtl") || "ltr";
    },
    t(key: string, params?: Record<string, string | number>): string {
      let msg =
        (activeDict.messages && activeDict.messages[key]) ||
        (DICTIONARIES["en"]?.messages && DICTIONARIES["en"].messages[key]) ||
        key;
      if (params && typeof params === "object") {
        Object.keys(params).forEach((paramKey) => {
          const val = String(params[paramKey])
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          msg = msg.replace(new RegExp(`\\{${paramKey}\\}`, "g"), val);
        });
      }
      return msg;
    },
    registerTranslations(locale: string, dict: LocaleDictionary): void {
      if (!DICTIONARIES[locale]) {
        DICTIONARIES[locale] = dict;
      } else {
        DICTIONARIES[locale] = {
          direction: dict.direction || DICTIONARIES[locale].direction,
          messages: { ...DICTIONARIES[locale].messages, ...dict.messages }
        };
      }
    },
    exportActiveSnapshot(): ActiveLocaleSnapshot {
      return {
        locale: activeLocaleCode,
        direction: (activeDict.direction as "ltr" | "rtl") || "ltr",
        messages: { ...(DICTIONARIES["en"]?.messages || {}), ...(activeDict.messages || {}) }
      };
    },
    getShortsLangCode(): string {
      const langCode = activeLocaleCode.split("-")[0];
      if (activeLocaleCode === "zh-CN" || activeLocaleCode === "zh-TW") {
        return activeLocaleCode;
      }
      return langCode || "en";
    }
  };
})();

export const LangueUtil = {
  getLang(): string {
    return Locale.getShortsLangCode();
  },
  getLanguage(): { lang: string; direction: "ltr" | "rtl"; content: Record<string, string> } {
    const snap = Locale.exportActiveSnapshot();
    return {
      lang: snap.locale,
      direction: snap.direction,
      content: snap.messages
    };
  }
};
