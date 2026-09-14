import type { PullRequestRef, SourceControlClient } from "@manual-test-manager/source-control";

export type PullRequest = PullRequestRef;
export type AzureDevOpsClient = SourceControlClient;

export interface AzureDevOpsClientConfig {
  organizationUrl: string;
  project: string;
  repositoryId: string;
  pat: string;
}

interface PullRequestResponse {
  pullRequestId: number;
  title: string;
  sourceRefName: string;
  targetRefName: string;
  lastMergeSourceCommit?: { commitId: string };
}

export function createAzureDevOpsClient(
  config: AzureDevOpsClientConfig,
  fetchImpl: typeof fetch = fetch,
): AzureDevOpsClient {
  const base = `${config.organizationUrl.replace(/\/$/, "")}/${encodeURIComponent(config.project)}/_apis/git/repositories/${encodeURIComponent(config.repositoryId)}`;
  const headers = {
    Authorization: `Basic ${btoa(`:${config.pat}`)}`,
    Accept: "application/json",
  };
  async function request<T>(url: string): Promise<T> {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) throw new Error(`Azure DevOps request failed (${response.status})`);
    return response.json() as Promise<T>;
  }
  const mapPullRequest = (pr: PullRequestResponse): PullRequest => ({
    id: pr.pullRequestId,
    title: pr.title,
    sourceBranch: pr.sourceRefName,
    targetBranch: pr.targetRefName,
    sourceCommitId: pr.lastMergeSourceCommit?.commitId ?? "",
  });
  return {
    async listPullRequests() {
      const result = await request<{ value: PullRequestResponse[] }>(
        `${base}/pullrequests?searchCriteria.status=active&$top=100&api-version=7.1`,
      );
      return result.value.map(mapPullRequest);
    },
    async getPullRequest(pullRequestId) {
      return mapPullRequest(
        await request<PullRequestResponse>(`${base}/pullrequests/${pullRequestId}?api-version=7.1`),
      );
    },
    async getFile(path, commitId) {
      const url = `${base}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${encodeURIComponent(commitId)}&versionDescriptor.versionType=commit&includeContent=true&api-version=7.1`;
      const result = await request<{ content?: string }>(url);
      if (typeof result.content !== "string") throw new Error(`Azure DevOps file has no content: ${path}`);
      return result.content;
    },
  };
}
