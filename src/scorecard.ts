import type { CheckResult, Grade, Scorecard } from "./types.js";

function gradeFromThresholds(
  value: number,
  thresholds: [number, number, number, number],
): Grade {
  const [a, b, c, d] = thresholds; // ascending "bad" thresholds -> worse grade
  if (value <= a) return "A";
  if (value <= b) return "B";
  if (value <= c) return "C";
  if (value <= d) return "D";
  return "F";
}

function findByName(
  checks: CheckResult[],
  name: string,
): CheckResult | undefined {
  return checks.find((c) => c.name === name);
}

function countByRulePrefix(
  check: CheckResult | undefined,
  prefix: string,
): number {
  if (!check || check.status === "skipped") return 0;
  return check.findings.filter((f) => f.rule.startsWith(prefix)).length;
}

export function buildScorecard(checks: CheckResult[]): Scorecard {
  const phantom = findByName(checks, "phantom-imports");
  const dup = findByName(checks, "duplication");
  const dead = findByName(checks, "dead-exports");
  const secrets = findByName(checks, "secrets");
  const hallucinated = findByName(checks, "hallucinated-deps");
  const depRisk = findByName(checks, "dependency-risk");

  const phantomCount = phantom?.findings.length ?? 0;
  const deadCount = dead?.findings.length ?? 0;
  const secretsCount = secrets?.findings.length ?? 0;
  const densityPct = dup?.meta?.densityPct ?? 0;
  const hallucinatedCount = countByRulePrefix(
    hallucinated,
    "SLOP-HALLUCINATED-DEP",
  );
  const cveCount = countByRulePrefix(depRisk, "SLOP-DEP-CVE");
  const pinnedCount = countByRulePrefix(depRisk, "SLOP-DEP-PINNED");

  const dimensions: Scorecard["dimensions"] = {
    phantomImports: gradeFromThresholds(phantomCount, [0, 1, 2, 4]),
    duplication: gradeFromThresholds(densityPct, [3, 8, 15, 25]),
    deadExports: gradeFromThresholds(deadCount, [1, 3, 6, 10]),
    secrets: secretsCount > 0 ? "F" : "A",
    dependencyRisk: gradeFromThresholds(
      hallucinatedCount * 3 + cveCount * 2 + pinnedCount * 0.2,
      [0, 1, 3, 6],
    ),
  };

  // AI-Slop Index: weighted composite, 0-100, lower is better -- same convention as
  // docs/METHODOLOGY.md's scorecard (the paid audit's dimension of the same name).
  const slopIndex = Math.min(
    100,
    Math.round(
      phantomCount * 8 +
        deadCount * 4 +
        densityPct * 1.2 +
        hallucinatedCount * 15 +
        secretsCount * 20 +
        cveCount * 10,
    ),
  );

  const gradeOrder: Grade[] = ["A", "B", "C", "D", "F"];
  const worstDimension = Object.values(dimensions).reduce(
    (worst, g) =>
      gradeOrder.indexOf(g) > gradeOrder.indexOf(worst) ? g : worst,
    "A" as Grade,
  );

  return {
    overall: worstDimension,
    slopIndex,
    dimensions,
    checks,
  };
}
