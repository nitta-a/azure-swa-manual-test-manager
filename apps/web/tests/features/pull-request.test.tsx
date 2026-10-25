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
  it("selects the deck chapter without selecting sibling ReleaseCheck chapters", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          pullRequest: { id: 42, title: "Release", sourceCommitId: "selected-sha" },
          suites: [
            {
              id: "release",
              title: "ReleaseCheck",
              path: "ReleaseCheck.md",
              sourceMarkdown: "",
              items: [
                { id: "release:0", hierarchy: ["ReleaseCheck", "テスト実行環境"], text: "Chrome" },
                { id: "release:1", hierarchy: ["ReleaseCheck", "デッキ", "編集"], text: "Save deck" },
                { id: "release:2", hierarchy: ["ReleaseCheck", "デッキ", "表示"], text: "Open deck" },
                { id: "release:3", hierarchy: ["ReleaseCheck", "翻訳機能"], text: "Translate" },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce({
        ...jsonResponse({ error: "test definition changed; reload and select the test items again" }),
        ok: false,
        status: 409,
      });
    renderApp("/pull-requests/42");
    fireEvent.click(await screen.findByRole("checkbox", { name: "デッキ" }));
    expect(screen.getByRole("checkbox", { name: /Chrome/ })).toHaveProperty("checked", false);
    expect(screen.getByRole("checkbox", { name: /Translate/ })).toHaveProperty("checked", false);
    fireEvent.click(screen.getByRole("button", { name: "テスト開始" }));
    await screen.findByText(/test definition changed/);
    const startRequest = fetchMock.mock.calls.find(([path]) => path === "/api/test-runs");
    expect(JSON.parse(startRequest?.[1].body)).toMatchObject({
      expectedDefinitionVersion: "selected-sha",
      itemIds: ["release:1", "release:2"],
    });
  });

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
          suites: [
            {
              id: "smoke",
              title: "Smoke",
              path: "smoke.md",
              sourceMarkdown: "## Login\n- [ ] Can login",
              items: [{ id: "smoke:0", hierarchy: ["Login"], text: "Can login", order: 0 }],
            },
          ],
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

    const checkboxes = await screen.findAllByRole("checkbox");
    const startButton = screen.getByRole("button", { name: "テスト開始" });
    expect((startButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(checkboxes[0] as HTMLInputElement);
    expect((startButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(startButton);

    await screen.findByRole("heading", { name: "Test run" });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/test-runs", expect.objectContaining({ method: "POST" })),
    );
    const startRequest = fetchMock.mock.calls.find(([path]) => path === "/api/test-runs");
    expect(JSON.parse(startRequest?.[1].body)).toMatchObject({
      expectedDefinitionVersion: "commit-1",
      itemIds: ["smoke:0"],
    });
  });
});
