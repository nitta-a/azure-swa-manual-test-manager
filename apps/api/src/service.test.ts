import assert from "node:assert/strict";
import test from "node:test";
import type { AzureDevOpsClient } from "@manual-test-manager/azure-devops";
import { InMemoryRepositories } from "@manual-test-manager/storage";
import { TestRunService } from "./service.js";

let suiteMarkdown = "## TODO\n- [ ] works";
const devOps: AzureDevOpsClient = {
  async listPullRequests() {
    return [
      {
        id: 1,
        title: "PR",
        sourceBranch: "refs/heads/feature",
        targetBranch: "refs/heads/main",
        sourceCommitId: "commit-1",
      },
    ];
  },
  async getPullRequest() {
    const [pullRequest] = await this.listPullRequests();
    if (!pullRequest) throw new Error("pull request fixture is missing");
    return pullRequest;
  },
  async getFile(path) {
    return path.includes("manifest")
      ? "version: 1\nsuites:\n  - id: todo\n    title: TODO\n    path: todo.md"
      : suiteMarkdown;
  },
};

test("starts from a commit snapshot and records execution history", async () => {
  const repositories = new InMemoryRepositories();
  const service = new TestRunService(
    repositories,
    devOps,
    "manifest.yml",
    () => "2026-01-01T00:00:00.000Z",
  );
  const created = await service.start({
    repositoryId: "repo",
    pullRequestId: 1,
    suiteIds: ["todo"],
    startedBy: "user",
  });
  const items = await service.listItems(created.value.id);
  assert.equal(items.length, 1);
  const firstItem = items[0];
  assert.ok(firstItem);
  suiteMarkdown = "## TODO\n- [ ] changed after run";
  const [suite] = await repositories.suites.listByRun(created.value.id);
  assert.ok(suite);
  assert.equal(suite.value.sourceMarkdown, "## TODO\n- [ ] works");
  const executed = await service.execute(created.value.id, {
    itemId: firstItem.value.id,
    status: "passed",
    executedBy: "user",
    expectedEtag: firstItem.etag,
    comment: "done",
  });
  assert.equal(
    (
      await repositories.executions.listByItem(
        created.value.id,
        firstItem.value.id,
      )
    ).length,
    1,
  );
  assert.equal(executed.item.value.status, "passed");
  await service.complete(created.value.id, "user");
  assert.equal((await service.get(created.value.id)).value.state, "completed");
  assert.equal(
    (await service.reopen(created.value.id)).value.state,
    "inProgress",
  );
});
