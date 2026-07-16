#!/usr/bin/env node
// Renders a slop-scorecard-report.json into markdown -- either for $GITHUB_STEP_SUMMARY
// (default) or, with --markdown, a slightly more compact form suited to a PR comment.
// Plain Node, no dependencies (matches the tool's zero-dep design).
import { readFileSync } from "node:fs";

const [, , reportPath, mode] = process.argv;
if (!reportPath) {
  console.error("Usage: summarize.mjs <report.json> [--markdown]");
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const forComment = mode === "--markdown";

const lines = [];
lines.push(forComment ? "### slop-scorecard\n" : "## slop-scorecard\n");
lines.push(
  `**Overall: ${report.overall}** &nbsp;·&nbsp; AI-Slop Index: **${report.slopIndex}/100** (lower is better)\n`,
);

lines.push("| Dimension | Grade |");
lines.push("|---|---|");
for (const [dim, grade] of Object.entries(report.dimensions)) {
  lines.push(`| ${dim} | ${grade} |`);
}
lines.push("");

for (const check of report.checks) {
  if (check.status === "skipped") {
    lines.push(`> ⚠ **${check.name}** was SKIPPED: ${check.skipReason}\n`);
    continue;
  }
  if (check.findings.length === 0) continue;
  lines.push(`<details><summary>${check.name} (${check.findings.length})</summary>\n`);
  for (const f of check.findings.slice(0, 15)) {
    const loc = f.file ? ` \`${f.file}${f.line ? ":" + f.line : ""}\`` : "";
    lines.push(`- ${f.title}${loc}`);
  }
  if (check.findings.length > 15) lines.push(`- ... and ${check.findings.length - 15} more`);
  lines.push("\n</details>\n");
}

lines.push(
  "---\n_The paid [CodeReckon](https://codereckon.com) audit substantiates every number here: human-verified findings, attack-chain analysis, and a decision-grade report._",
);

console.log(lines.join("\n"));
