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
  const updated = await repositories.items.update(
    { ...created.value, status: "passed" },
    created.etag,
  );
  await expect(
    repositories.items.update(
      { ...created.value, status: "failed" },
      created.etag,
    ),
  ).rejects.toThrowError(ETagConflictError);
  expect(updated.value.status).toBe("passed");
});
