import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "./test-helpers";

const fetchMock = vi.fn();

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("application entry point", () => {
  it("mounts the app into the root element", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await import("../src/main");

    expect(await screen.findByRole("heading", { name: "Pull requests" })).toBeTruthy();
  });
});
