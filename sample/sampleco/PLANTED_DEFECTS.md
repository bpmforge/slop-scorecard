# SampleCo — Planted Defect Ledger

Ground truth for pipeline validation. Every row must appear in the generated CodeReckon Audit
Report. Severity/difficulty use the CodeReckon scale (see docs/SAMPLE_REPORT_OUTLINE.md).
IDs here map to expected report finding IDs.

| # | Defect | File:approx line | Taxonomy | Severity | In attack chain? |
|---|---|---|---|---|---|
| D1 | Hardcoded API key / secret in source | src/config.js | Secret / CWE-798 | HIGH | yes (chain A) |
| D2 | SQL injection via string-concatenated query | src/services/invoiceService.js | OWASP A03 / CWE-89 | CRITICAL | yes (chain A) |
| D3 | Hallucinated/slopsquat dependency (`json-safe-parse-ultra`) | package.json | ANTI_SLOP slopsquatting | HIGH | no |
| D4 | Phantom import (module referenced, never installed) | src/utils/format.js | ANTI_SLOP phantom-import | MEDIUM | no |
| D5 | Copy-paste duplicated auth block across 3 routes | src/routes/*.js | ANTI_SLOP R-19 duplication | MEDIUM | no |
| D6 | Empty catch swallowing errors (silent failure) | src/services/userService.js | ANTI_SLOP R-01 error-handling | MEDIUM | no |
| D7 | Dead primary path hidden by a correct-looking fallback | src/services/authService.js | ANTI_SLOP R-10 | HIGH | yes (chain A) |
| D8 | Disconnected pipeline: validator defined, never called | src/utils/validate.js | ANTI_SLOP disconnected | MEDIUM | yes (chain A) |
| D9 | Missing authz check on admin route (broken access control) | src/routes/adminRoutes.js | OWASP A01 / CWE-862 | CRITICAL | yes (chain A) |
| D10 | Outdated dependency with known CVE (`express@4.16.0`) | package.json | Dependency / CVE | MEDIUM | no |
| D11 | `any`-typed request body, no runtime validation | src/routes/invoiceRoutes.js | Type-safety | LOW | no |
| D12 | Stale comment describing removed rate-limiter | src/routes/authRoutes.js | ANTI_SLOP R-15 stale-comment | LOW | no |

## Expected attack chain A (the report's signature section)
D8 (validator never wired) → unvalidated body reaches D2 (SQLi) → dumps user table incl.
password hashes; separately D1 (leaked key) + D9 (no admin authz) + D7 (auth fallback always
"succeeds") → attacker reaches admin invoice endpoints. Entry: public POST /invoices. Impact:
full data exfiltration + privileged write. Chain severity: CRITICAL (exceeds any single MEDIUM).

## Validation rule
Pipeline pass = all 12 planted defects surfaced with correct taxonomy label AND chain A
reconstructed. Log misses as pipeline bugs before shipping the sample report.
