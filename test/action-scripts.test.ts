import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptsDir = resolve(__dirname, "../action-scripts");

const FIXTURE_REPORT = {
  overall: "F",
  slopIndex: 91,
  dimensions: {
    phantomImports: "B",
    duplication: "B",
    deadExports: "C",
    secrets: "F",
    dependencyRisk: "A",
  },
  checks: [
    {
      name: "secrets",
      status: "ran",
      findings: [
        {
          rule: "SECRET-001",
          title: "Possible key",
          file: "src/config.js",
          line: 5,
          detail: "...",
        },
      ],
    },
    {
      name: "hallucinated-deps",
      status: "skipped",
      skipReason: "offline mode",
      findings: [],
    },
  ],
};

function withFixture(fn: (reportPath: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "slop-scorecard-action-test-"));
  const reportPath = join(dir, "report.json");
  writeFileSync(reportPath, JSON.stringify(FIXTURE_REPORT), "utf8");
  try {
    fn(reportPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("action-scripts/summarize.mjs", () => {
  it("renders a GITHUB_STEP_SUMMARY-style block with grades and findings", () => {
    withFixture((reportPath) => {
      const out = execFileSync(
        "node",
        [join(scriptsDir, "summarize.mjs"), reportPath],
        { encoding: "utf8" },
      );
      expect(out).toContain("Overall: F");
      expect(out).toContain("91/100");
      expect(out).toContain("Possible key");
      expect(out).toContain("src/config.js:5");
      expect(out).toContain("SKIPPED: offline mode");
    });
  });

  it("renders a --markdown PR-comment variant using a smaller heading", () => {
    withFixture((reportPath) => {
      const out = execFileSync(
        "node",
        [join(scriptsDir, "summarize.mjs"), reportPath, "--markdown"],
        {
          encoding: "utf8",
        },
      );
      expect(out.startsWith("### slop-scorecard")).toBe(true);
    });
  });
});

describe("action-scripts/postComment.mjs", () => {
  it("exits 0 without failing the job when GitHub Actions env vars are absent", () => {
    withFixture((reportPath) => {
      // Explicitly scrub any ambient GH_TOKEN/GITHUB_* so this test is deterministic
      // regardless of the environment it runs in (e.g. inside real CI).
      const env = { ...process.env };
      delete env.GH_TOKEN;
      delete env.GITHUB_REPOSITORY;
      delete env.GITHUB_EVENT_PATH;
      const out = execFileSync(
        "node",
        [join(scriptsDir, "postComment.mjs"), reportPath],
        {
          encoding: "utf8",
          env,
        },
      );
      expect(out).toContain("skipping");
    });
  });
});
