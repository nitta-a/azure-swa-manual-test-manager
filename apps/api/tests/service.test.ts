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
  expect(suites.map((suite) => suite.value.order)).toEqual([0, 1]);
  expect(suites[0]?.value.sourceMarkdown).toContain("sign in");
  expect(items).toHaveLength(3);
  expect(items.map((item) => item.value.order)).toEqual([0, 1, 0]);
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

test("stores selected items, excluded items, and release/environment metadata on the run", async () => {
  const { service, repositories } = fixture();
  const created = await service.start({
    repositoryId: "repo-1",
    pullRequestId: pullRequest.id,
    suiteIds: ["smoke"],
    itemIds: ["smoke:1"],
    startedBy: "alice",
    releaseName: "release-2026.1",
    environmentUrl: "https://example.test",
    makerVersion: "maker-1.2",
    appVersionBefore: "a1",
    appVersionAfter: "a2",
    browser: "Firefox",
    locale: "ja-JP",
  });
  const items = await service.listItems(created.value.id);
  const summary = await service.listRuns({});

  expect(created.value).toMatchObject({
    releaseName: "release-2026.1",
    environmentUrl: "https://example.test",
    makerVersion: "maker-1.2",
    sourceCommitId: pullRequest.sourceCommitId,
    appVersionBefore: "a1",
    appVersionAfter: "a2",
    browser: "Firefox",
    locale: "ja-JP",
  });
  expect(items.map((item) => [item.value.text, item.value.inScope])).toEqual([
    ["sign in", false],
    ["sign out", true],
  ]);
  expect(summary.items[0]).toMatchObject({ totalCount: 1, pendingCount: 1, excludedCount: 1 });
  await expect(
    service.execute(created.value.id, {
      itemId: items[0]?.value.id || "",
      status: "passed",
      executedBy: "alice",
      expectedEtag: items[0]?.etag || "",
    }),
  ).rejects.toMatchObject({ status: 409, message: "test item is outside the selected run scope" });
  await expect(repositories.suites.listByRun(created.value.id)).resolves.toHaveLength(1);
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
    evidenceUrl: "https://example.test/evidence.png",
    issueTicketUrl: "https://example.test/issues/42",
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
    evidenceUrl: "https://example.test/evidence.png",
    issueTicketUrl: "https://example.test/issues/42",
  });
  expect(run.items[0]?.value).toMatchObject({
    lastComment: "looks good",
    lastEvidenceUrl: "https://example.test/evidence.png",
    lastIssueTicketUrl: "https://example.test/issues/42",
  });
  expect(executions).toHaveLength(1);
  await expect(service.listRuns({ limit: 20 })).resolves.toMatchObject({
    items: [{ runId: created.value.id, pendingCount: 1, passedCount: 1, failedCount: 0 }],
  });

  const current = (await service.listItems(created.value.id))[0];
  if (!current) throw new Error("item fixture is missing");
  await service.execute(created.value.id, {
    itemId: current.value.id,
    status: "failed",
    executedBy: "bob",
    expectedEtag: current.etag,
    comment: "regression found",
  });
  await expect(service.listRuns({ limit: 20 })).resolves.toMatchObject({
    items: [{ pendingCount: 1, passedCount: 0, failedCount: 1 }],
  });
});

test("restores the current item if execution history cannot be saved", async () => {
  const { service, repositories } = fixture();
  const created = await startRun(service);
  const [item] = await service.listItems(created.value.id);
  if (!item) throw new Error("item fixture is missing");
  repositories.executions.create = async () => {
    throw new Error("history storage unavailable");
  };

  await expect(
    service.execute(created.value.id, {
      itemId: item.value.id,
      status: "passed",
      executedBy: "alice",
      expectedEtag: item.etag,
    }),
  ).rejects.toThrow("history storage unavailable");
  const [restored] = await service.listItems(created.value.id);
  expect(restored?.value).toMatchObject({ status: "pending" });
  expect(restored?.value.lastExecutedBy).toBeUndefined();
  await expect(service.listExecutions(created.value.id, item.value.id)).resolves.toHaveLength(0);
});

test("requires comments for failed and blocked executions", async () => {
  for (const status of ["failed", "blocked"] as const) {
    const { service } = fixture();
    const created = await startRun(service);
    const [item] = await service.listItems(created.value.id);
    if (!item) throw new Error("item fixture is missing");
    await expect(
      service.execute(created.value.id, {
        itemId: item.value.id,
        status,
        executedBy: "alice",
        expectedEtag: item.etag,
      }),
    ).rejects.toMatchObject({ status: 400, message: "comment is required for failed or blocked execution" });
  }
});

test("requires a reason for skipped executions", async () => {
  const { service } = fixture();
  const created = await startRun(service);
  const [item] = await service.listItems(created.value.id);
  if (!item) throw new Error("item fixture is missing");

  await expect(
    service.execute(created.value.id, {
      itemId: item.value.id,
      status: "skipped",
      executedBy: "alice",
      expectedEtag: item.etag,
    }),
  ).rejects.toMatchObject({ status: 400, message: "a reason is required for skipped execution" });
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
      ...(index === 0 ? {} : { comment: "failure details" }),
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
      comment: index === 0 ? "blocked by dependency" : "not applicable",
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
      comment: "stale attempt",
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
