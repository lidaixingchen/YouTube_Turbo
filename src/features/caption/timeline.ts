import type { SubtitleCue, YouTubeTimedTextJson3 } from "./types";
import { SUBTITLE_CONSTANTS } from "./constants";

export class SubtitleTimeline {
  private cuesCache: Map<string, SubtitleCue[]> = new Map();
  private currentCues: SubtitleCue[] = [];
  private currentKey: string = "";
  private cursorIndex: number = -1;
  private lastQueryMs: number = -1;
  private activeCuesBuffer: SubtitleCue[] = [];
  private cachedTextResult: string = "";

  public constructor() {}

  public parseJson3(text: string): SubtitleCue[] {
    try {
      const data = JSON.parse(text) as YouTubeTimedTextJson3;
      if (!data || !Array.isArray(data.events)) {
        return [];
      }
      const cues: SubtitleCue[] = [];
      for (const ev of data.events) {
        if (typeof ev.tStartMs === "number" && Number.isFinite(ev.tStartMs) && Array.isArray(ev.segs) && ev.segs.length > 0) {
          const segText = ev.segs.map((s) => s.utf8 || "").join("");
          if (segText.trim().length > 0) {
            const duration =
              typeof ev.dDurationMs === "number" && Number.isFinite(ev.dDurationMs)
                ? ev.dDurationMs
                : SUBTITLE_CONSTANTS.FALLBACK_CUE_DURATION_MS;
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
      if (doc.querySelector("parsererror")) {
        return [];
      }
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
          if (content && Number.isFinite(startSec) && Number.isFinite(durSec)) {
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
          if (content && Number.isFinite(startMs) && Number.isFinite(durMs)) {
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
      if (this.cuesCache.size >= SUBTITLE_CONSTANTS.MAX_CACHE_TRACKS && !this.cuesCache.has(key)) {
        const oldestKey = this.cuesCache.keys().next().value;
        if (oldestKey) {
          this.cuesCache.delete(oldestKey);
        }
      }
      this.cuesCache.set(key, cues);
      if (activate || !this.currentKey) {
        this.currentCues = cues;
        this.currentKey = key;
        this.resetPointer();
      }
    }
    return cues;
  }

  public resetPointer(): void {
    this.cursorIndex = -1;
    this.lastQueryMs = -1;
    this.activeCuesBuffer.length = 0;
    this.cachedTextResult = "";
  }

  public findActiveCues(effectiveMs: number): readonly SubtitleCue[] {
    let cues = this.currentCues;
    if (cues.length === 0 && this.cuesCache.size > 0 && typeof window !== "undefined") {
      const currentVideoId = new URLSearchParams(window.location.search).get("v");
      if (currentVideoId) {
        for (const [key, cachedCues] of this.cuesCache.entries()) {
          if (key.startsWith(currentVideoId)) {
            this.currentCues = cachedCues;
            this.currentKey = key;
            cues = cachedCues;
            this.resetPointer();
            break;
          }
        }
      }
    }
    const len = cues.length;
    if (len === 0) {
      this.activeCuesBuffer.length = 0;
      this.cachedTextResult = "";
      return this.activeCuesBuffer;
    }

    let targetIndex = -1;
    const isLinearForward =
      this.lastQueryMs >= 0 &&
      effectiveMs >= this.lastQueryMs &&
      effectiveMs - this.lastQueryMs <= SUBTITLE_CONSTANTS.SEEK_THRESHOLD_MS &&
      this.cursorIndex >= 0 &&
      this.cursorIndex < len;

    if (isLinearForward) {
      const currentCue = cues[this.cursorIndex];
      if (effectiveMs >= currentCue.startMs && effectiveMs <= currentCue.endMs) {
        targetIndex = this.cursorIndex;
      } else if (effectiveMs > currentCue.endMs) {
        const nextIndex = this.cursorIndex + 1;
        if (nextIndex < len) {
          const nextCue = cues[nextIndex];
          if (effectiveMs >= nextCue.startMs && effectiveMs <= nextCue.endMs) {
            targetIndex = nextIndex;
            this.cursorIndex = nextIndex;
          } else if (effectiveMs < nextCue.startMs) {
            // 处于两段独立字幕之间的间隙，将 targetIndex 保留在上一字幕处，由下方逆向回溯检查是否有更早开始的长重叠字幕
            targetIndex = this.cursorIndex;
          }
        } else {
          targetIndex = this.cursorIndex;
        }
      }
    }

    if (targetIndex === -1) {
      let low = 0;
      let high = len - 1;
      let candidateIndex = -1;

      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (cues[mid].startMs <= effectiveMs) {
          candidateIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (candidateIndex === -1) {
        this.cursorIndex = 0;
        this.lastQueryMs = effectiveMs;
        this.activeCuesBuffer.length = 0;
        this.cachedTextResult = "";
        return this.activeCuesBuffer;
      }

      this.cursorIndex = candidateIndex;
      targetIndex = candidateIndex;
    }

    this.lastQueryMs = effectiveMs;
    this.activeCuesBuffer.length = 0;

    for (let i = targetIndex; i >= 0; i--) {
      const cue = cues[i];
      if (cue.endMs >= effectiveMs && cue.startMs <= effectiveMs) {
        this.activeCuesBuffer.unshift(cue);
      } else if (cue.startMs + SUBTITLE_CONSTANTS.MAX_CUE_WINDOW_LOOKBACK_MS < effectiveMs) {
        break;
      }
    }

    return this.activeCuesBuffer;
  }

  public getActiveCueText(effectiveMs: number): string {
    const activeCues = this.findActiveCues(effectiveMs);
    const count = activeCues.length;
    if (count === 0) {
      this.cachedTextResult = "";
      return "";
    }
    if (count === 1) {
      this.cachedTextResult = activeCues[0].text;
      return this.cachedTextResult;
    }

    let combined = "";
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        combined += "\n";
      }
      combined += activeCues[i].text;
    }
    this.cachedTextResult = combined;
    return this.cachedTextResult;
  }

  public clearCurrent(): void {
    this.currentCues = [];
    this.currentKey = "";
    this.resetPointer();
  }

  public clear(): void {
    this.cuesCache.clear();
    this.currentCues = [];
    this.currentKey = "";
    this.resetPointer();
  }
}
