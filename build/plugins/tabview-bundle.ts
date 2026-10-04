import type { HmrContext, ModuleNode, Plugin, ResolvedConfig } from "vite";
import * as esbuild from "esbuild";
import * as path from "node:path";
import { TABVIEW_BUNDLE_CONSTANTS } from "./constants";

export interface InlineTabviewPagePluginOptions {
  entryPath?: string;
}

export function isPathInDirectory(filePath: string, directoryPath: string): boolean {
  const normalizedFilePath: string = normalizePathForComparison(filePath);
  const normalizedDirectoryPath: string = normalizePathForComparison(directoryPath);
  const directoryPrefix: string = normalizedDirectoryPath.endsWith("/")
    ? normalizedDirectoryPath
    : `${normalizedDirectoryPath}/`;

  return normalizedFilePath === normalizedDirectoryPath || normalizedFilePath.startsWith(directoryPrefix);
}

function normalizePathForComparison(filePath: string): string {
  const slashPath: string = filePath.replaceAll("\\", "/");
  const isWindowsPath: boolean = /^[A-Za-z]:\//.test(slashPath) || slashPath.startsWith("//");
  const normalizedPath: string = path.posix.normalize(slashPath);

  return isWindowsPath ? normalizedPath.toLowerCase() : normalizedPath;
}

export function inlineTabviewPagePlugin(options: InlineTabviewPagePluginOptions = {}): Plugin {
  const entryPath: string = path.resolve(
    options.entryPath ?? path.resolve(__dirname, TABVIEW_BUNDLE_CONSTANTS.ENTRY_RELATIVE_PATH)
  );
  const entryDirectory: string = path.dirname(entryPath);
  const pageSourceDirectory: string = entryDirectory;
  const watchedInputPaths: Set<string> = new Set<string>();
  let isDevelopmentServer: boolean = false;

  return {
    name: "vite-plugin-tabview-page-bundle",
    resolveId(id: string): string | null {
      if (id === TABVIEW_BUNDLE_CONSTANTS.VIRTUAL_MODULE_ID) {
        return TABVIEW_BUNDLE_CONSTANTS.RESOLVED_VIRTUAL_MODULE_ID;
      }
      return null;
    },
    configResolved(config: ResolvedConfig): void {
      isDevelopmentServer = config.command === "serve";
    },
    async load(id: string): Promise<string | null> {
      if (id === TABVIEW_BUNDLE_CONSTANTS.RESOLVED_VIRTUAL_MODULE_ID) {
        const isProd = process.env.NODE_ENV === "production";
        const buildResult = await esbuild.build({
          entryPoints: [entryPath],
          absWorkingDir: entryDirectory,
          bundle: true,
          write: false,
          format: "iife",
          target: TABVIEW_BUNDLE_CONSTANTS.ESBUILD_TARGET,
          minify: isProd,
          treeShaking: true,
          legalComments: "none",
          sourcemap: !isProd ? "inline" : false,
          metafile: isDevelopmentServer
        });

        if (isDevelopmentServer && buildResult.metafile) {
          const inputPaths: Set<string> = new Set<string>(
            Object.keys(buildResult.metafile.inputs).map((inputPath: string): string =>
              path.resolve(entryDirectory, inputPath)
            )
          );

          watchedInputPaths.clear();
          for (const inputPath of inputPaths) {
            this.addWatchFile(inputPath);
            watchedInputPaths.add(normalizePathForComparison(inputPath));
          }
        }

        const code = buildResult.outputFiles?.[0]?.text ?? "";
        return `export default ${JSON.stringify(code)};`;
      }
      return null;
    },
    async handleHotUpdate(ctx: HmrContext): Promise<ModuleNode[] | void> {
      const normalizedFilePath: string = normalizePathForComparison(ctx.file);
      const isPageSource: boolean = isPathInDirectory(ctx.file, pageSourceDirectory);
      const isEsbuildInput: boolean = watchedInputPaths.has(normalizedFilePath);

      if (!isDevelopmentServer || (!isPageSource && !isEsbuildInput)) {
        return;
      }

      const mod: ModuleNode | undefined = ctx.server.moduleGraph.getModuleById(
        TABVIEW_BUNDLE_CONSTANTS.RESOLVED_VIRTUAL_MODULE_ID
      );
      if (mod) {
        ctx.server.moduleGraph.invalidateModule(mod);
        return [mod];
      }
    }
  };
}
