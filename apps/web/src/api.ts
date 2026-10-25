/// <reference types="vite/client" />

const projectId = import.meta.env.VITE_PROJECT_ID || "default";
const repositoryId = import.meta.env.VITE_REPOSITORY_ID || "repository";
const githubRepositoryId = import.meta.env.VITE_GITHUB_REPOSITORY || repositoryId;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Request failed (${response.status})`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export interface PullRequest {
  id: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  sourceCommitId: string;
}
export interface Suite {
  id: string;
  title: string;
  path: string;
  sourceMarkdown: string;
  sourceUrl?: string;
  items: Array<{ id: string; hierarchy: string[]; text: string; order: number }>;
}
export interface Definition {
  pullRequest: PullRequest;
  suites: Suite[];
}
export interface ManagedDefinition {
  value: { id: string; name: string; currentRevisionId: string };
  etag: string;
  revision?: { value: { id: string } };
  suites: Array<{ value: { id: string; title: string; order: number }; etag: string }>;
  items: Array<{
    value: { id: string; suiteId: string; hierarchy: string[]; text: string; order: number };
    etag: string;
  }>;
}
export interface Item {
  value: {
    id: string;
    suiteId: string;
    hierarchy: string[];
    text: string;
    order?: number;
    suiteOrder?: number;
    inScope?: boolean;
    status: "pending" | "passed" | "failed" | "blocked" | "skipped";
    lastExecutedBy?: string;
    lastExecutedAt?: string;
    lastComment?: string;
    lastEvidenceUrl?: string;
    lastIssueTicketUrl?: string;
  };
  etag: string;
}
export interface TestRunSummary {
  runId: string;
  projectId: string;
  sourceType: "azureRepos" | "github" | "appManaged";
  repositoryId?: string;
  pullRequestId?: number;
  definitionId?: string;
  sourceCommitId?: string;
  definitionRevisionId?: string;
  state: "inProgress" | "completed" | "cancelled";
  result?: "passed" | "failed" | "blocked";
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
  releaseName?: string;
  environmentUrl?: string;
  browser?: string;
}
export interface RunDetails {
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
}
export interface Run {
  value: {
    id: string;
    state: string;
    result?: string;
    sourceType?: string;
    sourceCommitId?: string;
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
  };
  suites: Array<{
    value: {
      suiteId: string;
      title: string;
      sourceMarkdown?: string;
      sourcePath?: string;
      sourceUrl?: string;
      order?: number;
    };
  }>;
  items: Item[];
}
export interface Execution {
  value: {
    id: string;
    status: string;
    executedBy: string;
    executedAt: string;
    comment?: string;
    evidenceUrl?: string;
    issueTicketUrl?: string;
  };
}

export const api = {
  projectId,
  listPullRequests: (provider: "azureRepos" | "github" = "azureRepos", repository = githubRepositoryId) =>
    request<PullRequest[]>(
      `/projects/${encodeURIComponent(projectId)}/pull-requests${provider === "azureRepos" ? "" : `?provider=${provider}&repositoryId=${encodeURIComponent(repository)}`}`,
    ),
  getDefinition: (
    pullRequestId: string,
    provider: "azureRepos" | "github" = "azureRepos",
    repository = githubRepositoryId,
  ) =>
    request<Definition>(
      `/projects/${encodeURIComponent(projectId)}/pull-requests/${pullRequestId}/test-definition${provider === "azureRepos" ? "" : `?provider=${provider}&repositoryId=${encodeURIComponent(repository)}`}`,
    ),
  startRun: (
    sourceOrPullRequestId:
      | number
      | { type: "azureRepos" | "github"; repositoryId: string; pullRequestId: number }
      | { type: "appManaged"; definitionId: string },
    suiteIds: string[],
    itemIds?: string[],
    details: RunDetails = {},
    expectedDefinitionVersion?: string,
  ) =>
    request<{ value: { id: string } }>("/test-runs", {
      method: "POST",
      body: JSON.stringify(
        typeof sourceOrPullRequestId === "number"
          ? {
              repositoryId,
              pullRequestId: sourceOrPullRequestId,
              suiteIds,
              itemIds,
              ...details,
              expectedDefinitionVersion,
            }
          : { source: sourceOrPullRequestId, suiteIds, itemIds, ...details, expectedDefinitionVersion },
      ),
    }),
  getRun: (runId: string) => request<Run>(`/test-runs/${runId}`),
  listRuns: (
    filters: Partial<Pick<TestRunSummary, "state" | "result" | "sourceType">> & {
      limit?: number;
      cursor?: string;
    } = {},
  ) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, String(value));
    return request<{ items: TestRunSummary[]; nextCursor?: string }>(
      `/test-runs${query.toString() ? `?${query}` : ""}`,
    );
  },
  execute: (
    runId: string,
    itemId: string,
    etag: string,
    status: string,
    details: { comment?: string; evidenceUrl?: string; issueTicketUrl?: string } | string = {},
  ) =>
    request(`/test-runs/${runId}/items/${itemId}/executions`, {
      method: "POST",
      headers: { "if-match": etag },
      body: JSON.stringify({ itemId, status, ...(typeof details === "string" ? { comment: details } : details) }),
    }),
  executions: (runId: string, itemId: string) => request<Execution[]>(`/test-runs/${runId}/items/${itemId}/executions`),
  complete: (runId: string) => request(`/test-runs/${runId}/complete`, { method: "POST" }),
  cancel: (runId: string) => request(`/test-runs/${runId}/cancel`, { method: "POST" }),
  reopen: (runId: string) => request(`/test-runs/${runId}/reopen`, { method: "POST" }),
  listTestDefinitions: () => request<Array<{ value: ManagedDefinition["value"]; etag: string }>>("/test-definitions"),
  getTestDefinitionById: (id: string) => request<ManagedDefinition>(`/test-definitions/${id}`),
  createTestDefinition: (
    name: string,
    content: { suites: Array<{ id: string; title: string; items: Array<{ hierarchy: string[]; text: string }> }> },
  ) =>
    request<{ value: ManagedDefinition["value"]; etag: string }>("/test-definitions", {
      method: "POST",
      body: JSON.stringify({ name, content }),
    }),
  updateTestDefinition: (
    id: string,
    etag: string,
    name: string,
    content: { suites: Array<{ id: string; title: string; items: Array<{ hierarchy: string[]; text: string }> }> },
  ) =>
    request<{ value: ManagedDefinition["value"]; etag: string }>(`/test-definitions/${id}`, {
      method: "PUT",
      headers: { "if-match": etag },
      body: JSON.stringify({ name, content }),
    }),
  importTestDefinition: (
    provider: "azureRepos" | "github",
    repositoryId: string,
    pullRequestId: number,
    suiteIds: string[],
    name: string,
  ) =>
    request<{ value: ManagedDefinition["value"]; etag: string }>("/test-definitions/import", {
      method: "POST",
      body: JSON.stringify({ provider, repositoryId, pullRequestId, suiteIds, name }),
    }),
};
