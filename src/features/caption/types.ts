export interface TimedTextPen {
  szPenSize?: number;
  fsFontStyle?: number;
  bBold?: boolean;
  iItalics?: boolean;
  uUnderline?: boolean;
  fcForeColor?: string;
  foForeAlpha?: number;
  bcBackColor?: string;
  boBackAlpha?: number;
  ecEdgeColor?: string;
  etEdgeType?: number;
}

export interface TimedTextWinStyle {
  mhModeHint?: number;
  juJustCode?: number;
  sdScrollDir?: number;
}

export interface TimedTextWinPosition {
  apPoint?: number;
  ahHorPos?: number;
  avVerPos?: number;
  rcRows?: number;
  ccCols?: number;
}

export interface TimedTextSegment {
  utf8: string;
  tOffsetMs?: number;
  acAsrConf?: number;
  pPenId?: number;
}

export interface TimedTextEvent {
  tStartMs: number;
  dDurationMs?: number;
  wWinId?: number;
  pPenId?: number;
  aAppend?: number;
  segs?: TimedTextSegment[];
}

export interface YouTubeTimedTextJson3 {
  wireMagic?: "pb3";
  pens?: TimedTextPen[];
  wsWinStyles?: TimedTextWinStyle[];
  wpWinPositions?: TimedTextWinPosition[];
  events: TimedTextEvent[];
}

export interface YouTubeCaptionTrack {
  languageCode: string;
  languageName?: string;
  displayName?: string;
  kind?: string;
  vssId?: string;
  id?: number;
  is_servable?: boolean;
  is_default?: boolean;
  translationLanguage?: {
    languageCode: string;
    languageName?: string;
  };
}

export interface YouTubePlayerElement extends HTMLElement {
  getOption(module: "captions", option: "track"): YouTubeCaptionTrack | null;
  getOption(module: "captions", option: "tracklist"): YouTubeCaptionTrack[];
  setOption(module: "captions", option: "track", value: YouTubeCaptionTrack | Record<string, never>): void;
  setOption(module: "captions", option: "reload", value: boolean): void;
  setOption(module: "captions", option: "translationLanguage", value: { languageCode: string; languageName?: string }): void;
  loadModule?(module: "captions"): void;
  unloadModule?(module: "captions"): void;
  isSubtitlesOn?(): boolean;
}

export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface CaptionOffsetState {
  globalDefaultOffsetMs: number;
  sessionOffsetMs: number;
  effectiveOffsetMs: number;
}

export type CaptionOffsetProvider = () => {
  sessionOffsetMs: number;
  effectiveOffsetMs: number;
};
