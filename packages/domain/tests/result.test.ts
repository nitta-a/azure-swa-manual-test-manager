import { expect, test } from "vitest";
import { calculateRunResult, hasPendingItems } from "../dist/index.js";

test("failed wins over blocked and skipped", () => {
  expect(
    calculateRunResult(["passed", "blocked", "failed", "skipped"]),
  ).toBe("failed");
});

test("blocked wins when there are no failures", () => {
  expect(calculateRunResult(["passed", "blocked", "skipped"])).toBe(
    "blocked",
  );
});

test("skipped does not fail a run", () => {
  expect(calculateRunResult(["passed", "skipped"])).toBe("passed");
  expect(hasPendingItems(["passed", "pending"])).toBe(true);
});
