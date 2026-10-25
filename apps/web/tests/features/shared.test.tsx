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

  it("renders a page title and a link back to runs", () => {
    render(
      <MemoryRouter>
        <Page title="詳細" description="画面の説明">
          content
        </Page>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "詳細" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Manual Test Manager/ }).getAttribute("href")).toBe("/test-runs");
    expect(screen.getByRole("navigation", { name: "メインメニュー" })).toBeTruthy();
    expect(screen.getByText("画面の説明")).toBeTruthy();
    expect(screen.getByText("content")).toBeTruthy();
  });
});
