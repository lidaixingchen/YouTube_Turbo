import type { Plugin } from "vite";
import * as esbuild from "esbuild";
import * as path from "node:path";

export function inlineTabviewPagePlugin(): Plugin {
  const virtualModuleId = "virtual:tabview-page-bundle";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  return {
    name: "vite-plugin-tabview-page-bundle",
    resolveId(id: string): string | null {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    async load(id: string): Promise<string | null> {
      if (id === resolvedVirtualModuleId) {
        const entryPath = path.resolve(__dirname, "../../src/features/tabview/page/index.ts");
        const isProd = process.env.NODE_ENV === "production";
        const buildResult = await esbuild.build({
          entryPoints: [entryPath],
          bundle: true,
          write: false,
          format: "iife",
          target: "es2020",
          minify: isProd,
          treeShaking: true,
          legalComments: "none",
          sourcemap: !isProd ? "inline" : false
        });

        const code = buildResult.outputFiles?.[0]?.text ?? "";
        return `export default ${JSON.stringify(code)};`;
      }
      return null;
    },
    async handleHotUpdate(ctx) {
      if (ctx.file.includes(path.join("features", "tabview", "page"))) {
        const mod = ctx.server.moduleGraph.getModuleById(resolvedVirtualModuleId);
        if (mod) {
          ctx.server.moduleGraph.invalidateModule(mod);
        }
      }
    }
  };
}
