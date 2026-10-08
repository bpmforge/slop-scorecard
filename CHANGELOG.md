# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing is tagged or published to npm yet. `package.json` says `0.1.0`. This entry covers everything on `main` so far.

### Added

- **CLI** (`slop-scorecard <path> [--out <dir>] [--offline] [--json]`). It writes `slop-scorecard-report.json` and a `slop-scorecard-badge.svg` grade badge, and prints an overall A–F grade and an AI-Slop Index (0–100, lower is better).
- **Six checks.**
  - Secrets: six pattern rules.
  - Phantom imports.
  - Hallucinated dependencies: live npm registry lookup.
  - Duplication: n-gram heuristic.
  - Dead exports.
  - Dependency risk: exact pins, plus OSV.dev CVE lookup for those pinned versions.

  The two network checks report an explicit `SKIPPED` status when offline or when the registry can't be reached, so a check that didn't run never looks clean.
- **Composite GitHub Action** (`action.yml`). It writes a job summary and posts or updates a single PR comment. It exposes `overall-grade` and `slop-index` outputs. `.github/workflows/dogfood.yml` runs it against `sample/sampleco` and requires grade F.
- **SampleCo fixture** (`sample/sampleco/`). A deliberately vibe-coded demo app with 12 planted defects, listed in `PLANTED_DEFECTS.md`.
- **CodeReckon sample audit report** (`sample-report/`). A worked example of the paid audit, run against SampleCo, with its recall check.
- **`rules/`**. A hand-mirrored, MIT-licensed public-teaser subset of `bpm-rulepacks`: 17 rule IDs in 16 files (ast-grep slop rules, plus Opengrep secrets and prose-padding rules). These rules are optional and are not wired into the CLI.

### Fixed

- `--out` pointing at a directory that doesn't exist crashed with `ENOENT` after the scorecard printed. The CLI now creates the directory.
- Phantom imports had three false-positive sources, now fixed:
  - Node builtin subpaths (`fs/promises`) are recognised.
  - `@/` path aliases are no longer treated as npm scopes.
  - Dependencies are merged from every `package.json` in the scanned tree, not just the root. The hallucinated-deps and dependency-risk checks get the same merged manifest.
