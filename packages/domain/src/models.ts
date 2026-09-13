import type { TestRunResult, TestRunState, TestStatus } from "./test-status.js";

export interface TestRun {
  id: string;
  repositoryId: string;
  pullRequestId: number;
  sourceBranch: string;
  sourceCommitId: string;
  state: TestRunState;
  result?: TestRunResult;
  startedBy: string;
  startedAt: string;
  completedBy?: string;
  completedAt?: string;
}

export interface TestRunSuite {
  runId: string;
  suiteId: string;
  title: string;
  filePath: string;
  sourceMarkdown: string;
}

export interface TestRunItem {
  id: string;
  runId: string;
  suiteId: string;
  hierarchy: string[];
  text: string;
  status: TestStatus;
  lastExecutedBy?: string;
  lastExecutedAt?: string;
}

export interface TestExecution {
  id: string;
  runId: string;
  itemId: string;
  status: Exclude<TestStatus, "pending">;
  executedBy: string;
  executedAt: string;
  comment?: string;
}
