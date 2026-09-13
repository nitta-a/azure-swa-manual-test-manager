import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";
import { jsonResponse } from "./test-helpers";

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
      .mockResolvedValueOnce(jsonResponse({ pullRequest: {}, suites: [] }));

    await api.listPullRequests();
    await api.getDefinition("42");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/projects/default/pull-requests");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/projects/default/pull-requests/42/test-definition");
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

  it("throws the API error message for failed responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: "invalid request" }),
    });

    await expect(api.listPullRequests()).rejects.toThrow("invalid request");
  });
});
