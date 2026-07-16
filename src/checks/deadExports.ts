import type { CheckFinding, CheckResult, SourceFile } from "../types.js";

// Single-name-per-match patterns: `export function X`, `export const X`, `exports.X =`, `module.exports.X =`.
const EXPORT_PATTERNS = [
  /\bexport\s+function\s+([A-Za-z_$][\w$]*)/g,
  /\bexport\s+const\s+([A-Za-z_$][\w$]*)/g,
  /\bexports\.([A-Za-z_$][\w$]*)\s*=/g,
  /\bmodule\.exports\.([A-Za-z_$][\w$]*)\s*=/g,
];

// CommonJS object-shorthand exports: `module.exports = { name1, name2, alias: value }`.
// Handled separately because one match can contain several export names.
const MODULE_EXPORTS_OBJECT_RE = /\bmodule\.exports\s*=\s*\{([^}]*)\}/g;

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function namesFromExportsObject(body: string): string[] {
  return body
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.includes(":") ? entry.split(":")[0].trim() : entry))
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

/** Strips line comments and block comments so a name mentioned only in a comment (e.g. a
 * "// TODO: call X here" note) doesn't count as a real cross-file reference. Naive -- does not
 * understand strings/template literals containing a comment-like sequence, an accepted
 * heuristic-tier tradeoff (documented on the exported check below). */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

/**
 * Heuristic dead-export detector: for every named export, check whether the identifier is
 * referenced anywhere else in the scanned tree. Flags candidates for review -- this is a
 * name-based grep, not a real reference-graph analysis (a genuinely unused name that happens
 * to collide with another identifier elsewhere will read as "used"; conversely an export
 * consumed only from outside the scanned directory reads as "dead"). The paid audit's Dead
 * Code Detector agent (knip/ts-prune-backed) is the rigorous version of this check.
 */
export function checkDeadExports(files: SourceFile[]): CheckResult {
  const findings: CheckFinding[] = [];
  const strippedByPath = new Map(
    files.map((f) => [f.relPath, stripComments(f.content)]),
  );

  for (const file of files) {
    const exported: Array<{ name: string; line: number }> = [];

    for (const re of EXPORT_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(file.content))) {
        exported.push({ name: m[1], line: lineOf(file.content, m.index) });
      }
    }

    MODULE_EXPORTS_OBJECT_RE.lastIndex = 0;
    let om: RegExpExecArray | null;
    while ((om = MODULE_EXPORTS_OBJECT_RE.exec(file.content))) {
      const line = lineOf(file.content, om.index);
      for (const name of namesFromExportsObject(om[1])) {
        exported.push({ name, line });
      }
    }

    const seen = new Set<string>();
    for (const { name, line } of exported) {
      if (seen.has(name)) continue;
      seen.add(name);

      const refPattern = new RegExp(`\\b${name}\\b`, "g");
      let referencedElsewhere = false;
      for (const other of files) {
        if (other.relPath === file.relPath) continue;
        refPattern.lastIndex = 0;
        if (refPattern.test(strippedByPath.get(other.relPath)!)) {
          referencedElsewhere = true;
          break;
        }
      }

      if (!referencedElsewhere) {
        findings.push({
          rule: "SLOP-DEAD-EXPORT",
          title: `Exported "${name}" is not referenced in any other scanned file`,
          file: file.relPath,
          line,
          detail: `No other scanned file imports or calls "${name}". May be dead code, or consumed only outside the scanned directory (heuristic -- verify before deleting).`,
        });
      }
    }
  }
  return { name: "dead-exports", status: "ran", findings };
}
