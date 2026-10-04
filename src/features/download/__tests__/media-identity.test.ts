import { describe, expect, it } from "vitest";
import { resolveDownloadVideoUrl } from "../media-identity";

describe("download media identity", (): void => {
  it("preserves complete YouTube watch and Shorts URLs", (): void => {
    const videoUrls: readonly string[] = [
      "https://www.youtube.com/watch?app=desktop&v=abc123&list=PL456&t=90s#details",
      "https://www.youtube.com/shorts/short123?feature=share&t=90#details",
      "https://youtube.com/watch?v=abc123"
    ];

    for (const videoUrl of videoUrls) {
      expect(resolveDownloadVideoUrl(videoUrl)).toBe(videoUrl);
    }
  });

  it("rejects non-video routes and URLs outside supported YouTube origins", (): void => {
    const invalidUrls: readonly string[] = [
      "https://www.youtube.com/",
      "https://www.youtube.com/feed/subscriptions",
      "https://www.youtube.com/watch",
      "https://www.youtube.com/watch?v=",
      "https://www.youtube.com/watch?v=first&v=second",
      "https://www.youtube.com/shorts/",
      "https://www.youtube.com/shorts/short123/extra",
      "https://www.youtube.com.evil.example/watch?v=abc123",
      "https://example.com/watch?v=abc123"
    ];

    for (const invalidUrl of invalidUrls) {
      expect(resolveDownloadVideoUrl(invalidUrl)).toBeNull();
    }
  });
});
