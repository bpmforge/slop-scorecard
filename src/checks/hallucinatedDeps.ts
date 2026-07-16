import type { CheckFinding, CheckResult, PackageJson } from "../types.js";

/**
 * Checks every declared dependency against the live npm registry. A 404 means the package
 * name does not exist -- either a typo or an AI-hallucinated ("slopsquatted") package name,
 * which is a live supply-chain risk (an attacker can register the exact name).
 *
 * Network-dependent: if the registry is unreachable, this check reports status "skipped" with
 * a reason -- it never silently returns zero findings, which would read as "verified clean"
 * when it actually never ran (the false-clean bug class this project's own methodology exists
 * to catch).
 */
export async function checkHallucinatedDeps(
  pkg: PackageJson,
  opts: { timeoutMs?: number } = {},
): Promise<CheckResult> {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const names = Object.keys(deps);
  if (names.length === 0) {
    return { name: "hallucinated-deps", status: "ran", findings: [] };
  }

  const findings: CheckFinding[] = [];
  const timeoutMs = opts.timeoutMs ?? 5000;

  try {
    for (const name of names) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(
          `https://registry.npmjs.org/${encodeURIComponent(name)}`,
          {
            signal: controller.signal,
          },
        );
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 404) {
        findings.push({
          rule: "SLOP-HALLUCINATED-DEP",
          title: `"${name}" does not exist on the npm registry`,
          detail: `package.json declares "${name}" but it returns 404 from registry.npmjs.org. Classic slopsquatting signature -- verify the intended package name, or remove it if unused. If an attacker registers this exact name, the next install runs their code.`,
        });
      } else if (!res.ok) {
        findings.push({
          rule: "SLOP-HALLUCINATED-DEP-UNCERTAIN",
          title: `Could not verify "${name}" on the npm registry (HTTP ${res.status})`,
          detail: `Registry lookup returned an unexpected status; re-run to confirm.`,
        });
      }
    }
  } catch (err) {
    return {
      name: "hallucinated-deps",
      status: "skipped",
      skipReason: `npm registry unreachable: ${err instanceof Error ? err.message : String(err)}`,
      findings: [],
    };
  }

  return { name: "hallucinated-deps", status: "ran", findings };
}
