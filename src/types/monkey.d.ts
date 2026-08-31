declare global {
  interface Window {
    TTP?: {
      createHTML: (s: string) => string;
      createScript: (s: string) => string;
      createScriptURL: (s: string) => string;
    };
    __YTI_SANDBOX_BRIDGE__?: any;
    __YTI_PAGE_BRIDGE__?: any;
    trustedTypes?: {
      createPolicy: (name: string, rules: any) => any;
      defaultPolicy?: any;
    };
    isSecureContext?: boolean;
  }
}

export {};
