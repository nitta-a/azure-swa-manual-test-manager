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
