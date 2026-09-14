import type { AzureDevOpsClient, PullRequest } from "@manual-test-manager/azure-devops";
import type { TestExecution, TestRun, TestRunItem, TestStatus } from "@manual-test-manager/domain";
import type { ManifestV1 } from "@manual-test-manager/manifest";
import type { SourceControlClient } from "@manual-test-manager/source-control";
import type { RepositorySet, Versioned } from "@manual-test-manager/storage";
import type { ServiceContext } from "./service/context.js";
import type { DefinitionContent } from "./service/definitions.js";
import * as definitions from "./service/definitions.js";
import { ServiceError } from "./service/errors.js";
import { execute as executeItem, listExecutions as listItemExecutions } from "./service/executions.js";
import {
  getTestDefinition as getDefinitionFromDevOps,
  listPullRequests as listPullRequestsFromDevOps,
} from "./service/pull-requests.js";
import type { DefinitionSource } from "./service/resolver.js";
import {
  cancel as cancelRun,
  complete as completeRun,
  get as getRun,
  listItems as listRunItems,
  reopen as reopenRun,
  start as startRun,
} from "./service/test-runs.js";

export { ServiceError } from "./service/errors.js";

export interface StartTestRunInput {
  source?:
    | { type: "azureRepos"; repositoryId: string; pullRequestId: number }
    | { type: "github"; repositoryId: string; pullRequestId: number }
    | { type: "appManaged"; definitionId: string };
  repositoryId?: string;
  pullRequestId?: number;
  suiteIds: string[];
  startedBy: string;
}

export interface ExecutionInput {
  itemId: string;
  status: Exclude<TestStatus, "pending">;
  executedBy: string;
  comment?: string;
  expectedEtag: string;
}

export interface TestDefinition {
  pullRequest: PullRequest;
  manifest: ManifestV1;
  suites: ManifestV1["suites"];
}

export class TestRunService {
  private readonly context: ServiceContext;

  constructor(
    repositories: RepositorySet,
    devOps: AzureDevOpsClient,
    manifestPath: string,
    now: () => string = () => new Date().toISOString(),
    options: { providers?: Partial<Record<"azureRepos" | "github", SourceControlClient>>; projectId?: string } = {},
  ) {
    this.context = {
      repositories,
      devOps,
      manifestPath,
      now,
      providers: { azureRepos: devOps, ...options.providers },
      projectId: options.projectId || "default",
    };
  }

  listPullRequests(provider: "azureRepos" | "github" = "azureRepos"): Promise<PullRequest[]> {
    return listPullRequestsFromDevOps(this.context, provider);
  }

  getPullRequest(id: number, provider: "azureRepos" | "github" = "azureRepos"): Promise<PullRequest> {
    const client = this.context.providers[provider];
    if (!client) return Promise.reject(new ServiceError(503, `${provider} is not configured`));
    return client.getPullRequest(id);
  }

  getTestDefinition(
    pullRequestId: number,
    provider: "azureRepos" | "github" = "azureRepos",
    repositoryId = "repository",
  ): Promise<TestDefinition> {
    return getDefinitionFromDevOps(this.context, pullRequestId, provider, repositoryId);
  }

  start(input: StartTestRunInput): Promise<Versioned<TestRun>> {
    return startRun(this.context, input);
  }

  get(runId: string) {
    return getRun(this.context, runId);
  }

  listItems(runId: string) {
    return listRunItems(this.context, runId);
  }

  listExecutions(runId: string, itemId: string) {
    return listItemExecutions(this.context, runId, itemId);
  }

  execute(
    runId: string,
    input: ExecutionInput,
  ): Promise<{
    item: Versioned<TestRunItem>;
    execution: Versioned<TestExecution>;
  }> {
    return executeItem(this.context, runId, input);
  }

  complete(runId: string, completedBy: string): Promise<Versioned<TestRun>> {
    return completeRun(this.context, runId, completedBy);
  }

  reopen(runId: string): Promise<Versioned<TestRun>> {
    return reopenRun(this.context, runId);
  }

  cancel(runId: string): Promise<Versioned<TestRun>> {
    return cancelRun(this.context, runId);
  }

  listTestDefinitions() {
    return definitions.list(this.context);
  }
  getTestDefinitionById(id: string) {
    return definitions.get(this.context, id);
  }
  listDefinitionRevisions(id: string) {
    return definitions.revisions(this.context, id);
  }
  createTestDefinition(name: string, content: DefinitionContent, userId: string) {
    return definitions.create(this.context, name, content, userId);
  }
  updateTestDefinition(id: string, name: string, content: DefinitionContent, userId: string, etag: string) {
    return definitions.update(this.context, id, name, content, userId, etag);
  }
  deleteTestDefinition(id: string, etag: string) {
    return definitions.remove(this.context, id, etag);
  }
  importTestDefinition(source: DefinitionSource, suiteIds: string[], name: string, userId: string) {
    return definitions.importDefinition(this.context, source, suiteIds, name, userId);
  }
}
