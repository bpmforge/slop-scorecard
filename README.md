# slop-scorecard

Free, deterministic AI-slop scorecard for a codebase. Zero LLM calls, zero cloud upload of your
source — everything runs locally except two read-only public-registry lookups (npm, OSV.dev) used
to verify dependency names and known CVEs.

Checks:
- **Secrets** — hardcoded key/token/password patterns in source
- **Phantom imports** — modules `require`/`import`ed but not declared in `package.json`
- **Hallucinated dependencies** — declared packages that don't exist on the npm registry (live
  check; the classic "slopsquatting" signature)
- **Duplication** — near-identical code blocks across files (naive n-gram heuristic)
- **Dead exports** — exported names never referenced elsewhere in the scanned tree (heuristic;
  comments are stripped before this check so a name mentioned only in a comment doesn't count)
- **Dependency risk** — exact-pinned dependencies and known CVEs via OSV.dev

Every network-dependent check reports an explicit `SKIPPED` status (with a reason) if the
registry is unreachable — it never silently reports zero findings as if it ran clean.

## Usage

```
npm install
npx tsx src/cli.ts <path-to-repo> [--out <dir>] [--offline] [--json]
```

(Once published to npm: `npx slop-scorecard <path-to-repo>` — no clone required.)

Writes `slop-scorecard-report.json` (full structured output) and `slop-scorecard-badge.svg`
(shareable grade badge) to `--out` (defaults to the scanned directory).

## GitHub Action

Runs the same scan in CI, writes a job summary, and (on pull requests) posts or updates a single
scorecard comment on the PR — no third-party comment-posting action required.

```yaml
- uses: bpmforge/slop-scorecard@main
  with:
    path: .              # directory to scan, default "."
    offline: "false"     # skip the npm/OSV.dev checks if true
    comment-pr: "true"   # post/update a PR comment; needs pull-requests: write below
```

If `comment-pr` is `true` on a `pull_request` trigger, the calling workflow needs:

```yaml
permissions:
  pull-requests: write
```

Outputs: `overall-grade` (A–F) and `slop-index` (0–100). See
`.github/workflows/dogfood.yml` in this repo for a working example that also asserts a
known-bad regression grade against `sample/sampleco`.

## Bonus rules (ast-grep / Opengrep, optional)

[`rules/`](rules/) has 17 additional AI-slop and secrets rules — a public-teaser subset mirrored
from our proprietary `bpm-rulepacks` corpus, MIT-licensed here. They're not wired into the CLI
(this tool stays zero-dependency), but if you have [ast-grep](https://ast-grep.github.io/) or an
Opengrep/Semgrep-compatible scanner installed, you can run them directly. See
[`rules/README.md`](rules/README.md) for the full list and commands.

## What this is not

This is the free lead-magnet tool. It flags candidates for review with heuristics that are
honest about their limits (see the doc comments in `src/checks/`). The paid **CodeReckon** audit
(codereckon.com — coming soon) human-verifies every finding, adds attack-chain synthesis, and
delivers a decision-grade report — this CLI tells you the number is worth looking into; the audit
tells you exactly what's wrong and how to fix it. See a real example:
[**sample-report/**](sample-report/) — a full audit report run against the SampleCo fixture in
this repo, including the attack-chain analysis and a 100%-recall validation record.

## Development

```
npm test          # vitest, run against sample/sampleco
npm run lint       # tsc --noEmit
```

The test suite's "online" describe block exercises the live npm/OSV.dev checks against the
fixture app in `sample/sampleco/` and tolerates a network-restricted environment by accepting an
explicit `skipped` status.

## License

MIT — see [LICENSE](LICENSE).
