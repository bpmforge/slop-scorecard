# Pipeline Recall Check — SampleCo

Cross-check of the 12 planted defects ([`../sample/sampleco/PLANTED_DEFECTS.md`](../sample/sampleco/PLANTED_DEFECTS.md))
against the audit output. Run: 2026-07-15, three specialist agents (anti-slop, secrets,
security+attack-chain), independent (none read the ledger).

| Planted | Description | Caught by | Report ID | Status |
|---|---|---|---|---|
| D1 | Hardcoded secret | secrets SEC-001/002, anti-slop AS-003, sec F-7 | CR-007 | ✅ |
| D2 | SQL injection (read+write) | anti-slop AS-002, sec F-1/F-2 | CR-001/002 | ✅ |
| D3 | Slopsquat `json-safe-parse-ultra` | anti-slop AS-004, sec F-9 (both live-verified 404) | CR-009 | ✅ |
| D4 | Phantom import `currency-fmt` | anti-slop AS-005 | CR-012 | ✅ |
| D5 | Duplicated auth block ×3 | anti-slop AS-009 | CR-011 | ✅ |
| D6 | Empty catch | anti-slop AS-008, secrets note, sec F-10 | CR-010 | ✅ |
| D7 | Dead primary path / permissive fallback | anti-slop AS-001, sec F-3 | CR-003 | ✅ |
| D8 | Disconnected validator | anti-slop AS-007, sec F-6 | CR-006 | ✅ |
| D9 | Missing admin authz | anti-slop AS-006, sec F-5 | CR-005 | ✅ |
| D10 | Outdated Express CVE | anti-slop AS-015, sec F-8 (named real CVEs) | CR-008 | ✅ |
| D11 | Unvalidated `any` body | anti-slop AS-010, sec F-6 | CR-006/013 | ✅ |
| D12 | Stale rate-limiter comment | anti-slop AS-012 | CR-015 | ✅ |

**Planted recall: 12/12 (100%).**
**Attack chain A:** reconstructed correctly by the security agent (entry POST /invoices +
/admin/invoices → SQLi + auth bypass + missing authz → exfiltration + privileged write, rated
CRITICAL). ✅

## Bonus findings (not planted — pipeline found extra real defects)
- AS-011 / F-4 — stub `/login` returns static token (→ CR-004)
- AS-013 — DB callback errors ignored, 200 masks failure (→ CR-013)
- AS-014 — pattern inconsistency parameterized vs concatenated SQL (→ CR-014)
- AS-016 — orphaned dead `formatAmount` (→ CR-016)

## Verdict
Pipeline PASSES its own red-team: 100% planted recall + correct chain + 4 genuine bonus findings,
zero false "all clear." This is the evidence that backs the "human-verified, nothing missed"
positioning. Re-run this check on every pipeline change before shipping a client report.
