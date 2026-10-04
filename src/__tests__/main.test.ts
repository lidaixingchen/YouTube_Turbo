import { afterEach, describe, expect, it, vi } from "vitest";

describe("main entry", () => {
  afterEach(() => {
    vi.doUnmock("../core/bootstrap");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("handles bootstrap rejection", async (): Promise<void> => {
    vi.resetModules();
    const startupError: Error = new Error("startup failed");
    vi.doMock("../core/bootstrap", () => ({
      bootstrapApplication: (): Promise<void> => Promise.reject(startupError)
    }));
    const errorSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(console, "error").mockImplementation((): void => {});

    await import("../main");
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith("[main] Application startup error:", startupError);
  });
});
