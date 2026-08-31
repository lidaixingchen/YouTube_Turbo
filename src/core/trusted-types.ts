import { TTP_POLICY_NAME } from "./constants";

export interface TrustedTypePolicy {
  createHTML: (s: string) => string;
  createScript: (s: string) => string;
  createScriptURL: (s: string) => string;
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
    if (typeof window.isSecureContext !== "undefined" && window.isSecureContext) {
      if (window.trustedTypes && typeof window.trustedTypes.createPolicy === "function") {
        needsTrustedHTML = true;
        if (window.trustedTypes.defaultPolicy) {
          TTP = window.trustedTypes.createPolicy(TTP_POLICY_NAME, TTP);
        } else {
          TTP = window.trustedTypes.createPolicy("default", TTP);
        }
      }
    }
  } catch {
    // Trusted Types policy already exists or blocked
  } finally {
    window.TTP = TTP;
  }
})();

export { TTP, needsTrustedHTML };
