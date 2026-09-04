import { defineConfig } from "vitest/config";
import { inlineTabviewPagePlugin } from "./build/plugins/tabview-bundle";

export default defineConfig({
  plugins: [inlineTabviewPagePlugin()],
  test: {
    environment: "jsdom",
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
    setupFiles: ["./src/test/setup.ts"]
  }
});
