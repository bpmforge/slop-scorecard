import type { CheckFinding, CheckResult, SourceFile } from "../types.js";

// Common secret-shape patterns. Deliberately pattern-based (not entropy-based) to keep this
// deterministic, fast, and dependency-free -- a superset of these is what the paid audit's
// Secrets Scanner agent additionally verifies with more context.
const PATTERNS: Array<{ rule: string; label: string; re: RegExp }> = [
  {
    rule: "SECRET-001",
    label: "Stripe-style secret key",
    re: /\bsk_live_[A-Za-z0-9]{16,}/g,
  },
  {
    rule: "SECRET-002",
    label: "AWS access key ID",
    re: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    rule: "SECRET-003",
    label: "GitHub personal access token",
    re: /\bghp_[A-Za-z0-9]{36}\b/g,
  },
  {
    rule: "SECRET-004",
    label: "Slack token",
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    rule: "SECRET-005",
    label: "PEM private key block",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    rule: "SECRET-006",
    label: "hardcoded secret-shaped assignment",
    re: /\b(apiKey|api_key|secret|jwtSecret|jwt_secret|password|passwd)\s*[:=]\s*["'][^"'$]{8,}["']/gi,
  },
];

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export function checkSecrets(files: SourceFile[]): CheckResult {
  const findings: CheckFinding[] = [];
  for (const file of files) {
    for (const { rule, label, re } of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(file.content))) {
        findings.push({
          rule,
          title: `Possible ${label}`,
          file: file.relPath,
          line: lineOf(file.content, m.index),
          detail: `Matched pattern for ${label}. Rotate immediately if this is a real credential and move it to an environment variable / secret manager.`,
        });
      }
    }
  }
  return { name: "secrets", status: "ran", findings };
}
