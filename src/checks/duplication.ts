import type { CheckFinding, CheckResult, SourceFile } from "../types.js";

const WINDOW_LINES = 5; // minimum consecutive normalized lines to count as a duplicate block
const MIN_LINE_LEN = 8; // ignore near-empty/boilerplate lines (braces, blank) when normalizing

interface NormalizedLine {
  text: string;
  originalLine: number;
}

function normalize(content: string): NormalizedLine[] {
  return content
    .split("\n")
    .map((text, i) => ({ text: text.trim(), originalLine: i + 1 }))
    .filter((l) => l.text.length >= MIN_LINE_LEN && !l.text.startsWith("//"));
}

function hashWindow(lines: NormalizedLine[], start: number): string {
  return lines
    .slice(start, start + WINDOW_LINES)
    .map((l) => l.text)
    .join("\n");
}

/**
 * Naive n-gram duplication detector: hashes sliding windows of WINDOW_LINES normalized lines
 * per file, then flags any window hash that recurs in a different file or a non-overlapping
 * location in the same file. This is a heuristic (no AST, no token normalization) -- the paid
 * audit's Duplication Detector agent + jscpd give a more rigorous density measure.
 */
export function checkDuplication(files: SourceFile[]): CheckResult {
  const windowsByHash = new Map<
    string,
    Array<{ file: string; line: number }>
  >();
  let totalNormalizedLines = 0;

  for (const file of files) {
    const lines = normalize(file.content);
    totalNormalizedLines += lines.length;
    for (let i = 0; i + WINDOW_LINES <= lines.length; i++) {
      const hash = hashWindow(lines, i);
      const loc = { file: file.relPath, line: lines[i].originalLine };
      const list = windowsByHash.get(hash) ?? [];
      list.push(loc);
      windowsByHash.set(hash, list);
    }
  }

  const findings: CheckFinding[] = [];
  let duplicatedWindowCount = 0;
  for (const [, locs] of windowsByHash) {
    const distinctFiles = new Set(locs.map((l) => l.file));
    const isDuplicate = distinctFiles.size > 1 || locs.length > 1;
    if (!isDuplicate) continue;
    duplicatedWindowCount++;
    if (findings.length < 20) {
      const sites = locs.map((l) => `${l.file}:${l.line}`).join(", ");
      findings.push({
        rule: "SLOP-DUPLICATION",
        title: `Duplicated ${WINDOW_LINES}+ line block across ${locs.length} location(s)`,
        detail: `Near-identical code found at: ${sites}. Consider extracting a shared function/module.`,
      });
    }
  }

  const densityPct =
    totalNormalizedLines > 0
      ? Math.min(
          100,
          Math.round((duplicatedWindowCount / totalNormalizedLines) * 100),
        )
      : 0;

  if (findings.length > 0) {
    findings.unshift({
      rule: "SLOP-DUPLICATION-SUMMARY",
      title: `Estimated duplication density: ${densityPct}%`,
      detail: `${duplicatedWindowCount} duplicated ${WINDOW_LINES}-line window(s) out of ${totalNormalizedLines} normalized lines scanned. Heuristic measure, not a byte-for-byte clone tool.`,
    });
  }

  return { name: "duplication", status: "ran", findings, meta: { densityPct } };
}
