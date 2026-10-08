import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDependencyRisk } from "../src/checks/dependencyRisk.js";

// OSV.dev is mocked: these cover how the check reads each kind of response, not the live API.

const pkg = { dependencies: { "left-pad": "1.3.0" } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkDependencyRisk OSV.dev handling", () => {
  it("reports SKIPPED, not clean, when OSV.dev answers with a non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    const result = await checkDependencyRisk(pkg);
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toContain("HTTP 503");
    expect(result.findings.some((f) => f.rule === "SLOP-DEP-CVE")).toBe(false);
  });

  it("reports SKIPPED when OSV.dev is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const result = await checkDependencyRisk(pkg);
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toContain("unreachable");
  });

  it("records OSV vulnerabilities when OSV.dev answers OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ vulns: [{ id: "GHSA-test-0000", summary: "bad" }] }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const result = await checkDependencyRisk(pkg);
    expect(result.status).toBe("ran");
    expect(
      result.findings.some(
        (f) => f.rule === "SLOP-DEP-CVE" && f.title.includes("GHSA-test-0000"),
      ),
    ).toBe(true);
  });

  it("reports ran with no CVEs when OSV.dev answers OK with no vulns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    const result = await checkDependencyRisk(pkg);
    expect(result.status).toBe("ran");
    expect(result.findings.map((f) => f.rule)).toEqual(["SLOP-DEP-PINNED"]);
  });
});
