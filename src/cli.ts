#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scan } from "./index.js";
import { renderBadge } from "./badge.js";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const target = resolve(
    process.argv[2] && !process.argv[2].startsWith("--")
      ? process.argv[2]
      : ".",
  );
  const outDir = resolve(argValue("--out") ?? target);
  const offline = hasFlag("--offline");
  const json = hasFlag("--json");

  const scorecard = await scan(target, { offline });

  if (json) {
    console.log(JSON.stringify(scorecard, null, 2));
  } else {
    console.log(`\nslop-scorecard — ${target}\n`);
    console.log(
      `Overall: ${scorecard.overall}   AI-Slop Index: ${scorecard.slopIndex}/100 (lower is better)\n`,
    );
    for (const [dim, grade] of Object.entries(scorecard.dimensions)) {
      console.log(`  ${dim.padEnd(16)} ${grade}`);
    }
    console.log("");
    for (const check of scorecard.checks) {
      if (check.status === "skipped") {
        console.log(`⚠ ${check.name}: SKIPPED (${check.skipReason})`);
        continue;
      }
      if (check.findings.length === 0) continue;
      console.log(`\n${check.name} (${check.findings.length}):`);
      for (const f of check.findings.slice(0, 10)) {
        const loc = f.file ? ` [${f.file}${f.line ? ":" + f.line : ""}]` : "";
        console.log(`  - ${f.title}${loc}`);
      }
      if (check.findings.length > 10)
        console.log(`  ... and ${check.findings.length - 10} more`);
    }
    console.log(
      `\nThe paid audit substantiates every number: human-verified findings, attack-chain analysis, and a decision-grade report. https://codereckon.com\n`,
    );
  }

  await writeFile(
    resolve(outDir, "slop-scorecard-report.json"),
    JSON.stringify(scorecard, null, 2),
    "utf8",
  );
  const badge = renderBadge(
    "slop-score",
    scorecard.overall,
    scorecard.slopIndex,
  );
  await writeFile(resolve(outDir, "slop-scorecard-badge.svg"), badge, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
