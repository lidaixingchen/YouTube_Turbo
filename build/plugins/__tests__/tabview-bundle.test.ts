import { mkdir, mkdtemp, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import * as path from "node:path";
import type { HotPayload, ModuleNode, ViteDevServer } from "vite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TABVIEW_BUNDLE_CONSTANTS } from "../constants";

const WATCH_WAIT_TIMEOUT_MS: number = 5000;
const WATCH_POLL_INTERVAL_MS: number = 20;
const VITE_INTEGRATION_TEST_TIMEOUT_MS: number = WATCH_WAIT_TIMEOUT_MS * 6;
const FIXTURE_DIRECTORY_PREFIX: string = ".tabview-hmr-test-";
const INITIAL_DEPENDENCY_VALUE: string = "initial-page-dependency";
const UPDATED_DEPENDENCY_VALUE: string = "updated-page-dependency";
const NEW_DEPENDENCY_VALUE: string = "new-page-dependency";
const UPDATED_NEW_DEPENDENCY_VALUE: string = "updated-new-page-dependency";
const originalTextEncoder: typeof TextEncoder = globalThis.TextEncoder;

type CreateServer = typeof import("vite").createServer;
type InlineTabviewPagePlugin = typeof import("../tabview-bundle").inlineTabviewPagePlugin;
type IsPathInDirectory = typeof import("../tabview-bundle").isPathInDirectory;
type TransformResult = NonNullable<Awaited<ReturnType<ViteDevServer["transformRequest"]>>>;

interface TestProject {
  readonly rootDirectory: string;
  readonly viteRootDirectory: string;
  readonly pageSourceDirectory: string;
  readonly entryPath: string;
  readonly mainPath: string;
  readonly initialDependencyPath: string;
}

describe("tabview page bundle plugin", (): void => {
  const activeProjects: TestProject[] = [];
  const activeServers: ViteDevServer[] = [];
  let createServerForTest: CreateServer | null = null;
  let inlineTabviewPagePluginForTest: InlineTabviewPagePlugin | null = null;
  let isPathInDirectoryForTest: IsPathInDirectory | null = null;

  beforeAll(async (): Promise<void> => {
    class RealmCompatibleTextEncoder extends originalTextEncoder {
      public override encode(input?: string): Uint8Array<ArrayBuffer> {
        const encoded: Uint8Array<ArrayBufferLike> = super.encode(input);
        const compatibleEncoded: Uint8Array<ArrayBuffer> = new Uint8Array(encoded.byteLength);
        compatibleEncoded.set(encoded);
        return compatibleEncoded;
      }
    }

    globalThis.TextEncoder = RealmCompatibleTextEncoder;

    const [viteModule, pluginModule]: [typeof import("vite"), typeof import("../tabview-bundle")] = await Promise.all([
      import("vite"),
      import("../tabview-bundle")
    ]);
    createServerForTest = viteModule.createServer;
    inlineTabviewPagePluginForTest = pluginModule.inlineTabviewPagePlugin;
    isPathInDirectoryForTest = pluginModule.isPathInDirectory;
  });

  afterEach(async (): Promise<void> => {
    for (const server of activeServers.splice(0)) {
      await server.close();
    }
    for (const project of activeProjects.splice(0)) {
      await removeTestProject(project);
    }
  });

  afterAll((): void => {
    globalThis.TextEncoder = originalTextEncoder;
  });

  it("normalizes Windows paths and enforces directory boundaries", (): void => {
    const sourceDirectory: string = "C:\\repo\\src\\features\\tabview\\page";

    if (!isPathInDirectoryForTest) {
      throw new Error("The path matcher was not loaded");
    }

    expect(
      isPathInDirectoryForTest("c:/repo/src/features/tabview/page/index.ts", sourceDirectory)
    ).toBe(true);
    expect(
      isPathInDirectoryForTest("C:\\repo\\src\\features\\tabview\\page\\nested\\panel.ts", sourceDirectory)
    ).toBe(true);
    expect(
      isPathInDirectoryForTest("C:\\repo\\src\\features\\tabview\\page-extra\\panel.ts", sourceDirectory)
    ).toBe(false);
    expect(
      isPathInDirectoryForTest("C:\\repo\\src\\features\\tabview\\Page\\panel.ts", sourceDirectory)
    ).toBe(true);
    expect(
      isPathInDirectoryForTest(
        "/repo/src/features/tabview/page/./nested/../panel.ts",
        "/repo/src/features/tabview/page"
      )
    ).toBe(true);
    expect(
      isPathInDirectoryForTest("/repo/src/features/tabview/page-extra/panel.ts", "/repo/src/features/tabview/page")
    ).toBe(false);
  });

  it("watches changed and newly added esbuild inputs and refreshes the virtual module", async (): Promise<void> => {
    const project: TestProject = await createTestProject();
    activeProjects.push(project);
    if (!createServerForTest || !inlineTabviewPagePluginForTest) {
      throw new Error("Vite test dependencies were not loaded");
    }

    const server: ViteDevServer = await createServerForTest({
      appType: "custom",
      configFile: false,
      logLevel: "silent",
      plugins: [inlineTabviewPagePluginForTest({ entryPath: project.entryPath })],
      root: project.viteRootDirectory,
      server: {
        fs: {
          allow: [project.rootDirectory]
        },
        watch: {
          interval: WATCH_POLL_INTERVAL_MS,
          usePolling: true
        }
      }
    });
    activeServers.push(server);

    const hotPayloads: HotPayload[] = [];
    const watcherEvents: string[] = [];
    const clientHotChannel = server.environments.client.hot;
    const originalHotSend: (payload: HotPayload) => void = clientHotChannel.send.bind(clientHotChannel);
    clientHotChannel.send = (payload: HotPayload): void => {
      hotPayloads.push(payload);
      originalHotSend(payload);
    };
    server.watcher.on("change", (filePath: string): void => {
      watcherEvents.push(`change:${filePath}`);
    });

    const initialBundle: string = await loadPageBundle(server);
    expect(initialBundle).toContain(INITIAL_DEPENDENCY_VALUE);
    await waitFor(
      (): boolean => isFileWatched(server, project.initialDependencyPath),
      "The initial esbuild dependency was not registered with Vite's watcher"
    );

    let payloadOffset: number = hotPayloads.length;
    await writeFile(
      project.initialDependencyPath,
      `export const pageValue: string = ${JSON.stringify(UPDATED_DEPENDENCY_VALUE)};`,
      "utf8"
    );
    server.watcher.emit("change", project.initialDependencyPath);
    await waitForFullReload(hotPayloads, payloadOffset, watcherEvents);

    const updatedBundle: string = await loadPageBundle(server);
    expect(updatedBundle).toContain(UPDATED_DEPENDENCY_VALUE);

    const addedDependencyPath: string = path.join(project.pageSourceDirectory, "added-dependency.ts");
    await writeFile(
      addedDependencyPath,
      `export const addedValue: string = ${JSON.stringify(NEW_DEPENDENCY_VALUE)};`,
      "utf8"
    );

    await writeFile(
      project.entryPath,
      `import { addedValue } from "./added-dependency.ts";\n(globalThis as Record<string, unknown>).__TABVIEW_TEST__ = addedValue;`,
      "utf8"
    );
    payloadOffset = hotPayloads.length;
    server.watcher.emit("change", project.entryPath);
    await waitForFullReload(hotPayloads, payloadOffset, watcherEvents);

    const bundleWithAddedDependency: string = await loadPageBundle(server);
    expect(bundleWithAddedDependency).toContain(NEW_DEPENDENCY_VALUE);
    await waitFor(
      (): boolean => isFileWatched(server, addedDependencyPath),
      "The newly discovered esbuild dependency was not registered with Vite's watcher"
    );

    payloadOffset = hotPayloads.length;
    await writeFile(
      addedDependencyPath,
      `export const addedValue: string = ${JSON.stringify(UPDATED_NEW_DEPENDENCY_VALUE)};`,
      "utf8"
    );
    server.watcher.emit("change", addedDependencyPath);
    await waitForFullReload(hotPayloads, payloadOffset, watcherEvents);

    const refreshedBundle: string = await loadPageBundle(server);
    expect(refreshedBundle).toContain(UPDATED_NEW_DEPENDENCY_VALUE);
  }, VITE_INTEGRATION_TEST_TIMEOUT_MS);
});

async function createTestProject(): Promise<TestProject> {
  const rootDirectory: string = await mkdtemp(path.join(process.cwd(), FIXTURE_DIRECTORY_PREFIX));
  const viteRootDirectory: string = path.join(rootDirectory, "vite-root");
  const pageSourceDirectory: string = path.join(rootDirectory, "page-source");
  const entryPath: string = path.join(pageSourceDirectory, "index.ts");
  const mainPath: string = path.join(viteRootDirectory, "main.ts");
  const initialDependencyPath: string = path.join(pageSourceDirectory, "initial-dependency.ts");

  await mkdir(viteRootDirectory);
  await mkdir(pageSourceDirectory);
  await writeFile(
    mainPath,
    `import pageBundle from "${TABVIEW_BUNDLE_CONSTANTS.VIRTUAL_MODULE_ID}";\nconsole.log(pageBundle);`,
    "utf8"
  );
  await writeFile(
    entryPath,
    `import { pageValue } from "./initial-dependency.ts";\n(globalThis as Record<string, unknown>).__TABVIEW_TEST__ = pageValue;`,
    "utf8"
  );
  await writeFile(
    initialDependencyPath,
    `export const pageValue: string = ${JSON.stringify(INITIAL_DEPENDENCY_VALUE)};`,
    "utf8"
  );

  return {
    rootDirectory,
    viteRootDirectory,
    pageSourceDirectory,
    entryPath,
    mainPath,
    initialDependencyPath,
  };
}

async function removeTestProject(project: TestProject): Promise<void> {
  await removeDirectoryContents(project.viteRootDirectory);
  await removeDirectoryContents(project.pageSourceDirectory);
  await rmdir(project.pageSourceDirectory);
  await rmdir(project.viteRootDirectory);
  await rmdir(project.rootDirectory);
}

async function removeDirectoryContents(directoryPath: string): Promise<void> {
  const entries: Dirent[] = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath: string = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await removeDirectoryContents(entryPath);
      await rmdir(entryPath);
    } else {
      await unlink(entryPath);
    }
  }
}

async function loadPageBundle(server: ViteDevServer): Promise<string> {
  const mainModule: TransformResult | null = await server.transformRequest("/main.ts");
  if (!mainModule) {
    throw new Error("Vite did not transform the fixture entry module");
  }

  const virtualModule: ModuleNode | undefined = server.moduleGraph.getModuleById(
    TABVIEW_BUNDLE_CONSTANTS.RESOLVED_VIRTUAL_MODULE_ID
  );
  if (!virtualModule) {
    throw new Error("Vite did not add the virtual page bundle to its module graph");
  }

  const bundleModule: TransformResult | null = await server.transformRequest(virtualModule.url);
  if (!bundleModule) {
    throw new Error("Vite did not load the virtual page bundle");
  }

  return bundleModule.code;
}

async function waitForFullReload(
  payloads: HotPayload[],
  offset: number,
  watcherEvents: string[]
): Promise<void> {
  await waitFor(
    (): boolean => payloads.length > offset,
    `Vite did not publish an HMR event; watcher events: ${watcherEvents.join(", ")}`
  );
  const payloadTypes: string[] = payloads.slice(offset).map((payload: HotPayload): string => payload.type);
  expect(payloadTypes).toContain("full-reload");
}

async function waitFor(predicate: () => boolean, failureMessage: string): Promise<void> {
  const deadline: number = Date.now() + WATCH_WAIT_TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(failureMessage);
    }
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, WATCH_POLL_INTERVAL_MS);
    });
  }
}

function isFileWatched(server: ViteDevServer, filePath: string): boolean {
  const watchedFiles: Record<string, string[]> = server.watcher.getWatched();
  return Object.entries(watchedFiles).some(([directoryPath, fileNames]: [string, string[]]): boolean =>
    fileNames.some((fileName: string): boolean =>
      path.resolve(directoryPath, fileName) === path.resolve(filePath)
    )
  );
}
