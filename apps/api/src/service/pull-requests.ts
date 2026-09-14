import type { AzureDevOpsClient, PullRequest } from "@manual-test-manager/azure-devops";
import type { ManifestV1 } from "@manual-test-manager/manifest";
import type { ServiceContext } from "./context.js";
import { ServiceError } from "./errors.js";
import { getRepositoryDefinition } from "./resolver.js";

export function listPullRequests(
  context: ServiceContext,
  provider: "azureRepos" | "github" = "azureRepos",
): Promise<PullRequest[]> {
  const client = context.providers[provider];
  if (!client) return Promise.reject(new ServiceError(503, `${provider} is not configured`));
  return client.listPullRequests();
}

export function getPullRequest(devOps: AzureDevOpsClient, id: number): Promise<PullRequest> {
  return devOps.getPullRequest(id);
}

export async function getTestDefinition(
  context: ServiceContext,
  pullRequestId: number,
  provider: "azureRepos" | "github" = "azureRepos",
  repositoryId = "repository",
): Promise<{
  pullRequest: PullRequest;
  manifest: ManifestV1;
  suites: ManifestV1["suites"];
}> {
  return getRepositoryDefinition(context, pullRequestId, provider, repositoryId);
}
