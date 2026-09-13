import type { AzureDevOpsClient, PullRequest } from "@manual-test-manager/azure-devops";
import { type ManifestV1, parseManifest } from "@manual-test-manager/manifest";
import type { ServiceContext } from "./context.js";

export function listPullRequests(devOps: AzureDevOpsClient): Promise<PullRequest[]> {
  return devOps.listPullRequests();
}

export function getPullRequest(devOps: AzureDevOpsClient, id: number): Promise<PullRequest> {
  return devOps.getPullRequest(id);
}

export async function getTestDefinition(
  context: ServiceContext,
  pullRequestId: number,
): Promise<{
  pullRequest: PullRequest;
  manifest: ManifestV1;
  suites: ManifestV1["suites"];
}> {
  const pullRequest = await context.devOps.getPullRequest(pullRequestId);
  const manifest = parseManifest(await context.devOps.getFile(context.manifestPath, pullRequest.sourceCommitId));
  return { pullRequest, manifest, suites: manifest.suites };
}
