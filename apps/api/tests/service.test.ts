import type { AzureDevOpsClient, PullRequest } from "@manual-test-manager/azure-devops";
import { InMemoryRepositories } from "@manual-test-manager/storage";
import { expect, test } from "vitest";
import { TestRunService } from "../src/service.js";

const pullRequest: PullRequest = {
  id: 42,
  title: "Add checkout flow",
  sourceBranch: "refs/heads/feature/checkout",
  targetBranch: "refs/heads/main",
  sourceCommitId: "commit-42",
};

const manifest = `version: 1
suites:
  - id: smoke
    title: Smoke tests
    path: tests/smoke.md
  - id: regression
    title: Regression tests
    path: tests/regression.md
`;

function fixture() {
  const files: Record<string, string> = {
    "manifest.yml": manifest,
    "tests/smoke.md": "## Login\n- [ ] sign in\n- [ ] sign out",
    "tests/regression.md": "## Checkout\n- [ ] place order",
  };
  const fileRequests: Array<{ path: string; commitId: string }> = [];
  const devOps: AzureDevOpsClient = {
    async listPullRequests() {
      return [pullRequest];
    },
    async getPullRequest() {
      return pullRequest;
    },
    async getFile(path, commitId) {
      fileRequests.push({ path, commitId });
      const content = files[path];
      if (content === undefined) throw new Error(`missing fixture: ${path}`);
      return content;
    },
  };
  const repositories = new InMemoryRepositories();
  const service = new TestRunService(repositories, devOps, "manifest.yml", () => "2026-01-01T00:00:00.000Z");
  return { fileRequests, repositories, service };
}

async function startRun(service: TestRunService, suiteIds: string[] = ["smoke"]) {
  return service.start({
    repositoryId: "repo-1",
    pullRequestId: pullRequest.id,
    suiteIds,
    startedBy: "alice",
  });
}

test("lists pull requests and reads a definition at the PR source commit", async () => {
  const { fileRequests, service } = fixture();

  await expect(service.listPullRequests()).resolves.toEqual([pullRequest]);
  await expect(service.getPullRequest(pullRequest.id)).resolves.toEqual(pullRequest);
  const definition = await service.getTestDefinition(pullRequest.id);

  expect(definition.pullRequest).toEqual(pullRequest);
  expect(definition.manifest.suites.map((suite) => suite.id)).toEqual(["smoke", "regression"]);
  expect(fileRequests).toContainEqual({
    path: "manifest.yml",
    commitId: "commit-42",
  });
});

test("rejects empty and unknown suite selections", async () => {
  const { service } = fixture();

  await expect(startRun(service, [])).rejects.toMatchObject({
    status: 400,
    message: "select at least one suite",
  });
  await expect(startRun(service, ["unknown"])).rejects.toMatchObject({
    status: 400,
    message: "one or more suite ids are not in the manifest",
  });
});

test("creates a run with suite, item, and source snapshots", async () => {
  const { fileRequests, repositories, service } = fixture();

  const created = await startRun(service, ["smoke", "regression"]);
  const suites = await repositories.suites.listByRun(created.value.id);
  const items = await service.listItems(created.value.id);

  expect(created.value).toMatchObject({
    repositoryId: "repo-1",
    pullRequestId: 42,
    sourceBranch: pullRequest.sourceBranch,
    sourceCommitId: pullRequest.sourceCommitId,
    state: "inProgress",
    startedBy: "alice",
    startedAt: "2026-01-01T00:00:00.000Z",
  });
  expect(suites).toHaveLength(2);
  expect(suites[0]?.value.sourceMarkdown).toContain("sign in");
  expect(items).toHaveLength(3);
  expect(items.every((item) => item.value.status === "pending")).toBe(true);
  expect(fileRequests).toContainEqual({
    path: "tests/smoke.md",
    commitId: "commit-42",
  });
  expect(fileRequests).toContainEqual({
    path: "tests/regression.md",
    commitId: "commit-42",
  });
});

test("returns a run with its suites and items and records executions", async () => {
  const { service } = fixture();
  const created = await startRun(service);
  const [item] = await service.listItems(created.value.id);
  if (!item) throw new Error("item fixture is missing");

  const execution = await service.execute(created.value.id, {
    itemId: item.value.id,
    status: "passed",
    executedBy: "bob",
    expectedEtag: item.etag,
    comment: "looks good",
  });
  const run = await service.get(created.value.id);
  const executions = await service.listExecutions(created.value.id, item.value.id);

  expect(run.value).toEqual(created.value);
  expect(run.suites).toHaveLength(1);
  expect(run.items[0]?.value.status).toBe("passed");
  expect(execution.execution.value).toMatchObject({
    runId: created.value.id,
    itemId: item.value.id,
    status: "passed",
    executedBy: "bob",
    executedAt: "2026-01-01T00:00:00.000Z",
    comment: "looks good",
  });
  expect(executions).toHaveLength(1);
});

test("does not complete a run while items are pending", async () => {
  const { service } = fixture();
  const created = await startRun(service);

  await expect(service.complete(created.value.id, "alice")).rejects.toMatchObject({
    status: 409,
    message: "all items must be executed before completion",
  });
});

test("calculates a failed result, makes completion read-only, and reopens it", async () => {
  const { service } = fixture();
  const created = await startRun(service);
  const items = await service.listItems(created.value.id);

  for (const [index, item] of items.entries()) {
    await service.execute(created.value.id, {
      itemId: item.value.id,
      status: index === 0 ? "passed" : "failed",
      executedBy: "alice",
      expectedEtag: item.etag,
    });
  }
  const completed = await service.complete(created.value.id, "alice");

  expect(completed.value).toMatchObject({
    state: "completed",
    result: "failed",
    completedBy: "alice",
    completedAt: "2026-01-01T00:00:00.000Z",
  });
  await expect(
    service.execute(created.value.id, {
      itemId: items[0]?.value.id || "missing",
      status: "passed",
      executedBy: "alice",
      expectedEtag: "stale",
    }),
  ).rejects.toMatchObject({ status: 409 });

  const reopened = await service.reopen(created.value.id);
  expect(reopened.value).toMatchObject({ state: "inProgress" });
  expect(reopened.value.result).toBeUndefined();
  expect(reopened.value.completedAt).toBeUndefined();
});

test("calculates blocked when all executed items are non-failing", async () => {
  const { service } = fixture();
  const created = await startRun(service);
  const items = await service.listItems(created.value.id);

  for (const [index, item] of items.entries()) {
    await service.execute(created.value.id, {
      itemId: item.value.id,
      status: index === 0 ? "blocked" : "skipped",
      executedBy: "alice",
      expectedEtag: item.etag,
    });
  }

  await expect(service.complete(created.value.id, "alice")).resolves.toMatchObject({
    value: { result: "blocked" },
  });
});

test("maps stale ETags and missing items to service errors", async () => {
  const { service } = fixture();
  const created = await startRun(service);
  const [item] = await service.listItems(created.value.id);
  if (!item) throw new Error("item fixture is missing");

  await service.execute(created.value.id, {
    itemId: item.value.id,
    status: "passed",
    executedBy: "alice",
    expectedEtag: item.etag,
  });
  await expect(
    service.execute(created.value.id, {
      itemId: item.value.id,
      status: "failed",
      executedBy: "alice",
      expectedEtag: item.etag,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.execute(created.value.id, {
      itemId: "missing",
      status: "passed",
      executedBy: "alice",
      expectedEtag: "etag",
    }),
  ).rejects.toMatchObject({ status: 404, message: "test item not found" });
});

test("cancels runs and rejects invalid state transitions and missing runs", async () => {
  const { service } = fixture();
  const created = await startRun(service);

  await expect(service.cancel(created.value.id, "alice")).resolves.toMatchObject({
    value: { state: "cancelled" },
  });
  await expect(service.cancel(created.value.id, "alice")).rejects.toMatchObject({
    status: 409,
    message: "only in-progress runs can be cancelled",
  });
  await expect(service.complete(created.value.id, "alice")).rejects.toMatchObject({
    status: 409,
    message: "only in-progress runs can be completed",
  });
  await expect(service.reopen(created.value.id)).rejects.toMatchObject({
    status: 409,
    message: "only completed runs can be reopened",
  });
  await expect(service.get("missing")).rejects.toMatchObject({
    status: 404,
    message: "test run not found",
  });
  await expect(service.listItems("missing")).rejects.toMatchObject({
    status: 404,
  });
  await expect(service.listExecutions("missing", "item")).rejects.toMatchObject({
    status: 404,
  });
});
