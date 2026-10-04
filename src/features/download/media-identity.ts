import { DOWNLOAD_CONSTANTS } from "./constants";

export function resolveDownloadVideoUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const isSupportedOrigin: boolean = DOWNLOAD_CONSTANTS.YOUTUBE_ORIGINS.some(
    (origin: string): boolean => url.origin === origin
  );
  if (!isSupportedOrigin) {
    return null;
  }

  let videoId: string | null = null;
  if (url.pathname === DOWNLOAD_CONSTANTS.WATCH_PATH) {
    const videoIds: string[] = url.searchParams.getAll(DOWNLOAD_CONSTANTS.VIDEO_ID_PARAMETER);
    if (videoIds.length === 1) {
      videoId = videoIds.at(0) ?? null;
    }
  } else if (url.pathname.startsWith(DOWNLOAD_CONSTANTS.SHORTS_PATH_PREFIX)) {
    const shortsVideoId: string = url.pathname.slice(DOWNLOAD_CONSTANTS.SHORTS_PATH_PREFIX.length);
    if (!shortsVideoId.includes(DOWNLOAD_CONSTANTS.PATH_SEPARATOR)) {
      videoId = shortsVideoId;
    }
  }

  return videoId && DOWNLOAD_CONSTANTS.VIDEO_ID_PATTERN.test(videoId) ? href : null;
}
