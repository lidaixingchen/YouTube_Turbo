import type { SubtitleCue, YouTubeTimedTextJson3 } from "./types";
import { SUBTITLE_CONSTANTS } from "./constants";

interface SubtitleIntervalSnapshot {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

export class SubtitleTimeline {
  private cuesCache: Map<string, SubtitleCue[]> = new Map();
  private currentCues: SubtitleCue[] = [];
  private currentKey: string = "";
  private cursorIndex: number = -1;
  private lastQueryMs: number = -1;
  private lastHistoricalEndMs: number = SUBTITLE_CONSTANTS.INTERVAL_START_MIN_MS;
  private activeCuesBuffer: SubtitleCue[] = [];
  private matchedBuffer: SubtitleCue[] = [];
  private intervalSnapshot: SubtitleIntervalSnapshot | null = null;

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
    this.lastHistoricalEndMs = SUBTITLE_CONSTANTS.INTERVAL_START_MIN_MS;
    this.activeCuesBuffer.length = 0;
    this.matchedBuffer.length = 0;
    this.intervalSnapshot = null;
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
      return this.activeCuesBuffer;
    }

    let targetIndex = -1;
    const isLinearForward =
      this.lastQueryMs !== -1 &&
      effectiveMs >= this.lastQueryMs &&
      effectiveMs - this.lastQueryMs <= SUBTITLE_CONSTANTS.SEEK_THRESHOLD_MS &&
      this.cursorIndex >= -1 &&
      this.cursorIndex < len;

    if (isLinearForward) {
      let idx = this.cursorIndex;
      while (idx + 1 < len && cues[idx + 1].startMs <= effectiveMs) {
        idx++;
      }
      this.cursorIndex = idx;
      targetIndex = idx;
    }

    if (targetIndex === -1 && this.cursorIndex === -1 && this.lastQueryMs !== -1 && effectiveMs < cues[0].startMs) {
      targetIndex = -1;
    } else if (targetIndex === -1) {
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

      this.cursorIndex = candidateIndex;
      targetIndex = candidateIndex;
    }

    this.lastQueryMs = effectiveMs;

    if (targetIndex === -1) {
      this.lastHistoricalEndMs = SUBTITLE_CONSTANTS.INTERVAL_START_MIN_MS;
      this.activeCuesBuffer.length = 0;
      return this.activeCuesBuffer;
    }

    this.matchedBuffer.length = 0;
    let maxHistoricalEndMs: number = SUBTITLE_CONSTANTS.INTERVAL_START_MIN_MS;

    for (let i = targetIndex; i >= 0; i--) {
      const cue = cues[i];
      if (cue.endMs > effectiveMs && cue.startMs <= effectiveMs) {
        this.matchedBuffer.push(cue);
      } else if (cue.endMs <= effectiveMs && cue.endMs > maxHistoricalEndMs) {
        maxHistoricalEndMs = cue.endMs;
      }
      if (cue.startMs + SUBTITLE_CONSTANTS.MAX_CUE_WINDOW_LOOKBACK_MS < effectiveMs) {
        break;
      }
    }

    this.lastHistoricalEndMs = maxHistoricalEndMs;
    this.activeCuesBuffer.length = 0;
    for (let i = this.matchedBuffer.length - 1; i >= 0; i--) {
      this.activeCuesBuffer.push(this.matchedBuffer[i]);
    }

    return this.activeCuesBuffer;
  }

  public getActiveCueText(effectiveMs: number): string {
    if (
      this.intervalSnapshot !== null &&
      effectiveMs >= this.intervalSnapshot.startMs &&
      effectiveMs < this.intervalSnapshot.endMs
    ) {
      return this.intervalSnapshot.text;
    }

    const activeCues = this.findActiveCues(effectiveMs);
    const count = activeCues.length;
    let text = "";
    if (count === 1) {
      text = activeCues[0].text;
    } else if (count > 1) {
      let combined = "";
      for (let i = 0; i < count; i++) {
        if (i > 0) {
          combined += "\n";
        }
        combined += activeCues[i].text;
      }
      text = combined;
    }

    this.intervalSnapshot = this.computeIntervalSnapshot(effectiveMs, activeCues, text);
    return text;
  }

  private computeIntervalSnapshot(
    effectiveMs: number,
    activeCues: readonly SubtitleCue[],
    text: string
  ): SubtitleIntervalSnapshot {
    const cues = this.currentCues;
    const len = cues.length;
    if (len === 0) {
      return {
        startMs: SUBTITLE_CONSTANTS.INTERVAL_START_MIN_MS,
        endMs: SUBTITLE_CONSTANTS.INTERVAL_END_MAX_MS,
        text: ""
      };
    }

    const targetIndex = this.cursorIndex;
    const nextStartMs =
      targetIndex === -1
        ? cues[0].startMs
        : targetIndex + 1 < len
        ? cues[targetIndex + 1].startMs
        : SUBTITLE_CONSTANTS.INTERVAL_END_MAX_MS;

    let minActiveEndMs: number = SUBTITLE_CONSTANTS.INTERVAL_END_MAX_MS;
    let maxActiveStartMs: number = SUBTITLE_CONSTANTS.INTERVAL_START_MIN_MS;

    for (let i = 0; i < activeCues.length; i++) {
      const cue = activeCues[i];
      if (cue.endMs < minActiveEndMs && cue.endMs > effectiveMs) {
        minActiveEndMs = cue.endMs;
      }
      if (cue.startMs > maxActiveStartMs && cue.startMs <= effectiveMs) {
        maxActiveStartMs = cue.startMs;
      }
    }

    const endCandidate = Math.min(minActiveEndMs, nextStartMs);

    let startCandidate = Math.max(maxActiveStartMs, this.lastHistoricalEndMs);
    if (activeCues.length === 0 && targetIndex >= 0 && targetIndex < len) {
      const targetCue = cues[targetIndex];
      if (targetCue.endMs <= effectiveMs && targetCue.endMs > startCandidate) {
        startCandidate = targetCue.endMs;
      }
    }

    return {
      startMs: Math.min(startCandidate, effectiveMs),
      endMs: endCandidate,
      text
    };
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
