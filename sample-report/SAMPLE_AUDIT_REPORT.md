# CodeReckon Audit Report — SampleCo

> **This is a public sample report.** SampleCo is a fictional application CodeReckon built to
> demonstrate a full audit. Every finding below is real output from the CodeReckon pipeline run
> against that codebase. Your report follows this exact structure, run against your code.

| | |
|---|---|
| **Client** | SampleCo, Inc. *(demonstration target)* |
| **Engagement** | CR-DEMO-0001 · Tier: Full Audit (T2) |
| **Codebase** | Node/Express invoice API · 10 source files · commit `sample@HEAD` |
| **Audit window** | 2026-07-15 |
| **Auditor** | Brad Matthews, CodeReckon *(founder-signed)* |
| **Methodology** | CodeReckon taxonomy v0.1 (ANTI_SLOP R-01..R-30 + OWASP 2021 + CWE) |

---

## 1. Executive Summary

**Verdict:** SampleCo is **not safe to operate**. It has no working authentication or
authorization, and every database query is built by string concatenation. A completely
**unauthenticated** internet user can read every customer's invoices and user credentials, and
forge or tamper with records for any account. These are not isolated bugs — they compose into a
single, trivially-exploitable path from a public endpoint to full data compromise.

Beyond the security exposure, the codebase shows the signature profile of rushed AI-generated
code: a dependency that **does not exist on npm** (a live supply-chain risk), a second phantom
import, a validator and a formatter wired to nothing, the same auth block copy-pasted into three
files, and a comment claiming a rate-limiter that was removed.

### Scorecard

| Dimension | Grade | Note |
|---|---|---|
| **Overall** | **F** | Full unauthenticated compromise reachable |
| Security posture | F | 3 CRITICAL + 5 HIGH, all trivial difficulty |
| AI-Slop Index | 78 / 100 (high) | hallucinated dep, dead paths, disconnected safety nets |
| Dependency risk | D | non-existent package + 2017-era Express with known CVEs |
| Maintainability | D | duplication, swallowed errors, inconsistent patterns |
| Test reality | F | no tests present |
| Duplication | High | auth logic triplicated verbatim |

### Findings dashboard

| Severity | Count | Headline ("high-severity, low-difficulty")|
|---|---|---|
| CRITICAL | 3 | SQL injection (read + write); auth accepts any token |
| HIGH | 5 | no admin authorization; unvalidated input to SQL; secrets in source; outdated Express |
| MEDIUM | 5 | slopsquat dependency; stub login; duplicated auth; silent DB failures |
| LOW | 3 | pattern inconsistency; stale security comment; dead/orphaned code |

**Top 3 risks**
1. **Authentication is a no-op** — `verifyToken` accepts any non-empty token; the real check is dead code left behind a dev fallback shipped to production.
2. **SQL injection on every data path** — read and write queries concatenate user input directly.
3. **A dependency that doesn't exist** — `json-safe-parse-ultra` is not on npm; if an attacker registers the name, the next `npm install` runs their code (supply-chain RCE).

---

## 2. Engagement Goals & Coverage

**Reviewed:** all 10 files under `src/` and `package.json` — routes, services, utilities, config.
**Not reviewed:** runtime infrastructure, deployment config, and the database schema (not in
scope for this demo). **Access:** local source snapshot. This is a point-in-time, scope-bounded
assessment, not a certification of overall security.

---

## 3. Attack Chain — Anonymous Internet → Full Data Exfiltration + Privileged Write ⭐

**Chain severity: CRITICAL** (exceeds any individual finding). Every hop is trivial and requires
no credentials, because no working control exists to defeat.

```
[Public Internet]
      │  Step 1 (optional) — POST /auth/login  ──CR-004──►  { "token": "dev-token" }
      │                       (no credential check; static token to anyone)
      ▼
      │  Step 2 — send ANY non-empty token
      │           Authorization: Bearer x      ──CR-003──►  requireAuth passes (role:"user")
      ▼
      ├───────────────────────────────┬──────────────────────────────┐
      │  Step 3a — READ                │  Step 3b — WRITE
      ▼                                ▼
GET /admin/invoices?customerId=        POST /invoices
  1' UNION SELECT id,email,password,      body:{customerId:"1','9');--",amount:"x"}
  role FROM users--                          │  CR-006 (validator never called)
      │ CR-005 (no admin role check)         │  + CR-002 (SQLi write sink)
      │ + CR-001 (SQLi read sink)            ▼
      ▼                                Forge / tamper invoices for ANY customer
Dump users table + all invoices
      ▼
[Impact: bulk PII + credential exfiltration  AND  arbitrary privileged writes]
```

An attacker hits `/auth/login`, is handed `dev-token` with no credential check (CR-004) — though
even that is optional, since `verifyToken` (CR-003) accepts any non-empty header because its real
verifier is dead code. Now "authenticated," they call the admin endpoint, which never checks for
an admin role (CR-005), and inject into the unparameterized `customerId` (CR-001) to exfiltrate
the users table and every invoice. In parallel, `POST /invoices` passes attacker JSON straight to
a concatenated INSERT (CR-002) with the one validator left disconnected (CR-006). The empty catch
(CR-010) and absent rate limiter mean none of it is logged or throttled.

---

## 4. Findings Register

| ID | Title | Category | Severity | Difficulty |
|----|-------|----------|----------|-----------|
| CR-001 | SQL injection — invoice read path (string concat) | OWASP A03 / CWE-89 | CRITICAL | Trivial |
| CR-002 | SQL injection — invoice write path (string concat) | OWASP A03 / CWE-89 | CRITICAL | Trivial |
| CR-003 | Auth bypass — `verifyToken` dead path + permissive fallback | OWASP A07 / CWE-287, ANTI_SLOP R-10 | CRITICAL | Trivial |
| CR-004 | Stub login issues static token, no credential check | OWASP A07 / CWE-798, ANTI_SLOP R-27 | HIGH | Trivial |
| CR-005 | Broken access control — admin route never checks role | OWASP A01 / CWE-862 | HIGH | Trivial |
| CR-006 | Unvalidated input reaches SQL sink (`validateInvoice` never called) | OWASP A04 / CWE-20, ANTI_SLOP R-26 | HIGH | Trivial |
| CR-007 | Hardcoded secrets in source (`apiKey`, `jwtSecret`) | OWASP A05 / CWE-798, ANTI_SLOP R-22 | HIGH | Disclosure |
| CR-008 | Outdated dependency `express@4.16.0` (known CVEs) | OWASP A06 / CWE-1035 | HIGH | Low–Med |
| CR-009 | Slopsquat / hallucinated dependency `json-safe-parse-ultra` (404 on npm) | ANTI_SLOP R-21 / CWE-1104 | MEDIUM | Medium |
| CR-010 | Silent failure — empty catch swallows DB errors | OWASP A09 / CWE-390, ANTI_SLOP R-01 | MEDIUM | N/A |
| CR-011 | Duplicated auth block copy-pasted into 3 routers | ANTI_SLOP R-19 | MEDIUM | N/A |
| CR-012 | Phantom import `currency-fmt` (undeclared + non-existent) | ANTI_SLOP R-25 | MEDIUM | Medium |
| CR-013 | DB callback errors ignored → 200 masks failures | ANTI_SLOP R-02/R-04 | MEDIUM | N/A |
| CR-014 | Pattern inconsistency — parameterized vs concatenated SQL | ANTI_SLOP R-20 | LOW | N/A |
| CR-015 | Stale comment claims a removed rate-limiter | ANTI_SLOP R-15 | LOW | N/A |
| CR-016 | Orphaned/dead code (`formatAmount` unused + broken) | Dead code | LOW | N/A |

*(Detailed evidence, exploit scenarios, and short-/long-term fixes for each finding are carried
in the full engagement report; abbreviated here for the public sample. See §6 for the top items.)*

---

## 6. Selected Detailed Findings

### CR-003 — Authentication accepts any token (CRITICAL)
- **Location:** `src/services/authService.js:6-14`
- **Evidence:** `let verifier;` is declared but never assigned, so `if (verifier)` is always
  false and `verifier.check(token)` is unreachable. Control always falls through to
  `return { ok: !!token, role: "user" }` — any non-empty string authenticates. The comment
  admits it: *"fallback meant for local dev, left in prod."*
- **Failure scenario:** `curl -H "Authorization: Bearer x" host/admin/invoices` succeeds with no
  real credential. Because the fallback returns a correctly-shaped result, nothing downstream
  ever notices auth is broken — the defining "dead path hidden by a plausible fallback" pattern.
- **Short-term fix:** Fail closed — if no real verifier is configured, throw at startup; return
  `{ ok: false }` for anything not cryptographically verified.
- **Long-term fix:** Implement real JWT verification against a secret from env; delete the dev
  fallback; add a test asserting a garbage token gets 401.

### CR-001 / CR-002 — SQL injection, read and write (CRITICAL)
- **Location:** `src/services/invoiceService.js:6-8` and `:11-14`
- **Evidence:** `"SELECT * FROM invoices WHERE customer_id = '" + customerId + "'"` and the INSERT
  concatenating `inv.customerId`/`inv.amount`. Input originates from `req.query`/`req.body`. The
  same codebase uses safe `?` placeholders in `userService.js:7` — an inconsistency (CR-014) that
  makes the injection easy to miss in review.
- **Exploit scenario:** `GET /invoices?customerId=1' UNION SELECT id,email,password,role FROM users--`
  returns the users table through the invoice response.
- **Fix:** Bind parameters (`db.all("… = ?", [customerId], cb)`); ban concatenated SQL via lint.

### CR-009 — Hallucinated dependency (MEDIUM, supply-chain)
- **Location:** `package.json:11`
- **Evidence:** `json-safe-parse-ultra` is declared but **returns HTTP 404 on the npm registry**
  (verified live) and is imported nowhere. Classic slopsquatting signature — a plausible,
  AI-invented package name.
- **Exploit scenario:** An attacker registers the exact name with a malicious `postinstall`; the
  next `npm install` in CI or dev executes their code with the app's privileges (RCE).
- **Fix:** Remove it (unused); enforce lockfile + `npm ci`; verify every dependency resolves and
  is actually imported in CI.

---

## 7. AI-Provenance & Slop Profile ⭐

What this codebase's AI-assisted history did to it:

- **Hallucinated / phantom packages (2):** `json-safe-parse-ultra` (declared, non-existent) and
  `currency-fmt` (imported, undeclared, non-existent). Both are supply-chain live wires.
- **Dead paths behind plausible fallbacks:** the auth verifier (CR-003) and the stub login
  (CR-004) — code shaped like a real control that does nothing.
- **Disconnected safety nets:** `validateInvoice` (CR-006) and `formatAmount` (CR-016) exist but
  are wired to nothing — the AI wrote the guard and never called it.
- **Duplication over refactor:** the auth block is copy-pasted verbatim into three routers
  (CR-011) — the #1 driver of AI-assisted tech debt.
- **Comment/behavior drift:** a comment advertises a rate-limiter that was removed (CR-015).
- **Pattern inconsistency:** safe parameterized SQL in one service, injectable concatenation in
  another (CR-014) — the tell of modules generated in isolation.

**AI-Slop Index: 78/100.** The dominant shape is *plausibly-structured code wired to nothing or
never reached* — exactly what automated PR-review bots miss because each file looks fine alone.

---

## 8. Remediation Backlog (priority-ordered)

| Priority | Do this | Closes | Effort |
|---|---|---|---|
| P0 — breaks the attack chain | Fail-closed real token verification | CR-003 | S |
| P0 | Add `requireRole("admin")` + object-ownership checks | CR-005 | S |
| P0 | Parameterize all SQL (read + write) | CR-001, CR-002, CR-014 | S |
| P1 | Real login with hashed credentials + signed JWT | CR-004 | M |
| P1 | Wire `validateInvoice` at the route edge; validate all input | CR-006, CR-013 | M |
| P1 | Move secrets to env/secret-manager; rotate | CR-007 | S |
| P1 | Remove non-existent package; lockfile + `npm ci` | CR-009 | S |
| P2 | Upgrade Express ≥4.20.x; `npm audit` gate in CI | CR-008 | S |
| P2 | Replace phantom `currency-fmt` with `Intl.NumberFormat` | CR-012 | S |
| P2 | Log + propagate DB errors; remove empty catch | CR-010 | S |
| P3 | Extract one shared auth middleware | CR-011 | S |
| P3 | Delete stale comment + dead code | CR-015, CR-016 | S |

**Quick wins (under an hour, high impact):** CR-001/CR-002 parameterization and CR-003 fail-closed
together break the critical attack chain.

---

## 9. Appendices

- **A — Severity scale:** CRITICAL (compromise reachable) / HIGH / MEDIUM / LOW; difficulty =
  attacker effort to exploit.
- **B — Methodology & tools:** CodeReckon multi-agent pipeline — anti-slop, secrets, security, and
  dependency specialists run in parallel, findings adversarially verified, then human-confirmed
  and signed. Taxonomy v0.1. Live npm-registry checks for package existence.
- **C — Coverage:** 10/10 `src/` files + `package.json` reviewed; no files skipped.
- **D — Data handling:** demonstration target; no client data involved. Real engagements use an
  ephemeral sandboxed workspace, secrets never stored, artifacts deleted 30 days post-delivery.
- **E — Validation note:** this codebase carries a known planted-defect ledger; this run caught
  **16/16 findings including all 12 planted defects and reconstructed the intended attack chain**
  — a 100% recall self-test of the pipeline (see [`RECALL_CHECK.md`](RECALL_CHECK.md)).

---

*CodeReckon delivers human-verified audits of AI-generated codebases. This report is a
demonstration. To audit your codebase: codereckon.com (coming soon) · founder-signed, fixed
price, one week. Try the free scorecard first: [github.com/bpmforge/slop-scorecard](https://github.com/bpmforge/slop-scorecard).*
