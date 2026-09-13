import type { TestRunResult, TestStatus } from "./test-status.js";

export function calculateRunResult(
  statuses: readonly TestStatus[],
): TestRunResult {
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("blocked")) return "blocked";
  return "passed";
}

export function hasPendingItems(statuses: readonly TestStatus[]): boolean {
  return statuses.includes("pending");
}
