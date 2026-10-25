import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("requests pull requests and definitions", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ pullRequest: {}, suites: [] }))
      .mockResolvedValueOnce(jsonResponse({ pullRequest: {}, suites: [] }));

    await api.listPullRequests();
    await api.getDefinition("42");
    await api.getDefinition("7", "github", "owner/repository");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/projects/default/pull-requests");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/projects/default/pull-requests/42/test-definition");
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/projects/default/pull-requests/7/test-definition?provider=github&repositoryId=owner%2Frepository",
    );
  });

  it("sends a run creation request", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: { id: "run-1" } }));

    await api.startRun(42, ["smoke"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test-runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          repositoryId: "repository",
          pullRequestId: 42,
          suiteIds: ["smoke"],
        }),
      }),
    );
  });

  it("sends item scope and run environment metadata", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: { id: "run-1" } }));

    await api.startRun({ type: "azureRepos", repositoryId: "repo", pullRequestId: 42 }, ["smoke"], ["smoke:1"], {
      releaseName: "v2",
      environmentUrl: "https://example.test",
      browser: "Firefox",
    });

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          source: { type: "azureRepos", repositoryId: "repo", pullRequestId: 42 },
          suiteIds: ["smoke"],
          itemIds: ["smoke:1"],
          releaseName: "v2",
          environmentUrl: "https://example.test",
          browser: "Firefox",
        }),
      }),
    );
  });

  it("sends execution and completion requests", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({}));

    await api.execute("run-1", "item-1", "etag-1", "passed");
    await api.executions("run-1", "item-1");
    await api.complete("run-1");

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "if-match": "etag-1" }),
      }),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/test-runs/run-1/items/item-1/executions");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/test-runs/run-1/complete");
  });

  it("sends evidence and issue URLs with an execution", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    await api.execute("run-1", "item-1", "etag-1", "passed", {
      evidenceUrl: "https://example.test/evidence.png",
      issueTicketUrl: "https://example.test/issues/42",
    });

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          itemId: "item-1",
          status: "passed",
          evidenceUrl: "https://example.test/evidence.png",
          issueTicketUrl: "https://example.test/issues/42",
        }),
      }),
    );
  });

  it("lists runs and sends lifecycle requests", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));

    await api.listRuns({ state: "inProgress", limit: 10 });
    await api.execute("run-1", "item-1", "etag-1", "failed", "HTTP 500");
    await api.cancel("run-1");
    await api.reopen("run-1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/test-runs?state=inProgress&limit=10");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ itemId: "item-1", status: "failed", comment: "HTTP 500" }) }),
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/test-runs/run-1/cancel");
    expect(fetchMock.mock.calls[3]?.[0]).toBe("/api/test-runs/run-1/reopen");
  });

  it("throws the API error message for failed responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: "invalid request" }),
    });

    await expect(api.listPullRequests()).rejects.toThrow("invalid request");
  });
});
