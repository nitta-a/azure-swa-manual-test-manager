import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderApp } from "./test-helpers";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App routes", () => {
  it("uses the pull request view for the fallback route", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    renderApp("/unknown");

    expect(await screen.findByRole("heading", { name: "Pull requests" })).toBeTruthy();
  });
});
