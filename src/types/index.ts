export interface FeatureDescriptor {
  id: string;
  i18nKey: string;
  defaultValue: boolean;
  order?: number;
  requiresReload?: boolean;
  setup: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

export interface BridgePacket<T = any> {
  id: string;
  type: string;
  sender: "sandbox" | "page";
  target: "sandbox" | "page";
  timestamp: number;
  payload?: T;
}

export interface LocaleContent {
  [key: string]: string;
}

export interface LanguageDefinition {
  lang: string;
  isRTL?: boolean;
  direction?: "rtl" | "ltr";
  content: LocaleContent;
}

export interface ModalOpenOptions {
  title?: string;
  content?: HTMLElement | string;
  styleSheet?: string;
  direction?: "rtl" | "ltr";
  onClose?: () => void;
}

export interface VideoResolution {
  width: number;
  height: number;
}
