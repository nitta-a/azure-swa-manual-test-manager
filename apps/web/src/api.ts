/// <reference types="vite/client" />

const projectId = import.meta.env.VITE_PROJECT_ID || "default";
const repositoryId = import.meta.env.VITE_REPOSITORY_ID || "repository";

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
  value: { id: string; state: string; result?: string; sourceCommitId: string };
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
  listPullRequests: () => request<PullRequest[]>(`/projects/${encodeURIComponent(projectId)}/pull-requests`),
  getDefinition: (pullRequestId: string) =>
    request<Definition>(`/projects/${encodeURIComponent(projectId)}/pull-requests/${pullRequestId}/test-definition`),
  startRun: (pullRequestId: number, suiteIds: string[]) =>
    request<{ value: { id: string } }>("/test-runs", {
      method: "POST",
      body: JSON.stringify({ repositoryId, pullRequestId, suiteIds }),
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
};
