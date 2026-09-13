import assert from "node:assert/strict";
import test from "node:test";
import { ETagConflictError, InMemoryRepositories } from "./index.js";

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
  await assert.rejects(
    () =>
      repositories.items.update(
        { ...created.value, status: "failed" },
        created.etag,
      ),
    ETagConflictError,
  );
  assert.equal(updated.value.status, "passed");
});
