export interface SourceFile {
  relPath: string;
  content: string;
}

export type CheckStatus = "ran" | "skipped";

export interface CheckFinding {
  rule: string;
  title: string;
  file?: string;
  line?: number;
  detail: string;
}

/** A check reports its own status explicitly -- a check that couldn't run must say SKIPPED,
 * never silently return zero findings as if it ran clean (the false-clean lesson). */
export interface CheckResult {
  name: string;
  status: CheckStatus;
  skipReason?: string;
  findings: CheckFinding[];
  /** Structured numeric data a check wants the scorecard to use directly instead of parsing
   * finding text (e.g. duplication density). Optional, check-specific keys. */
  meta?: Record<string, number>;
}

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Scorecard {
  overall: Grade;
  slopIndex: number; // 0-100, lower is better
  dimensions: {
    phantomImports: Grade;
    duplication: Grade;
    deadExports: Grade;
    secrets: Grade;
    dependencyRisk: Grade;
  };
  checks: CheckResult[];
}
