import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm } from "node:fs/promises";
import { execSync } from "node:child_process";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(artifactDir, "../..");

async function buildAll() {
  console.log("Building community platform frontend...");
  execSync("pnpm --filter @workspace/community-platform exec vite build", {
    cwd: workspaceRoot,
    stdio: "inherit",
  });

  const distDir = path.resolve(artifactDir, "dist");
  await rm(path.resolve(distDir, "server"), { recursive: true, force: true }).catch(() => {});

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "server/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: path.resolve(distDir, "server/server.mjs"),
    logLevel: "info",
    nodePaths: [
      path.resolve(artifactDir, "node_modules"),
      path.resolve(workspaceRoot, "node_modules"),
    ],
    external: [
      "*.node",
      "bcrypt",
      "drizzle-orm",
      "drizzle-orm/*",
      "bufferutil",
      "utf-8-validate",
      "fsevents",
      "ws",
      "lightningcss",
      "sass",
      "sass-embedded",
      "vite",
      "@tailwindcss/vite",
      "tailwindcss",
      "esbuild",
    ],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
    },
  });

  console.log("✓ Community platform build complete");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
