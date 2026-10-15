import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDependencyRisk, rangeFloor } from "../src/checks/dependencyRisk.js";

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

describe("checkDependencyRisk beyond exact pins", () => {
  // Echoes back a vuln only for the versions listed, so tests can see which version was queried.
  const osvWithVulnsFor = (vulnerable: string[]) => {
    const queried: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const { package: p, version } = JSON.parse(String(init?.body));
        const target = `${p.name}@${version}`;
        queried.push(target);
        const vulns = vulnerable.includes(target) ? [{ id: `GHSA-${target}` }] : [];
        return new Response(JSON.stringify({ vulns }), { status: 200 });
      }),
    );
    return queried;
  };

  it("checks the lockfile-resolved version of a range dependency", async () => {
    const queried = osvWithVulnsFor(["express@4.17.1"]);
    const result = await checkDependencyRisk(
      { dependencies: { express: "^4.16.0" } },
      { locked: new Map([["express", new Set(["4.17.1"])]]) },
    );
    expect(queried).toEqual(["express@4.17.1"]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe("SLOP-DEP-CVE");
    expect(result.findings[0].title).toContain("(locked)");
  });

  it("falls back to the range floor without a lockfile, as a separate lower-weight rule", async () => {
    const queried = osvWithVulnsFor(["sqlite3@5.1.0"]);
    const result = await checkDependencyRisk({ dependencies: { sqlite3: "^5.1.0" } });
    expect(queried).toEqual(["sqlite3@5.1.0"]);
    expect(result.findings.map((f) => f.rule)).toEqual(["SLOP-DEP-RANGE-CVE"]);
    expect(result.findings[0].title).toContain("range ^5.1.0 allows 5.1.0");
  });

  it("does not look up specs it can't resolve to a version", async () => {
    const queried = osvWithVulnsFor([]);
    const result = await checkDependencyRisk({
      dependencies: { a: "*", b: "latest", c: "workspace:*", d: "github:x/y", e: "^1 || ^2" },
    });
    expect(queried).toEqual([]);
    expect(result.status).toBe("ran");
  });

  it("reports SKIPPED if any lookup fails, keeping the pin findings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    const result = await checkDependencyRisk({
      dependencies: { "left-pad": "1.3.0", sqlite3: "^5.1.0" },
    });
    expect(result.status).toBe("skipped");
    expect(result.skipReason).toContain("HTTP 429");
    expect(result.findings.map((f) => f.rule)).toEqual(["SLOP-DEP-PINNED"]);
  });
});

describe("rangeFloor", () => {
  it.each([
    ["^4.16.0", "4.16.0"],
    ["~1.2", "1.2.0"],
    [">=2.0.1", "2.0.1"],
    ["1.x", "1.0.0"],
    ["3", "3.0.0"],
    ["*", undefined],
    ["^1 || ^2", undefined],
    ["npm:other@^1.0.0", undefined],
  ])("%s -> %s", (range, floor) => {
    expect(rangeFloor(range)).toBe(floor);
  });
});
