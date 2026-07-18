# Mirrored rules (public-teaser subset)

This directory is a **manual, point-in-time mirror** of the `metadata.license: public-teaser`
rules from `bpm-rulepacks` — our proprietary Opengrep + ast-grep rule corpus. Everything else in
that corpus (the majority of it) stays private; only rules explicitly tagged `public-teaser` are
copied here. Each file carries a header comment naming its source path.

**Source of truth stays in `bpm-rulepacks`.** This repo is licensed MIT (see `../LICENSE`); the
rule text copied into it is MIT here by that grant, but `bpm-rulepacks` itself is a private repo
and the rest of its corpus is not open. If a mirrored rule and the upstream rule ever disagree,
upstream wins — re-copy, don't patch this copy in place.

## Why these aren't wired into the CLI

`slop-scorecard` is zero-dependency by design (`npm ls --prod` returns nothing) — the built-in
checks in `src/checks/` are hand-written regex/AST-free heuristics so the tool has no external
engine to install, version, or trust. These mirrored rules are written for **ast-grep** (the
`rules/ast-grep/` structural rules) and **Opengrep/Semgrep-compatible `pattern-regex`** engines
(the `rules/opengrep/` rules) — adopting either as a hard runtime dependency would break that
zero-dep property for every user of the free CLI. So this directory ships the rules as
documentation + an optional add-on, not as a wired-in check.

Note that the `rules/opengrep/secrets/*.yaml` patterns are functionally equivalent to the secret
regexes already built into `src/checks/secrets.ts` (that's the direction the mirroring originally
went — `bpm-rulepacks` ported *from* this repo's secrets checks). They're included here anyway for
completeness and so the mirror is a faithful, complete copy of the public-teaser tag set.

## Running them yourself (optional)

If you have [ast-grep](https://ast-grep.github.io/) installed:

```
sg scan --config rules/ast-grep/slop/empty-catch.yaml <path>
# or all ast-grep rules at once:
for f in rules/ast-grep/slop/*.yaml; do sg scan --config "$f" <path>; done
```

If you have an Opengrep- or Semgrep-compatible CLI installed:

```
opengrep --config rules/opengrep/secrets --config rules/opengrep/slop <path>
```

Both engines are optional dev tools, not `slop-scorecard` dependencies — install them separately
if you want the extra coverage.

## What's here

| Dir | Engine | Rules |
|---|---|---|
| `ast-grep/slop/` | ast-grep (structural TS/JS) | 10 ANTI_SLOP rules (empty-catch, try/catch-in-loop, JSON.parse fallback, unimplemented stub throw, step-by-step narration comments, delegation-only wrapper class, hardcoded-env-fallback secret, redundant null/undefined check, emoji-in-comments, fallback-hides-failure) |
| `opengrep/secrets/` | Opengrep/Semgrep `pattern-regex` (generic) | 5 hardcoded-credential patterns (GitHub PAT, Stripe live key, Slack token, PEM private key, AWS access key ID) |
| `opengrep/slop/` | Opengrep/Semgrep `pattern-regex` (generic) | 2 ANTI_SLOP R-29 prose-padding patterns (hedging opener, fake-specificity citation) |

17 rule IDs across 15 files, all `metadata.license: public-teaser` in the upstream corpus.

## Resyncing

There is no automated sync job — `bpm-rulepacks` is a separate private repo and this mirror is
refreshed by hand when its public-teaser rules change. To check what's new or changed upstream:

```
grep -rl "license: public-teaser" <path-to-bpm-rulepacks>/astgrep <path-to-bpm-rulepacks>/packs
```

Diff the result against the files in this directory (by the `id:`/rule-id, not the filename — some
upstream files mix teaser and proprietary rules and only the teaser-tagged rule should ever be
copied here; see the header comment in `opengrep/secrets/aws-access-key.yaml` for a worked
example of that split). Copy changed/new teaser rules over, keep the mirror-source header comment,
and never copy anything tagged `license: proprietary`.
