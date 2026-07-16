import { discoverMergedPackageManifest, walkSourceFiles } from "./fileWalk.js";
import { checkSecrets } from "./checks/secrets.js";
import { checkPhantomImports } from "./checks/phantomImports.js";
import { checkDuplication } from "./checks/duplication.js";
import { checkDeadExports } from "./checks/deadExports.js";
import { checkHallucinatedDeps } from "./checks/hallucinatedDeps.js";
import { checkDependencyRisk } from "./checks/dependencyRisk.js";
import { buildScorecard } from "./scorecard.js";
import type { Scorecard } from "./types.js";

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
  const pkg = await discoverMergedPackageManifest(targetDir);

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
