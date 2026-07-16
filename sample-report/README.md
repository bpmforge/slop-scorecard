# Sample Audit Report

This directory demonstrates **CodeReckon**, the paid, human-verified audit product that
`slop-scorecard` (this repo) is the free half of. It's not part of the CLI itself — it's a
worked example showing what the deeper, paid pipeline produces.

- **[SAMPLE_AUDIT_REPORT.md](SAMPLE_AUDIT_REPORT.md)** — a full audit report (exec summary,
  scorecard, attack-chain analysis, findings register, AI-provenance breakdown, remediation
  backlog) run against SampleCo, the deliberately vibe-coded demo app in
  [`sample/sampleco/`](../sample/sampleco/) one level up.
- **[RECALL_CHECK.md](RECALL_CHECK.md)** — the validation record: this pipeline run caught
  16/16 findings, including all 12 defects deliberately planted in SampleCo, and correctly
  reconstructed the intended attack chain. A self-test of the methodology, not a client outcome.

Everything here is demonstration output against a fictional app built for exactly this purpose —
labeled as such throughout, not a real client engagement.
