import { randomUUID } from "node:crypto";
import { calculateRunResult, hasPendingItems, type TestRun } from "@manual-test-manager/domain";
import { parseTestMarkdown } from "@manual-test-manager/markdown-parser";
import type { RepositorySet, Versioned } from "@manual-test-manager/storage";
import type { StartTestRunInput } from "../service.js";
import type { ServiceContext } from "./context.js";
import { ServiceError } from "./errors.js";
import { getTestDefinition } from "./pull-requests.js";

async function mapLimit<T, R>(values: readonly T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      const value = values[index];
      if (value !== undefined) output[index] = await fn(value);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

export async function start(context: ServiceContext, input: StartTestRunInput): Promise<Versioned<TestRun>> {
  if (input.suiteIds.length === 0) throw new ServiceError(400, "select at least one suite");
  const definition = await getTestDefinition(context, input.pullRequestId);
  const selected = definition.suites.filter((suite) => input.suiteIds.includes(suite.id));
  if (selected.length !== input.suiteIds.length)
    throw new ServiceError(400, "one or more suite ids are not in the manifest");
  const snapshots = await mapLimit(selected, 5, async (suite) => ({
    suite,
    markdown: await context.devOps.getFile(suite.path, definition.pullRequest.sourceCommitId),
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
    startedAt: context.now(),
  };
  const created = await context.repositories.runs.create(run);
  for (const { suite, markdown, definition: parsedDefinition } of parsed) {
    await context.repositories.suites.create({
      runId: run.id,
      suiteId: suite.id,
      title: suite.title,
      filePath: suite.path,
      sourceMarkdown: markdown,
    });
    for (const item of parsedDefinition.items) {
      await context.repositories.items.create({
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
  return context.repositories.runs.update({
    ...run.value,
    state: "completed",
    result: calculateRunResult(items.map((item) => item.value.status)),
    completedBy,
    completedAt: context.now(),
  });
}

export async function reopen(context: ServiceContext, runId: string): Promise<Versioned<TestRun>> {
  const run = await requireRun(context.repositories, runId);
  if (run.value.state !== "completed") throw new ServiceError(409, "only completed runs can be reopened");
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
  return context.repositories.runs.update(reopened);
}

export async function cancel(context: ServiceContext, runId: string): Promise<Versioned<TestRun>> {
  const run = await requireRun(context.repositories, runId);
  if (run.value.state !== "inProgress") throw new ServiceError(409, "only in-progress runs can be cancelled");
  return context.repositories.runs.update({
    ...run.value,
    state: "cancelled",
    completedAt: context.now(),
  });
}

export async function requireRun(repositories: RepositorySet, runId: string): Promise<Versioned<TestRun>> {
  const run = await repositories.runs.get(runId);
  if (!run) throw new ServiceError(404, "test run not found");
  return run;
}
