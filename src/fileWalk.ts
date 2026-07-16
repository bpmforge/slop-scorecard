import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { PackageJson, SourceFile } from "./types.js";

const SCAN_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
]);

async function walkFiles(
  root: string,
  matches: (name: string) => boolean,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(dir, entry.name));
        continue;
      }
      if (matches(entry.name)) results.push(join(dir, entry.name));
    }
  }

  await walk(root);
  return results;
}

export async function walkSourceFiles(root: string): Promise<SourceFile[]> {
  const paths = await walkFiles(root, (name) => {
    const ext = name.slice(name.lastIndexOf("."));
    return SCAN_EXTENSIONS.has(ext);
  });
  return Promise.all(
    paths.map(async (abs) => ({
      relPath: relative(root, abs),
      content: await readFile(abs, "utf8"),
    })),
  );
}

/**
 * Merges dependencies + devDependencies from every package.json found anywhere in the scanned
 * tree (not just the root) into one combined manifest. Without this, any monorepo/workspace
 * project (deps declared per-package, not only at the root) produces a flood of false-positive
 * phantom-import findings for every real dependency declared in a sub-package -- confirmed via
 * dogfooding against real multi-package projects, e.g. a frontend/ package.json declaring
 * "react"/"next"/"@tanstack/react-query" that the root manifest never lists.
 */
export async function discoverMergedPackageManifest(
  root: string,
): Promise<PackageJson> {
  const manifestPaths = await walkFiles(
    root,
    (name) => name === "package.json",
  );
  const merged: PackageJson = { dependencies: {}, devDependencies: {} };

  for (const manifestPath of manifestPaths) {
    try {
      const raw = await readFile(manifestPath, "utf8");
      const pkg = JSON.parse(raw) as PackageJson;
      Object.assign(merged.dependencies!, pkg.dependencies ?? {});
      Object.assign(merged.devDependencies!, pkg.devDependencies ?? {});
    } catch {
      // malformed or unreadable package.json -- skip it, don't fail the whole scan over one file
    }
  }

  return merged;
}
