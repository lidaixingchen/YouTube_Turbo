import { describe, expect, it } from "vitest";
import { Locale } from "../index";

const REGISTERED_TRANSLATION_KEY: string = "locale_registration_probe";

describe("Locale.registerTranslations", () => {
  it("updates active lookups and snapshots without changing the active locale for other registrations", () => {
    const activeLocale: string = Locale.getLocale();
    const otherLocale: string = activeLocale === "fr" ? "en" : "fr";
    const previousDirection: "ltr" | "rtl" = Locale.getDirection();
    const nextDirection: "ltr" | "rtl" = previousDirection === "ltr" ? "rtl" : "ltr";
    const registeredMessage: string = "active language translation";

    try {
      Locale.registerTranslations(activeLocale, {
        direction: nextDirection,
        messages: { [REGISTERED_TRANSLATION_KEY]: registeredMessage }
      });

      expect(Locale.t(REGISTERED_TRANSLATION_KEY)).toBe(registeredMessage);
      expect(Locale.getDirection()).toBe(nextDirection);
      expect(Locale.exportActiveSnapshot()).toMatchObject({
        locale: activeLocale,
        direction: nextDirection,
        messages: { [REGISTERED_TRANSLATION_KEY]: registeredMessage }
      });

      Locale.registerTranslations(otherLocale, {
        messages: { [REGISTERED_TRANSLATION_KEY]: "other language translation" }
      });

      expect(Locale.getLocale()).toBe(activeLocale);
      expect(Locale.getDirection()).toBe(nextDirection);
      expect(Locale.t(REGISTERED_TRANSLATION_KEY)).toBe(registeredMessage);
      expect(Locale.exportActiveSnapshot().messages[REGISTERED_TRANSLATION_KEY]).toBe(registeredMessage);
    } finally {
      Locale.registerTranslations(activeLocale, {
        direction: previousDirection,
        messages: { [REGISTERED_TRANSLATION_KEY]: REGISTERED_TRANSLATION_KEY }
      });
    }
  });
});
