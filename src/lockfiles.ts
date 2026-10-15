import { readFile } from "node:fs/promises";
import { walkFiles } from "./fileWalk.js";

/** Package name -> every version a lockfile in the scanned tree resolved it to. */
export type LockedVersions = Map<string, Set<string>>;

function add(locked: LockedVersions, name: string, version: unknown): void {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) return;
  if (!locked.has(name)) locked.set(name, new Set());
  locked.get(name)!.add(version);
}

/**
 * npm lockfiles (package-lock.json / npm-shrinkwrap.json). lockfileVersion 2/3 lists installs
 * under `packages` keyed by path; v1 only has the nested `dependencies` tree. Only the first
 * node_modules level of each key is kept ("node_modules/x", "packages/a/node_modules/x"), so
 * versions come from what a declared dependency actually resolved to, not from a transitive copy
 * nested under another package.
 */
function readNpmLock(raw: string, locked: LockedVersions): void {
  const lock = JSON.parse(raw) as {
    packages?: Record<string, { version?: string; link?: boolean }>;
    dependencies?: Record<string, { version?: string }>;
  };
  if (lock.packages) {
    for (const [path, entry] of Object.entries(lock.packages)) {
      const m = /^(?:(?!node_modules\/).)*node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(path);
      if (m && !entry.link) add(locked, m[1], entry.version);
    }
    return;
  }
  for (const [name, entry] of Object.entries(lock.dependencies ?? {})) {
    add(locked, name, entry.version);
  }
}

/**
 * yarn.lock, classic (v1) and Berry. Each entry is a header line of one or more
 * comma-separated descriptors ("name@^1.0.0", "\"name@npm:^1.0.0\"") followed by an indented
 * `version` line. Patch/workspace descriptors are skipped: they aren't registry versions.
 */
function readYarnLock(raw: string, locked: LockedVersions): void {
  let names: string[] = [];
  for (const line of raw.split("\n")) {
    if (line && !line.startsWith(" ") && !line.startsWith("#") && line.endsWith(":")) {
      names = line
        .slice(0, -1)
        .split(",")
        .map((d) => d.trim().replace(/^"|"$/g, ""))
        .filter((d) => !/@(workspace|patch|portal|link|file):/.test(d))
        .map((d) => d.slice(0, d.indexOf("@", 1)))
        .filter(Boolean);
      continue;
    }
    const v = /^\s+version:?\s+"?([^"\s]+)"?/.exec(line);
    if (v) {
      for (const name of new Set(names)) add(locked, name, v[1]);
      names = [];
    }
  }
}

const READERS: Record<string, (raw: string, locked: LockedVersions) => void> = {
  "package-lock.json": readNpmLock,
  "npm-shrinkwrap.json": readNpmLock,
  "yarn.lock": readYarnLock,
};

/**
 * Collects resolved versions from every npm/yarn lockfile in the scanned tree, so the
 * dependency-risk check can look up CVEs for what's actually installed rather than only for
 * exact pins. pnpm-lock.yaml isn't read (no YAML parser in a zero-dependency tool); those
 * projects fall back to the range-floor lookup.
 */
export async function discoverLockedVersions(root: string): Promise<LockedVersions> {
  const locked: LockedVersions = new Map();
  const paths = await walkFiles(root, (name) => name in READERS);
  for (const path of paths) {
    try {
      const raw = await readFile(path, "utf8");
      READERS[path.slice(path.lastIndexOf("/") + 1)](raw, locked);
    } catch {
      // malformed or unreadable lockfile -- fall back to range floors rather than fail the scan
    }
  }
  return locked;
}
