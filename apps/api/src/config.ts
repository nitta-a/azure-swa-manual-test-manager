import { type AzureDevOpsClient, createAzureDevOpsClient } from "@manual-test-manager/azure-devops";
import { createGitHubClient } from "@manual-test-manager/github";
import { createAzureTableRepositories, InMemoryRepositories, type RepositorySet } from "@manual-test-manager/storage";
import { TestRunService } from "./service.js";

class MissingDevOpsConfiguration implements AzureDevOpsClient {
  private error(): Error {
    return new Error(
      "Azure DevOps is not configured. Set ADO_ORGANIZATION_URL, ADO_PROJECT, ADO_REPOSITORY_ID, and ADO_PAT.",
    );
  }
  listPullRequests(): Promise<never> {
    return Promise.reject(this.error());
  }
  getPullRequest(): Promise<never> {
    return Promise.reject(this.error());
  }
  getFile(): Promise<never> {
    return Promise.reject(this.error());
  }
}

export async function createServiceFromEnvironment(): Promise<TestRunService> {
  const repositories: RepositorySet = process.env.AZURE_STORAGE_CONNECTION_STRING
    ? await createAzureTableRepositories(process.env.AZURE_STORAGE_CONNECTION_STRING)
    : new InMemoryRepositories();
  const {
    ADO_ORGANIZATION_URL: organizationUrl,
    ADO_PROJECT: project,
    ADO_REPOSITORY_ID: repositoryId,
    ADO_PAT: pat,
  } = process.env;
  const devOps =
    organizationUrl && project && repositoryId && pat
      ? createAzureDevOpsClient({ organizationUrl, project, repositoryId, pat })
      : new MissingDevOpsConfiguration();
  const github =
    process.env.GITHUB_OWNER && process.env.GITHUB_REPOSITORY && process.env.GITHUB_TOKEN
      ? createGitHubClient({
          owner: process.env.GITHUB_OWNER,
          repository: process.env.GITHUB_REPOSITORY,
          token: process.env.GITHUB_TOKEN,
          ...(process.env.GITHUB_API_URL ? { apiUrl: process.env.GITHUB_API_URL } : {}),
        })
      : undefined;
  return new TestRunService(repositories, devOps, process.env.MANIFEST_PATH || ".manual-test-manifest.yml", undefined, {
    providers: { azureRepos: devOps, ...(github ? { github } : {}) },
    projectId: process.env.PROJECT_ID || "default",
  });
}
