import type {
  CheckFinding,
  CheckResult,
  PackageJson,
  SourceFile,
} from "../types.js";

// Node builtins that never need a package.json entry. Not exhaustive of every "node:" module,
// but covers what small app codebases realistically import.
const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "net",
  "os",
  "path",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "url",
  "util",
  "zlib",
  "worker_threads",
  "perf_hooks",
  "async_hooks",
  "v8",
]);

const IMPORT_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
const ESM_IMPORT_RE = /\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function packageNameOf(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null; // relative/absolute
  if (specifier.startsWith("node:")) return null; // explicit builtin, e.g. "node:fs/promises"
  if (specifier === "@/" || specifier.startsWith("@/")) return null; // TS/Next/Vite path alias,
  // never a real scoped npm package -- a real scope always has a name between "@" and "/"
  // (e.g. "@babel/parser"), so a bare "@/" prefix is structurally impossible as npm syntax.

  const firstSegment = specifier.split("/")[0];
  if (NODE_BUILTINS.has(firstSegment)) return null; // covers builtin subpaths like "fs/promises",
  // "stream/promises" -- a builtin's own package name is always its first path segment.

  // scoped package "@scope/name/subpath" -> "@scope/name"; unscoped "name/subpath" -> "name"
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export function checkPhantomImports(
  files: SourceFile[],
  pkg: PackageJson,
): CheckResult {
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);

  const findings: CheckFinding[] = [];
  const seen = new Set<string>(); // dedupe per (pkgName,file)

  for (const file of files) {
    for (const re of [IMPORT_RE, ESM_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(file.content))) {
        const pkgName = packageNameOf(m[1]);
        if (!pkgName) continue;
        if (declared.has(pkgName)) continue;
        const key = `${pkgName}::${file.relPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          rule: "SLOP-PHANTOM-IMPORT",
          title: `Phantom import: "${pkgName}" is used but not declared in package.json`,
          file: file.relPath,
          line: lineOf(file.content, m.index),
          detail: `require/import references "${pkgName}", which is not a dependency or devDependency. Either add it to package.json or -- if it doesn't exist on the registry -- it may be an AI-hallucinated package name (see the hallucinated-dependency check).`,
        });
      }
    }
  }
  return { name: "phantom-imports", status: "ran", findings };
}
