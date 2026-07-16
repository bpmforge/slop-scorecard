import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SourceFile } from "./types.js";

const SCAN_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
]);

export async function walkSourceFiles(root: string): Promise<SourceFile[]> {
  const results: SourceFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(dir, entry.name));
        continue;
      }
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      const abs = join(dir, entry.name);
      const content = await readFile(abs, "utf8");
      results.push({ relPath: relative(root, abs), content });
    }
  }

  await walk(root);
  return results;
}
