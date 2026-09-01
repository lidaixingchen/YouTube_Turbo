import type { SubtitleCue, YouTubeTimedTextJson3 } from "./types";
import { SUBTITLE_CONSTANTS } from "./constants";

export class SubtitleTimeline {
  private static instance: SubtitleTimeline | null = null;
  private cuesCache: Map<string, SubtitleCue[]> = new Map();
  private currentCues: SubtitleCue[] = [];
  private currentKey: string = "";

  public static getInstance(): SubtitleTimeline {
    if (!this.instance) {
      this.instance = new SubtitleTimeline();
    }
    return this.instance;
  }

  public parseJson3(text: string): SubtitleCue[] {
    try {
      const data = JSON.parse(text) as YouTubeTimedTextJson3;
      if (!data || !Array.isArray(data.events)) {
        return [];
      }
      const cues: SubtitleCue[] = [];
      for (const ev of data.events) {
        if (typeof ev.tStartMs === "number" && Array.isArray(ev.segs) && ev.segs.length > 0) {
          const segText = ev.segs.map((s) => s.utf8 || "").join("");
          if (segText.trim().length > 0) {
            const duration = typeof ev.dDurationMs === "number" ? ev.dDurationMs : SUBTITLE_CONSTANTS.FALLBACK_CUE_DURATION_MS;
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
          const durSec = parseFloat(
            node.getAttribute("dur") || String(SUBTITLE_CONSTANTS.FALLBACK_CUE_DURATION_MS / 1000)
          );
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
          const durMs = parseInt(p.getAttribute("d") || String(SUBTITLE_CONSTANTS.FALLBACK_CUE_DURATION_MS), 10);
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

  public ingest(key: string, rawText: string, activate: boolean = true): SubtitleCue[] {
    if (!key || !rawText) return [];
    const cues = this.parsePayload(rawText);
    if (cues.length > 0) {
      this.cuesCache.set(key, cues);
      if (activate || !this.currentKey) {
        this.currentCues = cues;
        this.currentKey = key;
      }
    }
    return cues;
  }

  public setActiveKey(key: string): void {
    this.currentKey = key;
    const cached = this.cuesCache.get(key);
    this.currentCues = cached || [];
  }

  public getActiveKey(): string {
    return this.currentKey;
  }

  public getCurrentCues(): SubtitleCue[] {
    return this.currentCues;
  }

  /**
   * 基于二分查找在 O(log N) 复杂度内检索当前时间戳命中的 Cue 片段
   */
  public findActiveCues(effectiveMs: number): SubtitleCue[] {
    const cues = this.currentCues;
    const len = cues.length;
    if (len === 0) return [];

    let low = 0;
    let high = len - 1;
    let candidateIndex = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (cues[mid].startMs <= effectiveMs) {
        candidateIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (candidateIndex === -1) {
      return [];
    }

    const activeCues: SubtitleCue[] = [];
    for (let i = candidateIndex; i >= 0; i--) {
      const cue = cues[i];
      if (cue.endMs >= effectiveMs && cue.startMs <= effectiveMs) {
        activeCues.unshift(cue);
      } else if (cue.startMs + SUBTITLE_CONSTANTS.MAX_CUE_WINDOW_LOOKBACK_MS < effectiveMs) {
        break;
      }
    }

    return activeCues;
  }

  public clearCurrent(): void {
    this.currentCues = [];
    this.currentKey = "";
  }

  public clear(): void {
    this.cuesCache.clear();
    this.currentCues = [];
    this.currentKey = "";
  }
}
