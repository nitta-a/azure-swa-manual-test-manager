import type { TestRunResult, TestStatus } from "./test-status.js";

export interface TestRunProgress {
  total: number;
  pending: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
}

export function calculateRunProgress(items: readonly { status: TestStatus }[]): TestRunProgress {
  const progress: TestRunProgress = {
    total: items.length,
    pending: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
  };
  for (const item of items) progress[item.status] += 1;
  return progress;
}

export function calculateRunResult(statuses: readonly TestStatus[]): TestRunResult {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("blocked")) return "blocked";
  return "passed";
}

export function hasPendingItems(statuses: readonly TestStatus[]): boolean {
  return statuses.includes("pending");
}
