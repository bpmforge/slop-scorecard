import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../src/cli.ts");
const sampleco = resolve(__dirname, "../sample/sampleco");

// Regression test for a real bug found via dogfooding (2026-07-16): the CLI printed a valid
// scorecard to stdout, then crashed with ENOENT writing slop-scorecard-report.json, because
// --out was never created if it didn't already exist -- the normal first-run case for any real
// user (README's own documented usage is `--out <dir>`, not an existing directory). scan.test.ts
// only exercises the scan() library function directly and never caught this because it never
// invokes the actual CLI process end to end.

describe("CLI end-to-end", () => {
  it("creates a fresh --out directory instead of crashing with ENOENT", () => {
    const parent = mkdtempSync(join(tmpdir(), "slop-scorecard-cli-test-"));
    const freshOutDir = join(parent, "does", "not", "exist", "yet"); // deliberately nested + absent
    try {
      const stdout = execFileSync(
        "npx",
        ["tsx", cliPath, sampleco, "--out", freshOutDir, "--offline", "--json"],
        { encoding: "utf8" },
      );

      const parsed = JSON.parse(stdout);
      expect(parsed.overall).toBeDefined();

      expect(existsSync(join(freshOutDir, "slop-scorecard-report.json"))).toBe(
        true,
      );
      expect(existsSync(join(freshOutDir, "slop-scorecard-badge.svg"))).toBe(
        true,
      );

      const written = JSON.parse(
        readFileSync(join(freshOutDir, "slop-scorecard-report.json"), "utf8"),
      );
      expect(written.overall).toBe(parsed.overall);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("still works when --out is omitted (defaults to the scanned directory, which exists)", () => {
    const stdout = execFileSync(
      "npx",
      ["tsx", cliPath, sampleco, "--offline", "--json"],
      {
        encoding: "utf8",
      },
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.overall).toBeDefined();

    // clean up the report files this run drops into sample/sampleco/ itself
    rmSync(join(sampleco, "slop-scorecard-report.json"), { force: true });
    rmSync(join(sampleco, "slop-scorecard-badge.svg"), { force: true });
  });
});
