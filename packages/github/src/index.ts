import type { PullRequestRef, SourceControlClient } from "@manual-test-manager/source-control";

export interface GitHubClientConfig {
  owner: string;
  repository: string;
  token: string;
  apiUrl?: string;
}

interface PullRequestResponse {
  number: number;
  title: string;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
}

interface ContentResponse {
  content?: string;
  encoding?: string;
}

export function createGitHubClient(config: GitHubClientConfig, fetchImpl: typeof fetch = fetch): SourceControlClient {
  const base = `${(config.apiUrl || "https://api.github.com").replace(/\/$/, "")}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  async function request<T>(url: string): Promise<T> {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
    return response.json() as Promise<T>;
  }

  function mapPullRequest(pr: PullRequestResponse): PullRequestRef {
    const sourceBranch = pr.head?.ref;
    const sourceCommitId = pr.head?.sha;
    const targetBranch = pr.base?.ref;
    if (typeof sourceBranch !== "string" || typeof sourceCommitId !== "string" || typeof targetBranch !== "string")
      throw new Error("GitHub pull request response is malformed");
    return {
      id: pr.number,
      title: pr.title,
      sourceBranch,
      targetBranch,
      sourceCommitId,
    };
  }

  return {
    async listPullRequests() {
      const result = await request<PullRequestResponse[]>(`${base}/pulls?state=open&per_page=100`);
      if (!Array.isArray(result)) throw new Error("GitHub pull request response is malformed");
      return result.map(mapPullRequest);
    },
    async getPullRequest(pullRequestId) {
      return mapPullRequest(await request<PullRequestResponse>(`${base}/pulls/${pullRequestId}`));
    },
    async getFile(path, commitId) {
      const result = await request<ContentResponse>(
        `${base}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(commitId)}`,
      );
      if (result.encoding !== "base64" || typeof result.content !== "string")
        throw new Error(`GitHub file has no base64 content: ${path}`);
      const content = result.content.replaceAll("\n", "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content) || content.length % 4 === 1)
        throw new Error(`GitHub file content is malformed: ${path}`);
      try {
        return Buffer.from(content, "base64").toString("utf8");
      } catch {
        throw new Error(`GitHub file content is malformed: ${path}`);
      }
    },
  };
}
