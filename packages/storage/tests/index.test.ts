import { expect, test } from "vitest";
import { ETagConflictError, InMemoryRepositories } from "../dist/index.js";

test("detects stale item ETags", async () => {
  const repositories = new InMemoryRepositories();
  const created = await repositories.items.create({
    id: "item",
    runId: "run",
    suiteId: "suite",
    hierarchy: [],
    text: "check",
    status: "pending",
  });
  const updated = await repositories.items.update({ ...created.value, status: "passed" }, created.etag);
  await expect(repositories.items.update({ ...created.value, status: "failed" }, created.etag)).rejects.toThrowError(
    ETagConflictError,
  );
  expect(updated.value.status).toBe("passed");
});

test("treats legacy runs without sourceType as Azure Repos runs", async () => {
  const repositories = new InMemoryRepositories();
  await repositories.runs.create({
    id: "legacy-run",
    state: "inProgress",
    repositoryId: "repo",
    pullRequestId: 1,
    startedBy: "alice",
    startedAt: "2026-01-01T00:00:00.000Z",
  });

  await expect(repositories.runs.get("legacy-run")).resolves.toMatchObject({
    value: { sourceType: "azureRepos" },
  });
});

test("lists summaries newest first with a cursor", async () => {
  const repositories = new InMemoryRepositories();
  for (const [runId, startedAt] of [
    ["old", "2026-01-01T00:00:00.000Z"],
    ["new", "2026-01-02T00:00:00.000Z"],
  ])
    await repositories.summaries.upsert({
      runId,
      projectId: "project",
      sourceType: "github",
      state: "inProgress",
      startedBy: "alice",
      startedAt,
      totalCount: 1,
      pendingCount: 1,
      passedCount: 0,
      failedCount: 0,
      blockedCount: 0,
      skippedCount: 0,
    });

  const first = await repositories.summaries.list("project", { limit: 1 });
  expect(first.items[0]?.value.runId).toBe("new");
  expect(first.nextCursor).toBeTruthy();
  await expect(repositories.summaries.list("project", { limit: 1, cursor: first.nextCursor })).resolves.toMatchObject({
    items: [{ value: { runId: "old" } }],
  });
});
