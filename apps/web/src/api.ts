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
    throw new Error(body.error || `Request failed (${response.status})`);
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
    status: "pending" | "passed" | "failed" | "blocked" | "skipped";
  };
  etag: string;
}
export interface Run {
  value: {
    id: string;
    state: string;
    result?: string;
    sourceType?: string;
    sourceCommitId?: string;
    definitionRevisionId?: string;
  };
  suites: unknown[];
  items: Item[];
}
export interface Execution {
  value: {
    id: string;
    status: string;
    executedBy: string;
    executedAt: string;
    comment?: string;
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
  ) =>
    request<{ value: { id: string } }>("/test-runs", {
      method: "POST",
      body: JSON.stringify(
        typeof sourceOrPullRequestId === "number"
          ? { repositoryId, pullRequestId: sourceOrPullRequestId, suiteIds }
          : { source: sourceOrPullRequestId, suiteIds },
      ),
    }),
  getRun: (runId: string) => request<Run>(`/test-runs/${runId}`),
  execute: (runId: string, itemId: string, etag: string, status: string) =>
    request(`/test-runs/${runId}/items/${itemId}/executions`, {
      method: "POST",
      headers: { "if-match": etag },
      body: JSON.stringify({ itemId, status }),
    }),
  executions: (runId: string, itemId: string) => request<Execution[]>(`/test-runs/${runId}/items/${itemId}/executions`),
  complete: (runId: string) => request(`/test-runs/${runId}/complete`, { method: "POST" }),
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
