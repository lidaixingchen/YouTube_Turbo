declare global {
  interface Window {
    TTP?: {
      createHTML: (s: string) => string;
      createScript: (s: string) => string;
      createScriptURL: (s: string) => string;
    };
    trustedTypes?: {
      createPolicy: (name: string, rules: any) => any;
      defaultPolicy?: any;
    };
    isSecureContext?: boolean;
  }
}

export {};
