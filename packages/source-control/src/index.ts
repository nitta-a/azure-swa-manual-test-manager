export type SourceControlProviderKind = "azureRepos" | "github";

export interface PullRequestRef {
  id: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  sourceCommitId: string;
}

export interface SourceControlClient {
  listPullRequests(): Promise<PullRequestRef[]>;
  getPullRequest(pullRequestId: number): Promise<PullRequestRef>;
  getFile(path: string, commitId: string): Promise<string>;
}
