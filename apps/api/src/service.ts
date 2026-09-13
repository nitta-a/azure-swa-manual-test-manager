import type { AzureDevOpsClient, PullRequest } from "@manual-test-manager/azure-devops";
import type { TestExecution, TestRun, TestRunItem, TestStatus } from "@manual-test-manager/domain";
import type { ManifestV1 } from "@manual-test-manager/manifest";
import type { RepositorySet, Versioned } from "@manual-test-manager/storage";
import type { ServiceContext } from "./service/context.js";
import { execute as executeItem, listExecutions as listItemExecutions } from "./service/executions.js";
import {
  getTestDefinition as getDefinitionFromDevOps,
  getPullRequest as getPullRequestFromDevOps,
  listPullRequests as listPullRequestsFromDevOps,
} from "./service/pull-requests.js";
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
  repositoryId: string;
  pullRequestId: number;
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
  ) {
    this.context = { repositories, devOps, manifestPath, now };
  }

  listPullRequests(): Promise<PullRequest[]> {
    return listPullRequestsFromDevOps(this.context.devOps);
  }

  getPullRequest(id: number): Promise<PullRequest> {
    return getPullRequestFromDevOps(this.context.devOps, id);
  }

  getTestDefinition(pullRequestId: number): Promise<TestDefinition> {
    return getDefinitionFromDevOps(this.context, pullRequestId);
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
}
