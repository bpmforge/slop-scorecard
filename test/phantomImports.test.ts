import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPhantomImports } from "../src/checks/phantomImports.js";
import { discoverMergedPackageManifest } from "../src/fileWalk.js";
import type { SourceFile } from "../src/types.js";

// Regression tests for three real false-positive bugs found via dogfooding against 14 real
// repos (2026-07-16). Against one real monorepo, the un-fixed checker produced 3,483 "phantom
// import" findings across 107 unique names -- nearly all false positives from these three
// causes compounding together.

describe("checkPhantomImports — builtin subpath imports", () => {
  it("does not flag Node builtin subpaths like fs/promises, stream/promises", () => {
    const files: SourceFile[] = [
      {
        relPath: "a.mjs",
        content: `import fs from 'fs/promises';\nimport { pipeline } from 'stream/promises';\nimport posix from 'path/posix';`,
      },
    ];
    const result = checkPhantomImports(files, {});
    expect(result.findings).toHaveLength(0);
  });

  it("still flags a genuine phantom import that merely resembles a builtin prefix", () => {
    const files: SourceFile[] = [
      {
        relPath: "a.mjs",
        content: `import x from 'fsx-totally-not-real-package';`,
      },
    ];
    const result = checkPhantomImports(files, {});
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toContain("fsx-totally-not-real-package");
  });
});

describe("checkPhantomImports — @/ path aliases", () => {
  it("does not flag @/ prefixed specifiers as scoped npm packages", () => {
    const files: SourceFile[] = [
      {
        relPath: "a.tsx",
        content: `import { Button } from '@/components/Button';\nimport { useStore } from '@/stores';`,
      },
    ];
    const result = checkPhantomImports(files, {});
    expect(result.findings).toHaveLength(0);
  });

  it("still flags a genuine undeclared scoped npm package", () => {
    const files: SourceFile[] = [
      {
        relPath: "a.tsx",
        content: `import { z } from '@some-scope/not-declared';`,
      },
    ];
    const result = checkPhantomImports(files, {});
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toContain("@some-scope/not-declared");
  });
});

describe("discoverMergedPackageManifest — monorepo workspace packages", () => {
  it("merges dependencies from every package.json in the scanned tree, not just the root", async () => {
    const root = mkdtempSync(join(tmpdir(), "slop-scorecard-monorepo-test-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "root", dependencies: { turbo: "^2.0.0" } }),
      );
      mkdirSync(join(root, "frontend"), { recursive: true });
      writeFileSync(
        join(root, "frontend", "package.json"),
        JSON.stringify({
          name: "frontend",
          dependencies: { react: "^19.0.0", next: "^15.0.0" },
        }),
      );
      mkdirSync(join(root, "backend"), { recursive: true });
      writeFileSync(
        join(root, "backend", "package.json"),
        JSON.stringify({
          name: "backend",
          dependencies: { fastify: "^5.0.0" },
        }),
      );

      const merged = await discoverMergedPackageManifest(root);
      expect(Object.keys(merged.dependencies!).sort()).toEqual(
        ["fastify", "next", "react", "turbo"].sort(),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a dependency declared only in a sub-package is not flagged as a phantom import at the root scan", async () => {
    const root = mkdtempSync(join(tmpdir(), "slop-scorecard-monorepo-test2-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "root" }),
      );
      mkdirSync(join(root, "frontend"), { recursive: true });
      writeFileSync(
        join(root, "frontend", "package.json"),
        JSON.stringify({
          name: "frontend",
          dependencies: { "@tanstack/react-query": "^5.0.0" },
        }),
      );
      writeFileSync(
        join(root, "frontend", "app.tsx"),
        `import { useQuery } from '@tanstack/react-query';`,
      );

      const pkg = await discoverMergedPackageManifest(root);
      const files: SourceFile[] = [
        {
          relPath: "frontend/app.tsx",
          content: `import { useQuery } from '@tanstack/react-query';`,
        },
      ];
      const result = checkPhantomImports(files, pkg);
      expect(result.findings).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
