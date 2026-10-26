import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { type PickableFeature, TestItemPicker } from "../src/features/shared/TestItemPicker";

afterEach(cleanup);

function featuresWithItems(count: number): PickableFeature[] {
  return [
    {
      id: "auth",
      title: "Authentication",
      applicationId: "maker",
      applicationTitle: "Maker",
      items: Array.from({ length: count }, (_, index) => ({
        id: `auth:${index}`,
        hierarchy: ["Sign in"],
        text: `Case ${index}`,
      })),
    },
  ];
}

test("handles a 1,000-item search without rendering every result and selects all matches", () => {
  let selected: string[] = [];
  const { container, rerender } = render(
    <TestItemPicker
      features={featuresWithItems(1000)}
      selectedItemIds={selected}
      onChange={(ids) => (selected = ids)}
    />,
  );

  expect(container.querySelectorAll(".picker-item-results li")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /機能選択へ/ }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Case" } });

  expect(screen.getByText("1000 件が該当（100 件を表示）")).toBeTruthy();
  expect(container.querySelectorAll(".picker-item-results li")).toHaveLength(100);
  fireEvent.click(screen.getByRole("button", { name: "該当 1000 件をすべて選択" }));
  rerender(
    <TestItemPicker
      features={featuresWithItems(1000)}
      selectedItemIds={selected}
      onChange={(ids) => (selected = ids)}
    />,
  );

  expect(selected).toHaveLength(1000);
  expect(screen.getByText("選択中: 1000 件")).toBeTruthy();
});

test("keeps selections across filtering and shows feature partial selection", () => {
  let selected: string[] = [];
  const features = featuresWithItems(2);
  const { rerender } = render(
    <TestItemPicker features={features} selectedItemIds={selected} onChange={(ids) => (selected = ids)} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /機能選択へ/ }));
  fireEvent.click(screen.getByRole("button", { name: "個別項目を調整" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Case 0/ }));
  rerender(<TestItemPicker features={features} selectedItemIds={selected} onChange={(ids) => (selected = ids)} />);

  const featureCheckbox = screen.getByRole("checkbox", { name: "Authenticationを選択" }) as HTMLInputElement;
  expect(featureCheckbox.indeterminate).toBe(true);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Case 1" } });
  expect(screen.getByRole("checkbox", { name: /Case 1/ })).toBeTruthy();
  expect(screen.getByText("選択中: 1 件")).toBeTruthy();
  expect(selected).toEqual(["auth:0"]);
});

test("review groups selected items by application and supports bulk removal", () => {
  const features = featuresWithItems(2);
  const selected = ["auth:0", "auth:1"];
  render(<TestItemPicker features={features} selectedItemIds={selected} onChange={() => undefined} />);
  fireEvent.click(screen.getAllByRole("button", { name: /選択内容を確認/ }).at(-1) as HTMLButtonElement);

  const review = screen.getByRole("heading", { name: "Maker" }).parentElement;
  expect(review).toBeTruthy();
  expect(within(review as HTMLElement).getByRole("heading", { name: "Authentication (2)" })).toBeTruthy();
  expect(within(review as HTMLElement).getByRole("button", { name: "この機能の選択を解除" })).toBeTruthy();
});
