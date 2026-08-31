import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import { userscriptMetadata } from "./build/metadata";
import { inlineTabviewPagePlugin } from "./build/plugins/tabview-bundle";

export default defineConfig({
  plugins: [
    inlineTabviewPagePlugin(),
    monkey({
      entry: "src/main.ts",
      userscript: userscriptMetadata,
      build: {
        fileName: "youtube-turbo.user.js"
      }
    })
  ]
});
