import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PullRequestsView } from "../../src/features/pull-requests/PullRequestsView";
import { jsonResponse, renderRoute } from "../test-helpers";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pull requests feature", () => {
  it("renders pull requests returned by the API", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 42,
          title: "Add login",
          sourceBranch: "refs/heads/feature/login",
          targetBranch: "refs/heads/main",
          sourceCommitId: "commit-1",
        },
      ]),
    );

    renderRoute(<PullRequestsView />, "/pull-requests", "/pull-requests");

    expect(await screen.findByRole("link", { name: /#42 Add login/ })).toBeTruthy();
    expect(screen.getByText("refs/heads/feature/login → refs/heads/main")).toBeTruthy();
  });
});
