import { cleanup, screen } from "@testing-library/react";
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

describe("test runs dashboard", () => {
  it("shows active and recent runs with progress and status", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            runId: "active-run",
            projectId: "default",
            sourceType: "github",
            releaseName: "Release 2",
            environmentUrl: "https://staging.test",
            browser: "Firefox 140",
            pullRequestId: 142,
            state: "inProgress",
            startedBy: "alice",
            startedAt: "2026-01-01T00:00:00.000Z",
            totalCount: 4,
            pendingCount: 1,
            passedCount: 2,
            failedCount: 1,
            blockedCount: 0,
            skippedCount: 0,
          },
          {
            runId: "recent-run",
            projectId: "default",
            sourceType: "appManaged",
            state: "completed",
            result: "failed",
            startedBy: "bob",
            startedAt: "2026-01-01T00:00:00.000Z",
            totalCount: 2,
            pendingCount: 0,
            passedCount: 1,
            failedCount: 1,
            blockedCount: 0,
            skippedCount: 0,
          },
        ],
      }),
    );

    renderApp("/test-runs");

    expect(await screen.findByText("PR #142")).toBeTruthy();
    expect(screen.getByText("Active runs")).toBeTruthy();
    expect(screen.getByText("Recent runs")).toBeTruthy();
    expect(screen.getByText("inProgress")).toBeTruthy();
    expect(screen.getByText("failed")).toBeTruthy();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(screen.getByText("Release 2", { exact: false }).textContent).toContain("https://staging.test");
    expect(screen.getByText("Release 2", { exact: false }).textContent).toContain("Firefox 140");
  });
});
