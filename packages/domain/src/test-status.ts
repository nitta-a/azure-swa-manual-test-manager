export type TestStatus = "pending" | "passed" | "failed" | "blocked" | "skipped";
export type TestRunState = "inProgress" | "completed" | "cancelled";
export type TestRunResult = "passed" | "failed" | "blocked";

export const executableStatuses = ["passed", "failed", "blocked", "skipped"] as const;
