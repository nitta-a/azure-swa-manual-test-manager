import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorMessage } from "../../src/features/shared/ErrorMessage";
import { Page } from "../../src/features/shared/Page";

afterEach(cleanup);

describe("shared views", () => {
  it("renders an error message only when an error exists", () => {
    const { rerender } = render(<ErrorMessage error={new Error("failed")} />);
    expect(screen.getByRole("alert").textContent).toBe("failed");

    rerender(<ErrorMessage error={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders a page title and a link back to pull requests", () => {
    render(
      <MemoryRouter>
        <Page title="Details">content</Page>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Details" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manual Test Manager" }).getAttribute("href")).toBe("/pull-requests");
    expect(screen.getByText("content")).toBeTruthy();
  });
});
