import { randomUUID } from "node:crypto";
import type {
  AzureDevOpsClient,
  PullRequest,
} from "@manual-test-manager/azure-devops";
import {
  calculateRunResult,
  hasPendingItems,
  type TestExecution,
  type TestRun,
  type TestRunItem,
  type TestStatus,
} from "@manual-test-manager/domain";
import { type ManifestV1, parseManifest } from "@manual-test-manager/manifest";
import { parseTestMarkdown } from "@manual-test-manager/markdown-parser";
import {
  ETagConflictError,
  type RepositorySet,
  type Versioned,
} from "@manual-test-manager/storage";

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

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

async function mapLimit<T, R>(
  values: readonly T[],
  limit: number,
  fn: (value: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      const value = values[index];
      if (value !== undefined) output[index] = await fn(value);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return output;
}

export class TestRunService {
  constructor(
    private readonly repositories: RepositorySet,
    private readonly devOps: AzureDevOpsClient,
    private readonly manifestPath: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async listPullRequests(): Promise<PullRequest[]> {
    return this.devOps.listPullRequests();
  }

  async getPullRequest(id: number): Promise<PullRequest> {
    return this.devOps.getPullRequest(id);
  }

  async getTestDefinition(pullRequestId: number): Promise<TestDefinition> {
    const pullRequest = await this.devOps.getPullRequest(pullRequestId);
    const manifest = parseManifest(
      await this.devOps.getFile(this.manifestPath, pullRequest.sourceCommitId),
    );
    return { pullRequest, manifest, suites: manifest.suites };
  }

  async start(input: StartTestRunInput): Promise<Versioned<TestRun>> {
    if (input.suiteIds.length === 0)
      throw new ServiceError(400, "select at least one suite");
    const definition = await this.getTestDefinition(input.pullRequestId);
    const selected = definition.suites.filter((suite) =>
      input.suiteIds.includes(suite.id),
    );
    if (selected.length !== input.suiteIds.length)
      throw new ServiceError(
        400,
        "one or more suite ids are not in the manifest",
      );
    const snapshots = await mapLimit(selected, 5, async (suite) => ({
      suite,
      markdown: await this.devOps.getFile(
        suite.path,
        definition.pullRequest.sourceCommitId,
      ),
    }));
    const parsed = snapshots.map(({ suite, markdown }) => ({
      suite,
      markdown,
      definition: parseTestMarkdown(markdown),
    }));
    const run: TestRun = {
      id: randomUUID(),
      repositoryId: input.repositoryId,
      pullRequestId: input.pullRequestId,
      sourceBranch: definition.pullRequest.sourceBranch,
      sourceCommitId: definition.pullRequest.sourceCommitId,
      state: "inProgress",
      startedBy: input.startedBy,
      startedAt: this.now(),
    };
    const created = await this.repositories.runs.create(run);
    for (const { suite, markdown, definition: parsedDefinition } of parsed) {
      await this.repositories.suites.create({
        runId: run.id,
        suiteId: suite.id,
        title: suite.title,
        filePath: suite.path,
        sourceMarkdown: markdown,
      });
      for (const item of parsedDefinition.items) {
        await this.repositories.items.create({
          id: randomUUID(),
          runId: run.id,
          suiteId: suite.id,
          hierarchy: item.hierarchy,
          text: item.text,
          status: "pending",
        });
      }
    }
    return created;
  }

  async get(runId: string) {
    const run = await this.repositories.runs.get(runId);
    if (!run) throw new ServiceError(404, "test run not found");
    return {
      ...run,
      suites: await this.repositories.suites.listByRun(runId),
      items: await this.repositories.items.listByRun(runId),
    };
  }

  async listItems(runId: string) {
    await this.requireRun(runId);
    return this.repositories.items.listByRun(runId);
  }

  async listExecutions(runId: string, itemId: string) {
    await this.requireRun(runId);
    return this.repositories.executions.listByItem(runId, itemId);
  }

  async execute(
    runId: string,
    input: ExecutionInput,
  ): Promise<{
    item: Versioned<TestRunItem>;
    execution: Versioned<TestExecution>;
  }> {
    const run = await this.requireRun(runId);
    if (run.value.state !== "inProgress")
      throw new ServiceError(409, "completed or cancelled runs are read-only");
    const current = await this.repositories.items.get(runId, input.itemId);
    if (!current) throw new ServiceError(404, "test item not found");
    const executedAt = this.now();
    let item: Versioned<TestRunItem>;
    try {
      item = await this.repositories.items.update(
        {
          ...current.value,
          status: input.status,
          lastExecutedBy: input.executedBy,
          lastExecutedAt: executedAt,
        },
        input.expectedEtag,
      );
    } catch (error) {
      if (error instanceof ETagConflictError)
        throw new ServiceError(409, error.message);
      throw error;
    }
    const execution: TestExecution = {
      id: randomUUID(),
      runId,
      itemId: input.itemId,
      status: input.status,
      executedBy: input.executedBy,
      executedAt,
      ...(input.comment ? { comment: input.comment } : {}),
    };
    return {
      item,
      execution: await this.repositories.executions.create(execution),
    };
  }

  async complete(
    runId: string,
    completedBy: string,
  ): Promise<Versioned<TestRun>> {
    const run = await this.requireRun(runId);
    if (run.value.state !== "inProgress")
      throw new ServiceError(409, "only in-progress runs can be completed");
    const items = await this.repositories.items.listByRun(runId);
    if (hasPendingItems(items.map((item) => item.value.status)))
      throw new ServiceError(
        409,
        "all items must be executed before completion",
      );
    return this.repositories.runs.update({
      ...run.value,
      state: "completed",
      result: calculateRunResult(items.map((item) => item.value.status)),
      completedBy,
      completedAt: this.now(),
    });
  }

  async reopen(runId: string): Promise<Versioned<TestRun>> {
    const run = await this.requireRun(runId);
    if (run.value.state !== "completed")
      throw new ServiceError(409, "only completed runs can be reopened");
    const reopened: TestRun = {
      id: run.value.id,
      repositoryId: run.value.repositoryId,
      pullRequestId: run.value.pullRequestId,
      sourceBranch: run.value.sourceBranch,
      sourceCommitId: run.value.sourceCommitId,
      state: "inProgress",
      startedBy: run.value.startedBy,
      startedAt: run.value.startedAt,
    };
    return this.repositories.runs.update(reopened);
  }

  async cancel(runId: string): Promise<Versioned<TestRun>> {
    const run = await this.requireRun(runId);
    if (run.value.state !== "inProgress")
      throw new ServiceError(409, "only in-progress runs can be cancelled");
    return this.repositories.runs.update({
      ...run.value,
      state: "cancelled",
      completedAt: this.now(),
    });
  }

  private async requireRun(runId: string): Promise<Versioned<TestRun>> {
    const run = await this.repositories.runs.get(runId);
    if (!run) throw new ServiceError(404, "test run not found");
    return run;
  }
}
