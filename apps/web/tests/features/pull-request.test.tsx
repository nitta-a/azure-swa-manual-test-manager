import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderApp } from "../test-helpers";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pull request feature", () => {
  it("starts a run with the selected suites", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          pullRequest: {
            id: 42,
            title: "Add login",
            sourceBranch: "refs/heads/feature/login",
            targetBranch: "refs/heads/main",
            sourceCommitId: "commit-1",
          },
          suites: [{ id: "smoke", title: "Smoke", path: "smoke.md" }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: { id: "run-1" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          value: {
            id: "run-1",
            state: "inProgress",
            sourceCommitId: "commit-1",
          },
          suites: [],
          items: [],
        }),
      );

    renderApp("/pull-requests/42");

    const checkbox = await screen.findByRole("checkbox");
    const startButton = screen.getByRole("button", { name: "テスト開始" });
    expect((startButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(checkbox);
    expect((startButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(startButton);

    await screen.findByRole("heading", { name: "Test run" });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/test-runs", expect.objectContaining({ method: "POST" })),
    );
  });
});
