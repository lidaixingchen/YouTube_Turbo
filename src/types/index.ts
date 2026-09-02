export interface StepperConfigField {
  type: "stepper";
  key: string;
  titleI18nKey: string;
  descI18nKey?: string;
  unitI18nKey?: string;
  fallbackUnit?: string;
  resetI18nKey?: string;
  badgeText?: string;
  step: number;
  min: number;
  max: number;
  scale?: number;
  defaultValue?: number;
  precision?: number;
  getValue: () => number;
  setValue: (value: number) => void;
}

export type ConfigField = StepperConfigField;

export interface FeatureDescriptor {
  id: string;
  i18nKey: string;
  titleI18nKey?: string;
  descI18nKey?: string;
  defaultValue: boolean;
  order?: number;
  requiresReload?: boolean;
  extraFields?: ConfigField[];
  setup: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

export interface BridgePacket<T = unknown> {
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
  lang?: string;
  isRTL?: boolean;
  direction?: "rtl" | "ltr";
  content: LocaleContent;
}

export interface ModalOpenOptions {
  title?: string;
  content?: HTMLElement | string;
  styleSheet?: string;
  direction?: "rtl" | "ltr";
  size?: "small" | "medium" | "large";
  onClose?: () => void;
}

export interface VideoResolution {
  width: number;
  height: number;
}
