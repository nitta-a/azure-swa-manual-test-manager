import { randomUUID } from "node:crypto";
import {
  calculateRunProgress,
  calculateRunResult,
  hasPendingItems,
  type TestRun,
  type TestRunSummary,
} from "@manual-test-manager/domain";
import type { RepositorySet, TestRunSummaryQuery, Versioned } from "@manual-test-manager/storage";
import type { StartTestRunInput } from "../service.js";
import type { ServiceContext } from "./context.js";
import { ServiceError } from "./errors.js";
import { type DefinitionSource, resolveTestDefinition } from "./resolver.js";

export async function start(context: ServiceContext, input: StartTestRunInput): Promise<Versioned<TestRun>> {
  if (input.suiteIds.length === 0) throw new ServiceError(400, "select at least one suite");
  const source: DefinitionSource =
    input.source ||
    (input.repositoryId !== undefined && input.pullRequestId !== undefined
      ? { type: "azureRepos", repositoryId: input.repositoryId, pullRequestId: input.pullRequestId }
      : (() => {
          throw new ServiceError(400, "source is required");
        })());
  const definition = await resolveTestDefinition(context, source, input.suiteIds);
  const runBase = {
    id: randomUUID(),
    state: "inProgress" as const,
    startedBy: input.startedBy,
    startedAt: context.now(),
  };
  const run: TestRun =
    definition.source.type === "appManaged"
      ? {
          ...runBase,
          sourceType: "appManaged",
          definitionId: definition.source.definitionId,
          definitionRevisionId: definition.source.revisionId,
        }
      : {
          ...runBase,
          sourceType: definition.source.type,
          repositoryId: definition.source.repositoryId,
          pullRequestId: definition.source.pullRequest.id,
          sourceBranch: definition.source.pullRequest.sourceBranch,
          sourceCommitId: definition.source.pullRequest.sourceCommitId,
        };
  const created = await context.repositories.runs.create(run);
  for (const suite of definition.suites) {
    await context.repositories.suites.create({
      runId: run.id,
      suiteId: suite.id,
      title: suite.title,
      ...(suite.sourcePath ? { filePath: suite.sourcePath, sourcePath: suite.sourcePath } : {}),
      ...(suite.sourceContent ? { sourceMarkdown: suite.sourceContent, sourceContent: suite.sourceContent } : {}),
    });
    for (const item of suite.items) {
      await context.repositories.items.create({
        id: item.id || randomUUID(),
        runId: run.id,
        suiteId: suite.id,
        hierarchy: item.hierarchy,
        text: item.text,
        status: "pending",
      });
    }
  }
  await syncSummary(context, run.id);
  return created;
}

export async function get(context: ServiceContext, runId: string) {
  const run = await context.repositories.runs.get(runId);
  if (!run) throw new ServiceError(404, "test run not found");
  return {
    ...run,
    suites: await context.repositories.suites.listByRun(runId),
    items: await context.repositories.items.listByRun(runId),
  };
}

export async function listItems(context: ServiceContext, runId: string) {
  await requireRun(context.repositories, runId);
  return context.repositories.items.listByRun(runId);
}

export async function list(context: ServiceContext, query: TestRunSummaryQuery) {
  const page = await context.repositories.summaries.list(context.projectId, query);
  return {
    items: page.items.map((entry) => entry.value),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  };
}

export async function syncSummary(context: ServiceContext, runId: string): Promise<Versioned<TestRunSummary>> {
  const run = await requireRun(context.repositories, runId);
  const items = await context.repositories.items.listByRun(runId);
  const progress = calculateRunProgress(items.map((item) => item.value));
  const value: TestRunSummary = {
    runId,
    projectId: context.projectId,
    sourceType: run.value.sourceType || "azureRepos",
    state: run.value.state,
    startedBy: run.value.startedBy,
    startedAt: run.value.startedAt,
    totalCount: progress.total,
    pendingCount: progress.pending,
    passedCount: progress.passed,
    failedCount: progress.failed,
    blockedCount: progress.blocked,
    skippedCount: progress.skipped,
    ...(run.value.repositoryId ? { repositoryId: run.value.repositoryId } : {}),
    ...(run.value.pullRequestId !== undefined ? { pullRequestId: run.value.pullRequestId } : {}),
    ...(run.value.definitionId ? { definitionId: run.value.definitionId } : {}),
    ...(run.value.sourceCommitId ? { sourceCommitId: run.value.sourceCommitId } : {}),
    ...(run.value.definitionRevisionId ? { definitionRevisionId: run.value.definitionRevisionId } : {}),
    ...(run.value.result ? { result: run.value.result } : {}),
    ...(run.value.completedBy ? { completedBy: run.value.completedBy } : {}),
    ...(run.value.completedAt ? { completedAt: run.value.completedAt } : {}),
  };
  return context.repositories.summaries.upsert(value);
}

export async function complete(
  context: ServiceContext,
  runId: string,
  completedBy: string,
): Promise<Versioned<TestRun>> {
  const run = await requireRun(context.repositories, runId);
  if (run.value.state !== "inProgress") throw new ServiceError(409, "only in-progress runs can be completed");
  const items = await context.repositories.items.listByRun(runId);
  if (hasPendingItems(items.map((item) => item.value.status)))
    throw new ServiceError(409, "all items must be executed before completion");
  const updated = await context.repositories.runs.update({
    ...run.value,
    state: "completed",
    result: calculateRunResult(items.map((item) => item.value.status)),
    completedBy,
    completedAt: context.now(),
  });
  await syncSummary(context, runId);
  return updated;
}

export async function reopen(context: ServiceContext, runId: string): Promise<Versioned<TestRun>> {
  const run = await requireRun(context.repositories, runId);
  if (run.value.state !== "completed") throw new ServiceError(409, "only completed runs can be reopened");
  const reopened: TestRun = { ...run.value, state: "inProgress" };
  delete reopened.result;
  delete reopened.completedBy;
  delete reopened.completedAt;
  const updated = await context.repositories.runs.update(reopened);
  await syncSummary(context, runId);
  return updated;
}

export async function cancel(context: ServiceContext, runId: string): Promise<Versioned<TestRun>> {
  const run = await requireRun(context.repositories, runId);
  if (run.value.state !== "inProgress") throw new ServiceError(409, "only in-progress runs can be cancelled");
  const updated = await context.repositories.runs.update({
    ...run.value,
    state: "cancelled",
    completedAt: context.now(),
  });
  await syncSummary(context, runId);
  return updated;
}

export async function requireRun(repositories: RepositorySet, runId: string): Promise<Versioned<TestRun>> {
  const run = await repositories.runs.get(runId);
  if (!run) throw new ServiceError(404, "test run not found");
  return run;
}
