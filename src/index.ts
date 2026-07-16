import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { walkSourceFiles } from "./fileWalk.js";
import { checkSecrets } from "./checks/secrets.js";
import { checkPhantomImports } from "./checks/phantomImports.js";
import { checkDuplication } from "./checks/duplication.js";
import { checkDeadExports } from "./checks/deadExports.js";
import { checkHallucinatedDeps } from "./checks/hallucinatedDeps.js";
import { checkDependencyRisk } from "./checks/dependencyRisk.js";
import { buildScorecard } from "./scorecard.js";
import type { PackageJson, Scorecard } from "./types.js";

export * from "./types.js";
export { buildScorecard } from "./scorecard.js";
export { renderBadge } from "./badge.js";

export interface ScanOptions {
  /** Skip network-dependent checks (hallucinated deps, CVE/staleness) entirely. */
  offline?: boolean;
}

export async function scan(
  targetDir: string,
  opts: ScanOptions = {},
): Promise<Scorecard> {
  const files = await walkSourceFiles(targetDir);

  let pkg: PackageJson = {};
  try {
    const raw = await readFile(join(targetDir, "package.json"), "utf8");
    pkg = JSON.parse(raw) as PackageJson;
  } catch {
    // no package.json -- dependency-based checks will simply find nothing to check
  }

  const deterministic = [
    checkSecrets(files),
    checkPhantomImports(files, pkg),
    checkDuplication(files),
    checkDeadExports(files),
  ];

  const networked = opts.offline
    ? [
        {
          name: "hallucinated-deps",
          status: "skipped" as const,
          skipReason: "offline mode",
          findings: [],
        },
        {
          name: "dependency-risk",
          status: "skipped" as const,
          skipReason: "offline mode",
          findings: [],
        },
      ]
    : await Promise.all([checkHallucinatedDeps(pkg), checkDependencyRisk(pkg)]);

  return buildScorecard([...deterministic, ...networked]);
}
