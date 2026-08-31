import { SUBTITLE_CONSTANTS } from "./constants";
import type { YouTubePlayerElement } from "./types";

export class CaptionReloader {
  private static getPlayer(): YouTubePlayerElement | null {
    return (
      (document.getElementById("movie_player") as YouTubePlayerElement | null) ||
      (document.querySelector("#player-container-outer .html5-video-player") as YouTubePlayerElement | null)
    );
  }

  public static reload(): boolean {
    const player = this.getPlayer();
    if (!player || typeof player.getOption !== "function" || typeof player.setOption !== "function") {
      return false;
    }

    try {
      const currentTrack = player.getOption("captions", "track");
      if (!currentTrack || !currentTrack.languageCode) {
        return false;
      }

      const translationLanguage = currentTrack.translationLanguage;

      try {
        player.setOption("captions", "reload", true);
      } catch {
        // 部分播放器版本可能未暴露 reload 标志，回退到 track toggle
      }

      player.setOption("captions", "track", {});

      setTimeout(() => {
        try {
          player.setOption("captions", "track", currentTrack);
          if (translationLanguage) {
            player.setOption("captions", "translationLanguage", translationLanguage);
          }
        } catch (err) {
          console.error("[CaptionReloader] Failed to restore caption track:", err);
        }
      }, SUBTITLE_CONSTANTS.RELOAD_RESTORE_DELAY_MS);

      return true;
    } catch (err) {
      console.error("[CaptionReloader] Reload execution error:", err);
      return false;
    }
  }
}
