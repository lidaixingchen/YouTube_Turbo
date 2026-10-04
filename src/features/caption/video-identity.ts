import { SHORTS_ROUTE_PREFIX } from "../../core/constants";
import { SUBTITLE_CONSTANTS } from "./constants";

export function resolveCaptionVideoId(href: string): string | null {
  const url: URL = new URL(href);
  const shortsPrefix: string = `${SHORTS_ROUTE_PREFIX}${SUBTITLE_CONSTANTS.PATH_SEPARATOR}`;
  if (url.pathname.startsWith(shortsPrefix)) {
    const videoId: string = url.pathname.slice(shortsPrefix.length).split(SUBTITLE_CONSTANTS.PATH_SEPARATOR)[0];
    return videoId || null;
  }
  return url.searchParams.get(SUBTITLE_CONSTANTS.VIDEO_ID_PARAMETER);
}
