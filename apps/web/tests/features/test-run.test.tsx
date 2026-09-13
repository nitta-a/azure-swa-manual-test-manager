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

describe("test run feature", () => {
  it("loads execution history for a test item", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: {
            id: "run-1",
            state: "inProgress",
            sourceCommitId: "commit-1",
          },
          suites: [],
          items: [
            {
              value: {
                id: "item-1",
                suiteId: "smoke",
                hierarchy: ["Login"],
                text: "Can login",
                status: "pending",
              },
              etag: "etag-1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            value: {
              id: "execution-1",
              status: "passed",
              executedBy: "alice",
              executedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        ]),
      );

    renderApp("/test-runs/run-1");

    expect(await screen.findByText("Can login")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "履歴" }));

    expect(await screen.findByText(/alice/)).toBeTruthy();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/test-runs/run-1/items/item-1/executions", expect.anything()),
    );
  });
});
