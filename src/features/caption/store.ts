import type { YouTubePlayerElement, SubtitleCue, YouTubeTimedTextJson3 } from "./types";
import { SUBTITLE_CONSTANTS } from "./constants";

export class CaptionStore {
  private static instance: CaptionStore | null = null;
  private cuesCache: Map<string, SubtitleCue[]> = new Map();
  private currentCues: SubtitleCue[] = [];
  private currentKey: string = "";

  public static getInstance(): CaptionStore {
    if (!this.instance) {
      this.instance = new CaptionStore();
    }
    return this.instance;
  }

  public getCurrentVideoId(): string | null {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get("v");
    if (videoId) return videoId;

    const pathname = window.location.pathname;
    if (pathname.startsWith("/shorts/")) {
      return pathname.replace("/shorts/", "").split("/")[0];
    }
    return null;
  }

  public parseJson3(text: string): SubtitleCue[] {
    try {
      const data = JSON.parse(text) as YouTubeTimedTextJson3;
      if (!data || !Array.isArray(data.events)) return [];
      const cues: SubtitleCue[] = [];
      for (const ev of data.events) {
        if (typeof ev.tStartMs === "number" && Array.isArray(ev.segs) && ev.segs.length > 0) {
          const segText = ev.segs.map((s) => s.utf8 || "").join("");
          if (segText.trim().length > 0) {
            const duration = typeof ev.dDurationMs === "number" ? ev.dDurationMs : 2000;
            cues.push({
              startMs: ev.tStartMs,
              endMs: ev.tStartMs + duration,
              text: segText
            });
          }
        }
      }
      return cues.sort((a, b) => a.startMs - b.startMs);
    } catch {
      return [];
    }
  }

  public parseXml(text: string): SubtitleCue[] {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/xml");
      const cues: SubtitleCue[] = [];
      const isSrv1 = doc.querySelector("transcript") !== null;
      if (isSrv1) {
        const textNodes = doc.querySelectorAll("text");
        textNodes.forEach((node) => {
          const startSec = parseFloat(node.getAttribute("start") || "0");
          const durSec = parseFloat(node.getAttribute("dur") || "2");
          const content = (node.textContent || "").trim();
          if (content) {
            cues.push({
              startMs: Math.round(startSec * 1000),
              endMs: Math.round((startSec + durSec) * 1000),
              text: content
            });
          }
        });
      } else {
        const pNodes = doc.querySelectorAll("p");
        pNodes.forEach((p) => {
          const startMs = parseInt(p.getAttribute("t") || "0", 10);
          const durMs = parseInt(p.getAttribute("d") || "2000", 10);
          const content = (p.textContent || "").trim();
          if (content) {
            cues.push({
              startMs,
              endMs: startMs + durMs,
              text: content
            });
          }
        });
      }
      return cues.sort((a, b) => a.startMs - b.startMs);
    } catch {
      return [];
    }
  }

  public parsePayload(rawText: string): SubtitleCue[] {
    if (!rawText) return [];
    const trimmed = rawText.trimStart();
    if (trimmed.startsWith("{") && trimmed.includes("events")) {
      return this.parseJson3(rawText);
    }
    if (trimmed.startsWith("<")) {
      return this.parseXml(rawText);
    }
    return [];
  }

  public captureRawTimedText(url: string, rawText: string): void {
    if (!url || !rawText) return;
    try {
      const parsedUrl = new URL(url, window.location.origin);
      const videoId = parsedUrl.searchParams.get("v") || this.getCurrentVideoId();
      const lang = parsedUrl.searchParams.get("lang") || "default";
      const tlang = parsedUrl.searchParams.get("tlang") || "";

      if (!videoId) return;

      const key = `${videoId}_${lang}_${tlang}`;
      const cues = this.parsePayload(rawText);
      if (cues.length > 0) {
        this.cuesCache.set(key, cues);
        const currentVideoId = this.getCurrentVideoId();
        if (videoId === currentVideoId) {
          this.currentCues = cues;
          this.currentKey = key;
        }
      }
    } catch (err) {
      console.error("[CaptionStore] Failed to capture raw timedtext:", err);
    }
  }

  public getActiveTrack(): { languageCode: string; translationLanguageCode?: string } | null {
    const player = (document.getElementById("movie_player") as YouTubePlayerElement | null) ||
      (document.querySelector("#player-container-outer .html5-video-player") as YouTubePlayerElement | null);
    if (!player || typeof player.getOption !== "function") {
      return null;
    }
    try {
      const track = player.getOption("captions", "track");
      if (track && track.languageCode) {
        return {
          languageCode: track.languageCode,
          translationLanguageCode: track.translationLanguage?.languageCode
        };
      }
    } catch {
      // 忽略播放器内部读取错误
    }
    return null;
  }

  public async fetchCues(videoId: string, lang: string, tlang?: string): Promise<SubtitleCue[]> {
    const key = `${videoId}_${lang}_${tlang || ""}`;
    const cached = this.cuesCache.get(key);
    if (cached && cached.length > 0) {
      return cached;
    }

    try {
      let fetchUrl = `${SUBTITLE_CONSTANTS.TIMEDTEXT_API_PATH}?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}&fmt=json3`;
      if (tlang) {
        fetchUrl += `&tlang=${encodeURIComponent(tlang)}`;
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) {
        return [];
      }
      const rawText = await res.text();
      const cues = this.parsePayload(rawText);
      if (cues.length > 0) {
        this.cuesCache.set(key, cues);
      }
      return cues;
    } catch (err) {
      console.error("[CaptionStore] Error fetching subtitle cues:", err);
      return [];
    }
  }

  public async loadCurrentVideoCues(): Promise<SubtitleCue[]> {
    const videoId = this.getCurrentVideoId();
    if (!videoId) {
      this.currentCues = [];
      return [];
    }

    const activeTrack = this.getActiveTrack();
    const lang = activeTrack?.languageCode || "en";
    const tlang = activeTrack?.translationLanguageCode;
    const key = `${videoId}_${lang}_${tlang || ""}`;

    if (this.currentKey === key && this.currentCues.length > 0) {
      return this.currentCues;
    }

    const cached = this.cuesCache.get(key);
    if (cached && cached.length > 0) {
      this.currentCues = cached;
      this.currentKey = key;
      return cached;
    }

    const cues = await this.fetchCues(videoId, lang, tlang);
    if (cues.length > 0) {
      this.currentCues = cues;
      this.currentKey = key;
    }
    return cues;
  }

  public getCurrentCues(): SubtitleCue[] {
    return this.currentCues;
  }

  public clearCurrent(): void {
    this.currentCues = [];
    this.currentKey = "";
  }
}
