import { expect, test } from "vitest";
import { createAzureDevOpsClient } from "../dist/index.js";

test("maps pull requests and fetches files at a commit", async () => {
  const urls: string[] = [];
  const client = createAzureDevOpsClient(
    {
      organizationUrl: "https://dev.azure.com/acme",
      project: "Project A",
      repositoryId: "repo",
      pat: "secret",
    },
    async (input) => {
      urls.push(String(input));
      const body = String(input).includes("items?")
        ? { content: "hello" }
        : {
            pullRequestId: 7,
            title: "Fix",
            sourceRefName: "refs/heads/feature",
            targetRefName: "refs/heads/main",
            lastMergeSourceCommit: { commitId: "abc" },
          };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  expect(await client.getPullRequest(7)).toEqual({
    id: 7,
    title: "Fix",
    sourceBranch: "refs/heads/feature",
    targetBranch: "refs/heads/main",
    sourceCommitId: "abc",
  });
  expect(await client.getFile("tests/a.md", "abc")).toBe("hello");
  expect(urls).toHaveLength(2);
  expect(urls[1] ?? "").toMatch(/versionDescriptor\.version=abc/);
});
