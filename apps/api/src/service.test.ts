import type { AzureDevOpsClient } from "@manual-test-manager/azure-devops";
import { InMemoryRepositories } from "@manual-test-manager/storage";
import { expect, test } from "vitest";
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
  const service = new TestRunService(repositories, devOps, "manifest.yml", () => "2026-01-01T00:00:00.000Z");
  const created = await service.start({
    repositoryId: "repo",
    pullRequestId: 1,
    suiteIds: ["todo"],
    startedBy: "user",
  });
  const items = await service.listItems(created.value.id);
  expect(items).toHaveLength(1);
  const firstItem = items[0];
  expect(firstItem).toBeTruthy();
  if (!firstItem) throw new Error("test item fixture is missing");
  suiteMarkdown = "## TODO\n- [ ] changed after run";
  const [suite] = await repositories.suites.listByRun(created.value.id);
  expect(suite).toBeTruthy();
  expect(suite?.value.sourceMarkdown).toBe("## TODO\n- [ ] works");
  const executed = await service.execute(created.value.id, {
    itemId: firstItem.value.id,
    status: "passed",
    executedBy: "user",
    expectedEtag: firstItem.etag,
    comment: "done",
  });
  expect(await repositories.executions.listByItem(created.value.id, firstItem.value.id)).toHaveLength(1);
  expect(executed.item.value.status).toBe("passed");
  await service.complete(created.value.id, "user");
  expect((await service.get(created.value.id)).value.state).toBe("completed");
  expect((await service.reopen(created.value.id)).value.state).toBe("inProgress");
});
