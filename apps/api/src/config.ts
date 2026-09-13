import {
  type AzureDevOpsClient,
  createAzureDevOpsClient,
} from "@manual-test-manager/azure-devops";
import {
  createAzureTableRepositories,
  InMemoryRepositories,
  type RepositorySet,
} from "@manual-test-manager/storage";
import { TestRunService } from "./service.js";

class MissingDevOpsConfiguration implements AzureDevOpsClient {
  private fail(): never {
    throw new Error(
      "Azure DevOps is not configured. Set ADO_ORGANIZATION_URL, ADO_PROJECT, ADO_REPOSITORY_ID, and ADO_PAT.",
    );
  }
  listPullRequests(): Promise<never> {
    return Promise.reject(this.fail());
  }
  getPullRequest(): Promise<never> {
    return Promise.reject(this.fail());
  }
  getFile(): Promise<never> {
    return Promise.reject(this.fail());
  }
}

export async function createServiceFromEnvironment(): Promise<TestRunService> {
  const repositories: RepositorySet = process.env
    .AZURE_STORAGE_CONNECTION_STRING
    ? await createAzureTableRepositories(
        process.env.AZURE_STORAGE_CONNECTION_STRING,
      )
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
  return new TestRunService(
    repositories,
    devOps,
    process.env.MANIFEST_PATH || ".manual-test-manifest.yml",
  );
}
