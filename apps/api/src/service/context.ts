import type { AzureDevOpsClient } from "@manual-test-manager/azure-devops";
import type { SourceControlClient, SourceControlProviderKind } from "@manual-test-manager/source-control";
import type { RepositorySet } from "@manual-test-manager/storage";

export interface ServiceContext {
  readonly repositories: RepositorySet;
  readonly devOps: AzureDevOpsClient;
  readonly providers: Partial<Record<SourceControlProviderKind, SourceControlClient>>;
  readonly projectId: string;
  readonly manifestPath: string;
  readonly now: () => string;
}
