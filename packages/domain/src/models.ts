import type { TestRunResult, TestRunState, TestStatus } from "./test-status.js";

export function testItemSelectionId(suiteId: string, itemId: string): string {
  return `${encodeURIComponent(suiteId)}:${encodeURIComponent(itemId)}`;
}

export type TestRunSourceType = "azureRepos" | "github" | "appManaged";

export interface TestRun {
  id: string;
  /** Missing on legacy rows; those rows are Azure Repos runs. */
  sourceType?: TestRunSourceType;
  repositoryId?: string;
  pullRequestId?: number;
  sourceBranch?: string;
  sourceCommitId?: string;
  definitionId?: string;
  definitionRevisionId?: string;
  releaseName?: string;
  environmentUrl?: string;
  makerVersion?: string;
  viewerVersion?: string;
  functionsVersion?: string;
  appVersionBefore?: string;
  appVersionAfter?: string;
  browser?: string;
  operatingSystem?: string;
  locale?: string;
  featureConfiguration?: string;
  state: TestRunState;
  result?: TestRunResult;
  startedBy: string;
  startedAt: string;
  completedBy?: string;
  completedAt?: string;
}

export interface TestRunSummary {
  runId: string;
  projectId: string;
  sourceType: TestRunSourceType;
  repositoryId?: string;
  pullRequestId?: number;
  definitionId?: string;
  sourceCommitId?: string;
  definitionRevisionId?: string;
  state: TestRunState;
  result?: TestRunResult;
  startedBy: string;
  startedAt: string;
  completedBy?: string;
  completedAt?: string;
  totalCount: number;
  pendingCount: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  skippedCount: number;
  excludedCount?: number;
}

export interface TestRunSuite {
  runId: string;
  suiteId: string;
  title: string;
  order?: number;
  filePath?: string;
  sourceMarkdown?: string;
  sourcePath?: string;
  sourceContent?: string;
}

export interface TestRunItem {
  id: string;
  runId: string;
  suiteId: string;
  hierarchy: string[];
  text: string;
  order?: number;
  suiteOrder?: number;
  inScope?: boolean;
  status: TestStatus;
  lastExecutedBy?: string;
  lastExecutedAt?: string;
  lastComment?: string;
  lastEvidenceUrl?: string;
  lastIssueTicketUrl?: string;
}

export interface TestExecution {
  id: string;
  runId: string;
  itemId: string;
  status: Exclude<TestStatus, "pending">;
  executedBy: string;
  executedAt: string;
  comment?: string;
  evidenceUrl?: string;
  issueTicketUrl?: string;
}

export interface TestDefinition {
  id: string;
  projectId: string;
  name: string;
  currentRevisionId: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  archived?: boolean;
}

export interface TestDefinitionRevision {
  id: string;
  definitionId: string;
  revision: number;
  createdBy: string;
  createdAt: string;
  importedFrom?: {
    provider: "azureRepos" | "github";
    repositoryId?: string;
    pullRequestId?: number;
    commitId: string;
    importedAt?: string;
    importedBy?: string;
  };
}

export interface TestDefinitionSuite {
  revisionId: string;
  id: string;
  title: string;
  order: number;
}

export interface TestDefinitionItem {
  revisionId: string;
  id: string;
  suiteId: string;
  hierarchy: string[];
  text: string;
  order: number;
}
