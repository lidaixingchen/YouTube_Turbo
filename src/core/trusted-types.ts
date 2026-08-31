export interface TrustedTypePolicy {
  createHTML: (s: string) => any;
  createScript: (s: string) => any;
  createScriptURL: (s: string) => any;
}

const passThroughFunc = (string: string): string => string;

let TTP: TrustedTypePolicy = {
  createHTML: passThroughFunc,
  createScript: passThroughFunc,
  createScriptURL: passThroughFunc
};

let needsTrustedHTML = false;

(() => {
  try {
    const w = typeof unsafeWindow !== "undefined" ? (unsafeWindow as unknown as Window) : window;
    if (w && w.trustedTypes && typeof w.trustedTypes.createPolicy === "function") {
      needsTrustedHTML = true;
      if (w.trustedTypes.defaultPolicy === null) {
        try {
          TTP = w.trustedTypes.createPolicy("default", {
            createHTML: passThroughFunc,
            createScript: passThroughFunc,
            createScriptURL: passThroughFunc
          });
        } catch {
          // ignore if already created
        }
      } else if (w.trustedTypes.defaultPolicy) {
        TTP = w.trustedTypes.defaultPolicy;
      }
    }
  } catch {
    // Trusted Types policy already exists or blocked
  } finally {
    if (typeof window !== "undefined") {
      (window as any).TTP = TTP;
    }
  }
})();

export function createHTML(html: string): any {
  return TTP.createHTML(html);
}

export function createScript(script: string): any {
  return TTP.createScript(script);
}

export function createScriptURL(url: string): any {
  return TTP.createScriptURL(url);
}

export { TTP, needsTrustedHTML };
