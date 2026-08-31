import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import { userscriptMetadata } from "./build/metadata";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: userscriptMetadata,
      build: {
        fileName: "youtube-improvements.user.js"
      }
    })
  ]
});
