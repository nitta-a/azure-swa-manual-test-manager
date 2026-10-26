import { testItemSelectionId } from "@manual-test-manager/domain";
import type { SourceControlClient } from "@manual-test-manager/source-control";
import { InMemoryRepositories } from "@manual-test-manager/storage";
import { expect, test } from "vitest";
import { TestRunService } from "../src/service.js";

test("App Managed edits create revisions without changing an existing run snapshot", async () => {
  const repositories = new InMemoryRepositories();
  const service = new TestRunService(
    repositories,
    {
      listPullRequests: async () => [],
      getPullRequest: async () => {
        throw new Error("not used");
      },
      getFile: async () => {
        throw new Error("not used");
      },
    },
    "manifest.yml",
    () => "2026-01-01T00:00:00.000Z",
  );
  const created = await service.createTestDefinition(
    "Smoke",
    {
      suites: [
        {
          id: "login",
          title: "Login",
          items: [
            { hierarchy: ["Authentication"], text: "Sign in" },
            { hierarchy: ["Authentication"], text: "Sign out" },
          ],
        },
      ],
    },
    "alice",
  );
  const definition = await service.getTestDefinitionById(created.value.id);
  const firstItem = definition.items[0]?.value;
  if (!firstItem) throw new Error("fixture item missing");
  const run = await service.start({
    source: { type: "appManaged", definitionId: created.value.id },
    suiteIds: ["login"],
    itemIds: [testItemSelectionId("login", firstItem.id)],
    startedBy: "alice",
    releaseName: "v1",
    browser: "Firefox",
  });
  const [before] = await service.listItems(run.value.id);
  if (!definition.value || !before) throw new Error("fixture missing");
  expect(run.value).toMatchObject({ releaseName: "v1", browser: "Firefox" });
  expect((await service.listItems(run.value.id)).map((item) => item.value.inScope)).toEqual([true, false]);
  await service.updateTestDefinition(
    created.value.id,
    "Smoke v2",
    { suites: [{ id: "login", title: "Login", items: [{ hierarchy: [], text: "Sign in with SSO" }] }] },
    "bob",
    definition.etag,
  );
  const after = await service.listItems(run.value.id);
  expect(after.map((item) => item.value.text)).toEqual(["Sign in", "Sign out"]);
  expect((await service.getTestDefinitionById(created.value.id)).value.name).toBe("Smoke v2");
  await expect(
    service.start({
      source: { type: "appManaged", definitionId: created.value.id },
      expectedDefinitionVersion: definition.value.currentRevisionId,
      suiteIds: ["login"],
      startedBy: "alice",
    }),
  ).rejects.toMatchObject({ status: 409 });
});

test("imports repository definitions with provenance and keeps them independent", async () => {
  let markdown = "## Login\n- [ ] Sign in";
  const provider: SourceControlClient = {
    listPullRequests: async () => [],
    getPullRequest: async () => ({
      id: 7,
      title: "PR",
      sourceBranch: "feature/login",
      targetBranch: "main",
      sourceCommitId: "sha-7",
    }),
    getFile: async (path) =>
      path === "manifest.yml"
        ? "version: 2\napplications:\n  - id: account\n    title: Account\n    features:\n      - id: login\n        title: Login\n        path: login.md"
        : markdown,
  };
  const repositories = new InMemoryRepositories();
  const service = new TestRunService(repositories, provider, "manifest.yml", undefined, {
    providers: { azureRepos: provider, github: provider },
  });

  const imported = await service.importTestDefinition(
    { type: "github", repositoryId: "owner/repo", pullRequestId: 7 },
    ["account:login"],
    "Imported login",
    "alice",
  );
  const definition = await service.getTestDefinitionById(imported.value.id);
  const revisions = await service.listDefinitionRevisions(imported.value.id);

  expect(revisions[0]?.value.importedFrom).toMatchObject({
    provider: "github",
    repositoryId: "owner/repo",
    pullRequestId: 7,
    commitId: "sha-7",
    importedBy: "alice",
  });
  expect(definition.suites[0]?.value).toMatchObject({
    applicationId: "account",
    applicationTitle: "Account",
    featureId: "login",
    featureTitle: "Login",
  });
  expect(definition.items[0]?.value.text).toBe("Sign in");
  markdown = "## Login\n- [ ] Changed later";
  expect((await service.getTestDefinitionById(imported.value.id)).items[0]?.value.text).toBe("Sign in");

  markdown = "## Login\n- [ ] Sign in";
  const azureImported = await service.importTestDefinition(
    { type: "azureRepos", repositoryId: "repo", pullRequestId: 7 },
    ["account:login"],
    "Imported Azure login",
    "alice",
  );
  expect((await service.getTestDefinitionById(azureImported.value.id)).items[0]?.value.text).toBe("Sign in");
});

test("rejects stale App Managed updates before creating another revision", async () => {
  const repositories = new InMemoryRepositories();
  const service = new TestRunService(
    repositories,
    {
      listPullRequests: async () => [],
      getPullRequest: async () => {
        throw new Error("not used");
      },
      getFile: async () => {
        throw new Error("not used");
      },
    },
    "manifest.yml",
  );
  const created = await service.createTestDefinition(
    "Smoke",
    { suites: [{ id: "login", title: "Login", items: [{ hierarchy: [], text: "Sign in" }] }] },
    "alice",
  );
  const current = await service.getTestDefinitionById(created.value.id);
  await service.updateTestDefinition(
    created.value.id,
    "Smoke v2",
    { suites: [{ id: "login", title: "Login", items: [{ hierarchy: [], text: "SSO" }] }] },
    "bob",
    current.etag,
  );

  await expect(
    service.updateTestDefinition(
      created.value.id,
      "Smoke v3",
      { suites: [{ id: "login", title: "Login", items: [{ hierarchy: [], text: "Other" }] }] },
      "carol",
      current.etag,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(await service.listDefinitionRevisions(created.value.id)).toHaveLength(2);
});
