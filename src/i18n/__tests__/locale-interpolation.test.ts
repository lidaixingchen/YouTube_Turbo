import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Locale } from "../index";

const INTERPOLATION_MESSAGE_KEY: string = "locale_interpolation_probe";
const REPEATED_INTERPOLATION_MESSAGE_KEY: string = "locale_interpolation_repeated_probe";
const INTERPOLATION_TEMPLATE: string = "Before {value} after";
const REPEATED_INTERPOLATION_TEMPLATE: string = "{value} / {value}";
const ACTIVE_LOCALE: string = Locale.getLocale();
const PREVIOUS_MESSAGES: Record<string, string | undefined> = {};

describe("Locale.t interpolation", () => {
  beforeAll((): void => {
    const activeMessages: Record<string, string> = Locale.exportActiveSnapshot().messages;
    PREVIOUS_MESSAGES[INTERPOLATION_MESSAGE_KEY] = activeMessages[INTERPOLATION_MESSAGE_KEY];
    PREVIOUS_MESSAGES[REPEATED_INTERPOLATION_MESSAGE_KEY] = activeMessages[REPEATED_INTERPOLATION_MESSAGE_KEY];

    Locale.registerTranslations(ACTIVE_LOCALE, {
      messages: {
        [INTERPOLATION_MESSAGE_KEY]: INTERPOLATION_TEMPLATE,
        [REPEATED_INTERPOLATION_MESSAGE_KEY]: REPEATED_INTERPOLATION_TEMPLATE
      }
    });
  });

  afterAll((): void => {
    Locale.registerTranslations(ACTIVE_LOCALE, {
      messages: {
        [INTERPOLATION_MESSAGE_KEY]: PREVIOUS_MESSAGES[INTERPOLATION_MESSAGE_KEY] ?? INTERPOLATION_MESSAGE_KEY,
        [REPEATED_INTERPOLATION_MESSAGE_KEY]:
          PREVIOUS_MESSAGES[REPEATED_INTERPOLATION_MESSAGE_KEY] ?? REPEATED_INTERPOLATION_MESSAGE_KEY
      }
    });
  });

  it("inserts dollar replacement sequences as literal parameter text", (): void => {
    expect(Locale.t(INTERPOLATION_MESSAGE_KEY, { value: "$$" })).toBe("Before $$ after");
    expect(Locale.t(INTERPOLATION_MESSAGE_KEY, { value: "$&" })).toBe("Before $&amp; after");
    expect(Locale.t(INTERPOLATION_MESSAGE_KEY, { value: "$`" })).toBe("Before $` after");
    expect(Locale.t(INTERPOLATION_MESSAGE_KEY, { value: "$'" })).toBe("Before $' after");
  });

  it("keeps numeric, ordinary, and escaped HTML parameter values", (): void => {
    expect(Locale.t(INTERPOLATION_MESSAGE_KEY, { value: 42 })).toBe("Before 42 after");
    expect(Locale.t(INTERPOLATION_MESSAGE_KEY, { value: "plain text" })).toBe("Before plain text after");
    expect(Locale.t(INTERPOLATION_MESSAGE_KEY, { value: "<tag>&" })).toBe("Before &lt;tag&gt;&amp; after");
  });

  it("replaces every occurrence of a repeated placeholder", (): void => {
    expect(Locale.t(REPEATED_INTERPOLATION_MESSAGE_KEY, { value: "$$" })).toBe("$$ / $$");
  });
});
