import type { AzureDevOpsClient } from "@manual-test-manager/azure-devops";
import type { RepositorySet } from "@manual-test-manager/storage";

export interface ServiceContext {
  readonly repositories: RepositorySet;
  readonly devOps: AzureDevOpsClient;
  readonly manifestPath: string;
  readonly now: () => string;
}
