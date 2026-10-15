# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-15

First release: the `slop-scorecard` npm package and the `bpmforge/slop-scorecard@v1` GitHub Action.

### Added

- **CLI** (`slop-scorecard <path> [--out <dir>] [--offline] [--json]`). It writes `slop-scorecard-report.json` and a `slop-scorecard-badge.svg` grade badge, and prints an overall A–F grade and an AI-Slop Index (0–100, lower is better).
- **Six checks.**
  - Secrets: six pattern rules.
  - Phantom imports.
  - Hallucinated dependencies: live npm registry lookup.
  - Duplication: n-gram heuristic.
  - Dead exports.
  - Dependency risk: exact pins, plus OSV.dev CVE lookup for every declared dependency.

  The two network checks report an explicit `SKIPPED` status when offline or when the registry can't be reached, so a check that didn't run never looks clean.
- **Composite GitHub Action** (`action.yml`). It writes a job summary and posts or updates a single PR comment. It exposes `overall-grade` and `slop-index` outputs. `.github/workflows/dogfood.yml` runs it against `sample/sampleco` and requires grade F.
- **SampleCo fixture** (`sample/sampleco/`). A deliberately vibe-coded demo app with 12 planted defects, listed in `PLANTED_DEFECTS.md`.
- **CodeReckon sample audit report** (`sample-report/`). A worked example of the paid audit, run against SampleCo, with its recall check.
- **`rules/`**. A hand-mirrored, MIT-licensed public-teaser subset of `bpm-rulepacks`: 17 rule IDs in 16 files (ast-grep slop rules, plus Opengrep secrets and prose-padding rules). These rules are optional and are not wired into the CLI.
- **Release workflow** (`.github/workflows/release.yml`). Pushing a `v*.*.*` tag re-runs the checks, publishes to npm with provenance, and moves the major-version tag.

### Changed

- Dependency risk now looks up CVEs for range-specified dependencies too, not only exact pins. It checks the version a lockfile resolved (`package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`), or with no lockfile entry, the lowest version the range allows. Range-floor hits use a separate rule, `SLOP-DEP-RANGE-CVE`, which weighs less in the dependency-risk grade and is left out of the AI-Slop Index. Lookups run six at a time.

### Fixed

- Dependency risk recorded no CVEs when OSV.dev answered with a non-OK HTTP status (a 429 or 5xx, say), which reads as clean. It now reports `SKIPPED` with the status, the same as when OSV.dev is unreachable.
- `--out` pointing at a directory that doesn't exist crashed with `ENOENT` after the scorecard printed. The CLI now creates the directory.
- Phantom imports had three false-positive sources, now fixed:
  - Node builtin subpaths (`fs/promises`) are recognised.
  - `@/` path aliases are no longer treated as npm scopes.
  - Dependencies are merged from every `package.json` in the scanned tree, not just the root. The hallucinated-deps and dependency-risk checks get the same merged manifest.

[Unreleased]: https://github.com/bpmforge/slop-scorecard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bpmforge/slop-scorecard/releases/tag/v0.1.0
