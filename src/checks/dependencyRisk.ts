import type { CheckFinding, CheckResult, PackageJson } from "../types.js";
import type { LockedVersions } from "../lockfiles.js";

interface OsvVuln {
  id: string;
  summary?: string;
}

/** One OSV.dev lookup: a version of a declared dependency, and where that version came from. */
interface Lookup {
  name: string;
  version: string;
  source: "pinned" | "lockfile" | "range-floor";
  range: string;
}

class OsvHttpError extends Error {
  constructor(
    readonly status: number,
    readonly target: string,
  ) {
    super(`OSV.dev returned HTTP ${status} for ${target}`);
  }
}

/**
 * Lowest version a simple range admits: "^1.2.3", "~1.2", ">=1.2.3", "1.2.x" -> "1.2.0" etc.
 * Returns undefined for anything else (unions, "*", "latest", git/file/workspace specs, npm:
 * aliases) -- those aren't guessed at.
 */
export function rangeFloor(range: string): string | undefined {
  const m = /^(?:\^|~|>=\s*)?v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(range.trim());
  if (!m) return undefined;
  const part = (p: string | undefined) => (p === undefined || /[xX*]/.test(p) ? "0" : p);
  return `${m[1]}.${part(m[2])}.${part(m[3])}`;
}

/**
 * Looks up known vulnerabilities via the OSV.dev API (https://api.osv.dev/v1/query) for every
 * declared dependency, choosing the version to check in this order:
 *
 * 1. Exact pin ("1.2.3") -- also flagged itself, since a pin blocks patch uptake
 *    (SLOP-DEP-PINNED). CVEs are SLOP-DEP-CVE.
 * 2. Versions a lockfile in the tree resolved the dependency to -- what is actually installed.
 *    CVEs are SLOP-DEP-CVE.
 * 3. No lockfile entry: the floor of a simple range ("^4.16.0" -> 4.16.0). A fresh install may
 *    well get a fixed version, so these are SLOP-DEP-RANGE-CVE, weighted lower: the range
 *    still *permits* a vulnerable version, and raising the floor is the fix.
 *
 * There is no staleness (dist-tags.latest) comparison. Network-dependent: reports "skipped"
 * rather than a silent clean result if OSV.dev is unreachable or answers with a non-OK HTTP
 * status. A 4xx/5xx carries no vulnerability data, so treating it as "no CVEs" would be a false
 * clean.
 */
export async function checkDependencyRisk(
  pkg: PackageJson,
  opts: { timeoutMs?: number; locked?: LockedVersions; concurrency?: number } = {},
): Promise<CheckResult> {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const locked = opts.locked ?? new Map<string, Set<string>>();
  const findings: CheckFinding[] = [];
  const lookups: Lookup[] = [];

  for (const [name, range] of Object.entries(deps)) {
    if (/^\d/.test(range)) {
      findings.push({
        rule: "SLOP-DEP-PINNED",
        title: `"${name}" is exact-pinned to ${range} (no ^/~ range)`,
        detail: `Exact pins block automatic patch/security updates. Consider a caret range unless there's a documented reason to pin.`,
      });
      lookups.push({ name, version: range, source: "pinned", range });
      continue;
    }
    const versions = locked.get(name);
    if (versions?.size) {
      for (const version of versions) lookups.push({ name, version, source: "lockfile", range });
      continue;
    }
    const floor = rangeFloor(range);
    if (floor) lookups.push({ name, version: floor, source: "range-floor", range });
  }

  if (lookups.length === 0) {
    return { name: "dependency-risk", status: "ran", findings };
  }

  const timeoutMs = opts.timeoutMs ?? 5000;
  const query = async ({ name, version }: Lookup): Promise<OsvVuln[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package: { name, ecosystem: "npm" }, version }),
        signal: controller.signal,
      });
      if (!res.ok) throw new OsvHttpError(res.status, `${name}@${version}`);
      const body = (await res.json()) as { vulns?: OsvVuln[] };
      return body.vulns ?? [];
    } finally {
      clearTimeout(timer);
    }
  };

  // Every declared dependency is a lookup now, not just pins, so they run a few at a time.
  const results: OsvVuln[][] = new Array(lookups.length);
  let next = 0;
  const worker = async () => {
    while (next < lookups.length) {
      const i = next++;
      results[i] = await query(lookups[i]);
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(opts.concurrency ?? 6, lookups.length) }, worker),
    );
  } catch (err) {
    return {
      name: "dependency-risk",
      status: "skipped",
      skipReason:
        err instanceof OsvHttpError
          ? err.message
          : `OSV.dev unreachable: ${err instanceof Error ? err.message : String(err)}`,
      findings,
    };
  }

  lookups.forEach(({ name, version, source, range }, i) => {
    for (const vuln of results[i]) {
      if (source === "range-floor") {
        findings.push({
          rule: "SLOP-DEP-RANGE-CVE",
          title: `"${name}" range ${range} allows ${version}, which has a known vulnerability: ${vuln.id}`,
          detail: `${vuln.summary ?? `See ${vuln.id} on OSV.dev for details.`} No lockfile pins this dependency, so an install may resolve to a fixed version -- raise the range floor past the fix to rule the vulnerable one out.`,
        });
      } else {
        findings.push({
          rule: "SLOP-DEP-CVE",
          title: `"${name}"@${version}${source === "lockfile" ? " (locked)" : ""} has a known vulnerability: ${vuln.id}`,
          detail: vuln.summary ?? `See ${vuln.id} on OSV.dev for details.`,
        });
      }
    }
  });

  return { name: "dependency-risk", status: "ran", findings };
}
