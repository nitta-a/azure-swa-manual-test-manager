import { expect, test, vi } from "vitest";
import { createGitHubClient } from "../src/index.js";

test("maps pull requests and reads a file at the head commit", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { number: 7, title: "Ship", head: { ref: "feature/ship", sha: "abc" }, base: { ref: "main" } },
        ]),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ number: 7, title: "Ship", head: { ref: "feature/ship", sha: "abc" }, base: { ref: "main" } }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ encoding: "base64", content: Buffer.from("- [ ] ship").toString("base64") })),
    );
  const client = createGitHubClient({ owner: "nitta-a", repository: "manual", token: "secret" }, fetchImpl);
  await expect(client.listPullRequests()).resolves.toEqual([
    { id: 7, title: "Ship", sourceBranch: "feature/ship", targetBranch: "main", sourceCommitId: "abc" },
  ]);
  await expect(client.getPullRequest(7)).resolves.toMatchObject({ id: 7, sourceCommitId: "abc" });
  await expect(client.getFile("tests/smoke.md", "abc")).resolves.toBe("- [ ] ship");
  expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
    headers: expect.objectContaining({ Authorization: "Bearer secret" }),
  });
});

test("surfaces GitHub HTTP errors and malformed content", async () => {
  const client = createGitHubClient(
    { owner: "o", repository: "r", token: "t" },
    vi.fn().mockResolvedValue(new Response("", { status: 404 })),
  );
  await expect(client.getPullRequest(1)).rejects.toThrow("(404)");
  const malformed = createGitHubClient(
    { owner: "o", repository: "r", token: "t" },
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: "not encoded" }))),
  );
  await expect(malformed.getFile("x.md", "sha")).rejects.toThrow("no base64 content");
  const invalidBase64 = createGitHubClient(
    { owner: "o", repository: "r", token: "t" },
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ encoding: "base64", content: "%%%" }))),
  );
  await expect(invalidBase64.getFile("x.md", "sha")).rejects.toThrow("content is malformed");
});

test.each([401, 403])("surfaces GitHub auth error %s", async (status) => {
  const client = createGitHubClient(
    { owner: "o", repository: "r", token: "t" },
    vi.fn().mockResolvedValue(new Response("", { status })),
  );
  await expect(client.getPullRequest(1)).rejects.toThrow(`(${status})`);
});
