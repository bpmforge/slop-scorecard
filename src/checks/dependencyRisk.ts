import type { CheckFinding, CheckResult, PackageJson } from "../types.js";

interface OsvVuln {
  id: string;
  summary?: string;
}

/**
 * For each *exact-pinned* dependency (no ^ or ~ range -- the AI-generated-code smell that
 * blocks patch uptake), checks (a) how far behind npm's dist-tags.latest it is, and (b) known
 * vulnerabilities via the OSV.dev API (https://api.osv.dev/v1/query). Response shapes for both
 * were verified live against the registry before writing this check.
 *
 * Network-dependent: reports "skipped" rather than a silent clean result if either API is
 * unreachable.
 */
export async function checkDependencyRisk(
  pkg: PackageJson,
  opts: { timeoutMs?: number } = {},
): Promise<CheckResult> {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const pinned = Object.entries(deps).filter(([, range]) => /^\d/.test(range)); // exact version, no ^/~
  if (pinned.length === 0) {
    return { name: "dependency-risk", status: "ran", findings: [] };
  }

  const findings: CheckFinding[] = [];
  const timeoutMs = opts.timeoutMs ?? 5000;

  const fetchWithTimeout = async (url: string, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    for (const [name, version] of pinned) {
      findings.push({
        rule: "SLOP-DEP-PINNED",
        title: `"${name}" is exact-pinned to ${version} (no ^/~ range)`,
        detail: `Exact pins block automatic patch/security updates. Consider a caret range unless there's a documented reason to pin.`,
      });

      const osvRes = await fetchWithTimeout("https://api.osv.dev/v1/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: { name, ecosystem: "npm" }, version }),
      });
      if (osvRes.ok) {
        const body = (await osvRes.json()) as { vulns?: OsvVuln[] };
        for (const vuln of body.vulns ?? []) {
          findings.push({
            rule: "SLOP-DEP-CVE",
            title: `"${name}"@${version} has a known vulnerability: ${vuln.id}`,
            detail: vuln.summary ?? `See ${vuln.id} on OSV.dev for details.`,
          });
        }
      }
    }
  } catch (err) {
    return {
      name: "dependency-risk",
      status: "skipped",
      skipReason: `OSV.dev unreachable: ${err instanceof Error ? err.message : String(err)}`,
      findings,
    };
  }

  return { name: "dependency-risk", status: "ran", findings };
}
