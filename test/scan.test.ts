import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scan } from "../src/index.js";
import { renderBadge } from "../src/badge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleco = resolve(__dirname, "../sample/sampleco");

// Offline mode exercises only the deterministic checks (no npm registry / OSV.dev calls) --
// keeps this suite fast and hermetic. The network checks are covered by a separate
// online-only test below that's tolerant of the CI environment lacking internet access.

describe("scan() against SampleCo (offline, deterministic checks)", () => {
  it("flags the phantom import currency-fmt (D4)", async () => {
    const result = await scan(sampleco, { offline: true });
    const phantom = result.checks.find((c) => c.name === "phantom-imports")!;
    expect(phantom.findings.some((f) => f.title.includes("currency-fmt"))).toBe(
      true,
    );
  });

  it("flags hardcoded secrets in config.js (D1)", async () => {
    const result = await scan(sampleco, { offline: true });
    const secrets = result.checks.find((c) => c.name === "secrets")!;
    expect(secrets.findings.length).toBeGreaterThan(0);
    expect(secrets.findings.some((f) => f.file?.includes("config.js"))).toBe(
      true,
    );
  });

  it("flags the triplicated requireAuth block as duplication (D5)", async () => {
    const result = await scan(sampleco, { offline: true });
    const dup = result.checks.find((c) => c.name === "duplication")!;
    expect(dup.meta?.densityPct).toBeGreaterThan(0);
    expect(dup.findings.length).toBeGreaterThan(0);
  });

  it("flags validateInvoice and formatAmount as dead exports (D8-adjacent, D16)", async () => {
    const result = await scan(sampleco, { offline: true });
    const dead = result.checks.find((c) => c.name === "dead-exports")!;
    const names = dead.findings.map((f) => f.title);
    expect(names.some((t) => t.includes("validateInvoice"))).toBe(true);
    expect(names.some((t) => t.includes("formatAmount"))).toBe(true);
  });

  it("marks network checks as SKIPPED (not silently clean) in offline mode", async () => {
    const result = await scan(sampleco, { offline: true });
    const hallucinated = result.checks.find(
      (c) => c.name === "hallucinated-deps",
    )!;
    const depRisk = result.checks.find((c) => c.name === "dependency-risk")!;
    expect(hallucinated.status).toBe("skipped");
    expect(depRisk.status).toBe("skipped");
    expect(hallucinated.skipReason).toBeTruthy();
  });

  it("produces a low (bad) overall grade for a deliberately vibe-coded app", async () => {
    const result = await scan(sampleco, { offline: true });
    expect(["D", "F"]).toContain(result.overall);
    expect(result.slopIndex).toBeGreaterThan(20);
  });
});

describe("scan() against SampleCo (online, network checks)", () => {
  it("flags json-safe-parse-ultra as a hallucinated dependency (D3), or skips cleanly if offline", async () => {
    const result = await scan(sampleco, {});
    const hallucinated = result.checks.find(
      (c) => c.name === "hallucinated-deps",
    )!;
    if (hallucinated.status === "skipped") {
      // acceptable in a network-restricted CI environment -- must still be an explicit skip
      expect(hallucinated.skipReason).toBeTruthy();
      return;
    }
    expect(
      hallucinated.findings.some((f) =>
        f.title.includes("json-safe-parse-ultra"),
      ),
    ).toBe(true);
  });

  it("flags express@4.16.0 as pinned with a known CVE (D10), or skips cleanly if offline", async () => {
    const result = await scan(sampleco, {});
    const depRisk = result.checks.find((c) => c.name === "dependency-risk")!;
    if (depRisk.status === "skipped") {
      expect(depRisk.skipReason).toBeTruthy();
      return;
    }
    expect(
      depRisk.findings.some(
        (f) => f.rule === "SLOP-DEP-PINNED" && f.title.includes("express"),
      ),
    ).toBe(true);
  });
});

describe("renderBadge", () => {
  it("produces valid SVG containing the grade and slop index", () => {
    const svg = renderBadge("slop-score", "F", 78);
    expect(svg).toContain("<svg");
    expect(svg).toContain("F (78)");
  });
});
