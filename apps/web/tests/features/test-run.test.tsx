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
  vi.restoreAllMocks();
});

describe("test run feature", () => {
  it("reviews missing metadata before completing and includes versions/browser in the PR report", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: {
          id: "run-1",
          state: "inProgress",
          makerVersion: "maker-2",
          browser: "Firefox 140",
          appVersionBefore: "1.0",
          appVersionAfter: "2.0",
          sourceCommitId: "selected-sha",
        },
        suites: [],
        items: [
          {
            value: { id: "item-1", suiteId: "suite", hierarchy: [], text: "Done", status: "passed" },
            etag: "etag",
          },
        ],
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderApp("/test-runs/run-1");
    fireEvent.click(await screen.findByRole("button", { name: "Complete test run" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("対象環境: 未記録"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Viewer版: 未記録"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "PR 用の結果概要をコピー" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]?.[0]).toContain("makerVersion: maker-2");
    expect(writeText.mock.calls[0]?.[0]).toContain("browser: Firefox 140");
    expect(writeText.mock.calls[0]?.[0]).toContain("appVersionAfter: 2.0");
    expect(writeText.mock.calls[0]?.[0]).toContain("Definition: selected-sha");
  });

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

  it("requires and sends a comment for failed execution", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: { id: "run-1", state: "inProgress", sourceType: "github" },
          suites: [],
          items: [
            {
              value: { id: "item-1", suiteId: "smoke", hierarchy: [], text: "Can login", status: "pending" },
              etag: "etag-1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}));

    renderApp("/test-runs/run-1");

    expect(await screen.findByText("Can login")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "failed" }));
    expect(screen.getByRole("button", { name: "Save failed" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("実施メモ（必須）"), { target: { value: "HTTP 500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save failed" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({ body: JSON.stringify({ itemId: "item-1", status: "failed", comment: "HTTP 500" }) }),
      ),
    );
  });

  it("allows evidence to be attached to a passing result", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: { id: "run-1", state: "inProgress" },
          suites: [],
          items: [
            {
              value: { id: "item-1", suiteId: "smoke", hierarchy: [], text: "Can login", status: "pending" },
              etag: "etag-1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}));

    renderApp("/test-runs/run-1");

    expect(await screen.findByText("Can login")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "passed" }));
    fireEvent.change(screen.getByLabelText("証跡 URL"), { target: { value: "https://example.test/evidence.png" } });
    fireEvent.change(screen.getByLabelText("障害チケット URL"), {
      target: { value: "https://example.test/issues/42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save passed" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({
          body: JSON.stringify({
            itemId: "item-1",
            status: "passed",
            evidenceUrl: "https://example.test/evidence.png",
            issueTicketUrl: "https://example.test/issues/42",
          }),
        }),
      ),
    );
  });
});
