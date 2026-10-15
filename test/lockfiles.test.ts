import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverLockedVersions } from "../src/lockfiles.js";

let dir: string;

async function tree(files: Record<string, string>): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "slop-lock-"));
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
  return dir;
}

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const versionsOf = (locked: Map<string, Set<string>>, name: string) =>
  [...(locked.get(name) ?? [])].sort();

describe("discoverLockedVersions", () => {
  it("reads package-lock v3 first-level installs, including workspace-nested ones", async () => {
    const root = await tree({
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "app" },
          "node_modules/express": { version: "4.17.1" },
          "node_modules/@scope/lib": { version: "2.0.0" },
          "node_modules/express/node_modules/qs": { version: "6.0.0" },
          "packages/web/node_modules/express": { version: "4.18.2" },
          "node_modules/web": { link: true, resolved: "packages/web" },
        },
      }),
    });
    const locked = await discoverLockedVersions(root);
    expect(versionsOf(locked, "express")).toEqual(["4.17.1", "4.18.2"]);
    expect(versionsOf(locked, "@scope/lib")).toEqual(["2.0.0"]);
    expect(locked.has("qs")).toBe(false); // transitive copy nested under express
    expect(locked.has("web")).toBe(false); // workspace link, not a registry install
  });

  it("reads package-lock v1 dependencies", async () => {
    const root = await tree({
      "package-lock.json": JSON.stringify({
        lockfileVersion: 1,
        dependencies: { lodash: { version: "4.17.15" } },
      }),
    });
    expect(versionsOf(await discoverLockedVersions(root), "lodash")).toEqual(["4.17.15"]);
  });

  it("reads classic and Berry yarn.lock entries", async () => {
    const classic = [
      "# yarn lockfile v1",
      "",
      '"@babel/core@^7.0.0", "@babel/core@^7.1.0":',
      '  version "7.1.2"',
      '  resolved "https://registry.yarnpkg.com/..."',
      "",
      "minimist@^1.2.0:",
      '  version "1.2.5"',
      "",
    ].join("\n");
    const berry = [
      "__metadata:",
      "  version: 6",
      "",
      '"axios@npm:^0.21.0":',
      "  version: 0.21.1",
      "",
      '"web@workspace:packages/web":',
      "  version: 0.0.0-use.local",
      "",
    ].join("\n");
    const root = await tree({ "yarn.lock": classic, "packages/b/yarn.lock": berry });
    const locked = await discoverLockedVersions(root);
    expect(versionsOf(locked, "@babel/core")).toEqual(["7.1.2"]);
    expect(versionsOf(locked, "minimist")).toEqual(["1.2.5"]);
    expect(versionsOf(locked, "axios")).toEqual(["0.21.1"]);
    expect(locked.has("web")).toBe(false);
    expect(locked.has("__metadata")).toBe(false);
  });

  it("skips a malformed lockfile instead of failing", async () => {
    const root = await tree({ "package-lock.json": "{not json" });
    expect((await discoverLockedVersions(root)).size).toBe(0);
  });
});
