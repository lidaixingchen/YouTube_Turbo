import type { SubtitleCue, YouTubeTimedTextJson3 } from "./types";
import { SUBTITLE_CONSTANTS } from "./constants";
import { resolveCaptionVideoId } from "./video-identity";

interface SubtitleIntervalSnapshot {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

interface CachedSubtitleTrack {
  readonly cues: SubtitleCue[];
  readonly requestSequence?: number;
}

type SubtitleTrackRequestStatus = "pending" | "succeeded" | "failed";

interface SubtitleTrackRequestOwner {
  readonly key: string;
  readonly requestSequence: number;
  readonly status: SubtitleTrackRequestStatus;
}

export class SubtitleTimeline {
  private cuesCache: Map<string, CachedSubtitleTrack> = new Map();
  private requestOwnerByVideo: Map<string, SubtitleTrackRequestOwner> = new Map();
  private currentCues: SubtitleCue[] = [];
  private currentPrefixMaxEndMs: number[] = [];
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

  public ingest(
    key: string,
    rawText: string,
    activate: boolean = true,
    requestSequence?: number,
    videoId?: string
  ): SubtitleCue[] {
    if (!key) return [];
    const requestVideoId: string = videoId ?? this.extractVideoIdFromTrackKey(key);
    const requestOwner: SubtitleTrackRequestOwner | undefined = this.requestOwnerByVideo.get(requestVideoId);
    const ownsRequest: boolean =
      requestSequence !== undefined &&
      requestOwner?.key === key &&
      requestOwner.requestSequence === requestSequence;
    if (ownsRequest && requestOwner?.status === "pending") {
      this.requestOwnerByVideo.set(requestVideoId, { ...requestOwner, status: "succeeded" });
    }
    if (!rawText) return [];
    const cues = this.parsePayload(rawText);
    if (cues.length > 0) {
      const cachedTrack: CachedSubtitleTrack | undefined = this.cuesCache.get(key);
      const isOlderThanCachedTrack: boolean =
        requestSequence !== undefined &&
        cachedTrack?.requestSequence !== undefined &&
        requestSequence < cachedTrack.requestSequence;
      if (!isOlderThanCachedTrack && this.cuesCache.size >= SUBTITLE_CONSTANTS.MAX_CACHE_TRACKS && !this.cuesCache.has(key)) {
        const oldestKey: string | undefined = this.cuesCache.keys().next().value;
        if (oldestKey) {
          this.cuesCache.delete(oldestKey);
        }
      }
      if (!isOlderThanCachedTrack) {
        this.cuesCache.set(key, { cues, requestSequence });
      }
      const latestOwnerAllowsActivation: boolean =
        requestSequence === undefined ||
        requestOwner === undefined ||
        (ownsRequest && requestOwner?.status !== "failed");
      if (activate && latestOwnerAllowsActivation && !isOlderThanCachedTrack) {
        this.currentCues = cues;
        this.currentPrefixMaxEndMs = this.buildPrefixMaxEndIndex(cues);
        this.resetPointer();
      }
    }
    return cues;
  }

  public noteTrackRequest(videoId: string, key: string, requestSequence: number): void {
    if (!videoId || !key) {
      return;
    }
    const currentOwner: SubtitleTrackRequestOwner | undefined = this.requestOwnerByVideo.get(videoId);
    if (currentOwner && currentOwner.requestSequence >= requestSequence) {
      return;
    }
    this.requestOwnerByVideo.delete(videoId);
    this.requestOwnerByVideo.set(videoId, { key, requestSequence, status: "pending" });
    this.resetPointer();
    if (this.requestOwnerByVideo.size > SUBTITLE_CONSTANTS.MAX_CACHE_TRACKS) {
      const oldestVideoId: string | undefined = this.requestOwnerByVideo.keys().next().value;
      if (oldestVideoId) {
        this.requestOwnerByVideo.delete(oldestVideoId);
        const oldestVideoPrefix: string = `${oldestVideoId}${SUBTITLE_CONSTANTS.TRACK_KEY_SEPARATOR}`;
        const cachedKeys: IterableIterator<string> = this.cuesCache.keys();
        for (const cachedKey of cachedKeys) {
          if (cachedKey.startsWith(oldestVideoPrefix)) {
            this.cuesCache.delete(cachedKey);
          }
        }
      }
    }
  }

  public settleTrackRequestFailure(key: string, videoId: string, requestSequence: number): boolean {
    const currentOwner: SubtitleTrackRequestOwner | undefined = this.requestOwnerByVideo.get(videoId);
    if (
      !currentOwner ||
      currentOwner.key !== key ||
      currentOwner.requestSequence !== requestSequence ||
      currentOwner.status !== "pending"
    ) {
      return false;
    }
    this.requestOwnerByVideo.set(videoId, { ...currentOwner, status: "failed" });
    this.resetPointer();
    return true;
  }

  private extractVideoIdFromTrackKey(key: string): string {
    const separatorIndex: number = key.indexOf(SUBTITLE_CONSTANTS.TRACK_KEY_SEPARATOR);
    return separatorIndex < 0 ? "" : key.slice(0, separatorIndex);
  }

  private findMostRecentCachedTrack(videoId: string, beforeSequence?: number): CachedSubtitleTrack | null {
    const trackPrefix: string = `${videoId}${SUBTITLE_CONSTANTS.TRACK_KEY_SEPARATOR}`;
    let mostRecentTrack: CachedSubtitleTrack | null = null;
    for (const [key, cachedTrack] of this.cuesCache) {
      if (!key.startsWith(trackPrefix)) {
        continue;
      }
      if (
        beforeSequence !== undefined &&
        cachedTrack.requestSequence !== undefined &&
        cachedTrack.requestSequence >= beforeSequence
      ) {
        continue;
      }
      if (
        mostRecentTrack === null ||
        (cachedTrack.requestSequence !== undefined &&
          (mostRecentTrack.requestSequence === undefined ||
            cachedTrack.requestSequence > mostRecentTrack.requestSequence))
      ) {
        mostRecentTrack = cachedTrack;
      }
    }
    return mostRecentTrack;
  }

  private activateCachedTrack(cachedTrack: CachedSubtitleTrack): void {
    this.currentCues = cachedTrack.cues;
    this.currentPrefixMaxEndMs = this.buildPrefixMaxEndIndex(cachedTrack.cues);
    this.resetPointer();
  }

  public resetPointer(): void {
    this.cursorIndex = -1;
    this.lastQueryMs = -1;
    this.lastHistoricalEndMs = SUBTITLE_CONSTANTS.INTERVAL_START_MIN_MS;
    this.activeCuesBuffer.length = 0;
    this.matchedBuffer.length = 0;
    this.intervalSnapshot = null;
  }

  private buildPrefixMaxEndIndex(cues: readonly SubtitleCue[]): number[] {
    const prefixMaxEndMs: number[] = [];
    let maxEndMs: number = SUBTITLE_CONSTANTS.INTERVAL_START_MIN_MS;
    for (let i = 0; i < cues.length; i++) {
      maxEndMs = Math.max(maxEndMs, cues[i].endMs);
      prefixMaxEndMs.push(maxEndMs);
    }
    return prefixMaxEndMs;
  }

  public findActiveCues(effectiveMs: number): readonly SubtitleCue[] {
    let cues = this.currentCues;
    if (cues.length === 0 && this.cuesCache.size > 0 && typeof window !== "undefined") {
      const currentVideoId: string | null = resolveCaptionVideoId(window.location.href);
      if (currentVideoId) {
        const requestOwner: SubtitleTrackRequestOwner | undefined = this.requestOwnerByVideo.get(currentVideoId);
        let cachedTrack: CachedSubtitleTrack | null = null;
        if (!requestOwner || requestOwner.status === "failed") {
          cachedTrack = this.findMostRecentCachedTrack(
            currentVideoId,
            requestOwner?.status === "failed" ? requestOwner.requestSequence : undefined
          );
        } else if (requestOwner.status === "succeeded") {
          const latestTrack: CachedSubtitleTrack | undefined = this.cuesCache.get(requestOwner.key);
          if (latestTrack?.requestSequence === requestOwner.requestSequence) {
            cachedTrack = latestTrack;
          }
        }
        if (cachedTrack) {
          this.activateCachedTrack(cachedTrack);
          cues = cachedTrack.cues;
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
      const prefixMaxEndMs = this.currentPrefixMaxEndMs[i];
      if (prefixMaxEndMs <= effectiveMs) {
        maxHistoricalEndMs = Math.max(maxHistoricalEndMs, prefixMaxEndMs);
        break;
      }
      const cue = cues[i];
      if (cue.endMs > effectiveMs && cue.startMs <= effectiveMs) {
        this.matchedBuffer.push(cue);
      } else if (cue.endMs <= effectiveMs && cue.endMs > maxHistoricalEndMs) {
        maxHistoricalEndMs = cue.endMs;
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
    this.currentPrefixMaxEndMs = [];
    this.resetPointer();
  }

  public clear(): void {
    this.cuesCache.clear();
    this.requestOwnerByVideo.clear();
    this.currentCues = [];
    this.currentPrefixMaxEndMs = [];
    this.resetPointer();
  }
}
